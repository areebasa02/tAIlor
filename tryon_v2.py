"""Commercial-Safe Unified Virtual Try-On Engine for tAIlor (FireRed-Image-Edit-1.1, Apache 2.0).

Architecture (Windows 11 + RTX 5090 Laptop 24 GB VRAM, co-resident with 4-bit Qwen2.5-3B + Qwen2.5-VL-3B):
  - Path A (Preset-Pose Studio Try-On):
      * Pre-rendered canonical studio pose templates in `public/studio_poses/*.png` (0ms Stage 1, zero anatomy bugs).
  - Path B (Direct User Photo Try-On):
      * Uses the user's uploaded full-body photo directly (EXIF-normalized, aligned to strict 32px multiples).
  - Multi-Garment & Open-Front Outerwear Conditioning:
      * `ZhengPeng7/BiRefNet_lite` (MIT, fp16, CPU-parked between calls) cuts out each garment onto neutral `#F2F2F2`.
      * Deterministic 2D OOTD Reference Collage (`896x896`) + Layer-Aware Roll-Call Prompting handles
        Top + Bottom (or Full Body Dress/Jumpsuit) + Open-Front Outerwear + Shoes in a single diffusion pass.
  - Editing DiT:
      * `FireRedTeam/FireRed-Image-Edit-1.1` (Apache 2.0, 4-bit NF4 via BitsAndBytesConfig + stage-level CPU offload)
      * `FireRedTeam/FireRed-Image-Edit-1.1-ComfyUI` (`FireRed-Image-Edit-1.1-Lightning-8steps-v1.2.safetensors`, Apache 2.0)
      * Peak VRAM ~12.5 GB, ~42s warm (6 steps) on RTX 5090 Laptop.
"""

from __future__ import annotations

import base64
import gc
import io
import math
import os
import random
import threading
import time
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

import cv2
import numpy as np
import torch
from PIL import Image, ImageOps

from fastfit_vton import AI_DISCLOSURE_BADGE

ROOT_DIR = Path(__file__).resolve().parent
STUDIO_POSES_DIR = ROOT_DIR / "public" / "studio_poses"
MANNEQUINS_DIR = ROOT_DIR / "public" / "mannequins"

TRYON_EDIT_MODEL = os.environ.get("TRYON_EDIT_MODEL", "FireRedTeam/FireRed-Image-Edit-1.1")
TRYON_LIGHTNING_REPO = os.environ.get("TRYON_LIGHTNING_REPO", "FireRedTeam/FireRed-Image-Edit-1.1-ComfyUI")
TRYON_LIGHTNING_WEIGHT = os.environ.get(
    "TRYON_LIGHTNING_WEIGHT",
    "FireRed-Image-Edit-1.1-Lightning-8steps-v1.2.safetensors",
)
TRYON_BIREFNET_MODEL = os.environ.get("TRYON_BIREFNET_MODEL", "ZhengPeng7/BiRefNet_lite")
TRYON_STEPS = max(4, min(12, int(os.environ.get("TRYON_STEPS", "6"))))
TRYON_TARGET_PIXELS = int(os.environ.get("TRYON_TARGET_PIXELS", str(768 * 1024)))
TRYON_COLLAGE_SIZE = int(os.environ.get("TRYON_COLLAGE_SIZE", "896"))

_firered_pipe: Any = None
_birefnet_model: Any = None
_load_lock = threading.Lock()

# Map UI body-shape labels / preset IDs to static mannequin body slugs
_MANNEQUIN_BODY_ALIASES: dict[str, str] = {
    "petite": "petite",
    "standard": "standard",
    "average": "standard",
    "regular": "standard",
    "curvy": "curvy",
    "plus": "curvy",
    "tall": "tall",
    "tall / broad": "tall",
    "tall/broad": "tall",
    "broad": "tall",
    "athletic": "tall",
}

# Map UI pose labels / preset IDs to static mannequin pose slugs
_MANNEQUIN_POSE_ALIASES: dict[str, str] = {
    "standing": "standing",
    "classic": "standing",
    "classic studio": "standing",
    "classic neutral": "standing",
    "neutral": "standing",
    "hands_on_hips": "hands_on_hips",
    "hands on hips": "hands_on_hips",
    "on hips": "hands_on_hips",
    "relaxed": "relaxed",
    "contrapposto": "relaxed",
    "editorial": "relaxed",
    "streetwear": "relaxed",
    "casual": "relaxed",
    "sitting": "sitting",
    "seated": "sitting",
    "chair": "sitting",
    "wheelchair": "sitting",
}

# Legacy fallback aliases for public/studio_poses/*.png if mannequins folder is missing
_POSE_TEMPLATE_ALIASES: dict[str, str] = {
    "classic": "classic",
    "classic neutral": "classic",
    "neutral": "classic",
    "standing": "classic",
    "contrapposto": "contrapposto",
    "editorial": "contrapposto",
    "editorial contrapposto": "contrapposto",
    "relaxed": "contrapposto",
    "hands_on_hips": "hands_on_hips",
    "hands on hips": "hands_on_hips",
    "on hips": "hands_on_hips",
    "runway": "runway",
    "runway walk": "runway",
    "streetwear": "streetwear",
    "casual": "streetwear",
    "streetwear casual": "streetwear",
    "power": "power",
    "power stance": "power",
    "wave": "wave",
    "friendly wave": "wave",
}

_BACKDROP_DESCRIPTIONS: dict[str, str] = {
    "cyclorama": "clean evenly lit light gray studio cyclorama background",
    "warm_editorial": "warm neutral stone studio backdrop with soft editorial lighting",
    "golden_hour": "soft warm golden-hour studio lighting against a light neutral backdrop",
    "cool_daylight": "crisp cool daylight studio backdrop",
    "midnight": "sleek dark charcoal-navy studio backdrop with soft rim lighting",
}


def is_tryon_loaded() -> bool:
    return _firered_pipe is not None


def get_tryon_model_summary() -> str:
    short = TRYON_EDIT_MODEL.split("/")[-1]
    return f"{short} (Apache 2.0, NF4 + {TRYON_STEPS}-step Lightning) + BiRefNet_lite OOTD Collage"


def render_openpose_from_keypoints(
    keypoints: Mapping[str, Sequence[float]] | None = None,
    *,
    width: int = 768,
    height: int = 1024,
    include_face_features: bool = False,
    is_back_view: bool = False,
    hand_foot_preset: str = "neutral",
) -> Image.Image:
    """Lightweight compatibility stub (FireRed-1.1 does not require OpenPose ControlNet)."""
    return Image.new("RGB", (width, height), (0, 0, 0))


def _align_size_32(w: int, h: int, target_pixels: int = TRYON_TARGET_PIXELS) -> tuple[int, int]:
    """Scale preserving aspect ratio to ~target_pixels with strict 32px multiples (prevents pixel shift)."""
    scale = math.sqrt(target_pixels / max(1, w * h))
    new_w = max(512, int(round((w * scale) / 32.0)) * 32)
    new_h = max(512, int(round((h * scale) / 32.0)) * 32)
    return new_w, new_h


def _encode_preview_jpg(img: Image.Image, max_side: int = 384) -> str:
    thumb = img.convert("RGB").copy()
    thumb.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    thumb.save(buf, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _resolve_mannequin_template(
    body_preset: str | None,
    pose_label: str | None,
) -> tuple[Image.Image, str, bool]:
    raw_body = (body_preset or "standard").strip().lower()
    body_slug = _MANNEQUIN_BODY_ALIASES.get(raw_body)
    if body_slug is None:
        for key, mapped in _MANNEQUIN_BODY_ALIASES.items():
            if key in raw_body:
                body_slug = mapped
                break
    body_slug = body_slug or "standard"

    raw_pose = (pose_label or "standing").strip().lower()
    pose_slug = _MANNEQUIN_POSE_ALIASES.get(raw_pose)
    if pose_slug is None:
        for key, mapped in _MANNEQUIN_POSE_ALIASES.items():
            if key in raw_pose:
                pose_slug = mapped
                break
    pose_slug = pose_slug or "standing"

    for candidate in (
        MANNEQUINS_DIR / f"{body_slug}_{pose_slug}.png",
        MANNEQUINS_DIR / f"standard_{pose_slug}.png",
        MANNEQUINS_DIR / "standard_standing.png",
    ):
        if candidate.exists():
            return Image.open(candidate).convert("RGB"), f"{body_slug}_{pose_slug}", True

    img, fallback_slug = _resolve_studio_pose_template(pose_label)
    return img, fallback_slug, False


def _resolve_studio_pose_template(pose_label: str | None) -> tuple[Image.Image, str]:
    raw = (pose_label or "classic").strip().lower()
    slug = _POSE_TEMPLATE_ALIASES.get(raw)
    if slug is None:
        for key, mapped in _POSE_TEMPLATE_ALIASES.items():
            if key in raw:
                slug = mapped
                break
    slug = slug or "classic"
    candidate = STUDIO_POSES_DIR / f"{slug}.png"
    if not candidate.exists():
        candidate = STUDIO_POSES_DIR / "classic.png"
    if not candidate.exists():
        raise RuntimeError(
            f"Pre-rendered studio pose template missing at {candidate}. "
            "Run the studio pose generator or upload a user photo."
        )
    return Image.open(candidate).convert("RGB"), slug


def _load_birefnet(hf_token: str | None = None) -> Any:
    global _birefnet_model
    if _birefnet_model is not None:
        return _birefnet_model
    from transformers import AutoModelForImageSegmentation

    kwargs: dict[str, Any] = {"trust_remote_code": True}
    if hf_token:
        kwargs["token"] = hf_token
    print(f"[TryOn-v2] Loading {TRYON_BIREFNET_MODEL} (MIT, fp16)...", flush=True)
    _birefnet_model = (
        AutoModelForImageSegmentation.from_pretrained(TRYON_BIREFNET_MODEL, **kwargs)
        .eval()
        .to(torch.float16)
    )
    return _birefnet_model


def _load_firered_pipeline(hf_token: str | None = None) -> Any:
    global _firered_pipe
    if _firered_pipe is not None:
        return _firered_pipe

    from diffusers import (
        BitsAndBytesConfig as DiffusersBitsAndBytesConfig,
        FlowMatchEulerDiscreteScheduler,
        QwenImageEditPlusPipeline,
    )
    from diffusers.quantizers import PipelineQuantizationConfig
    from transformers import BitsAndBytesConfig as TFBitsAndBytesConfig

    t0 = time.perf_counter()
    print(f"[TryOn-v2] Loading {TRYON_EDIT_MODEL} in 4-bit NF4...", flush=True)
    quant_cfg = PipelineQuantizationConfig(
        quant_mapping={
            "transformer": DiffusersBitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
                llm_int8_skip_modules=["transformer_blocks.0.img_mod"],
            ),
            "text_encoder": TFBitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
            ),
        }
    )
    hf_kwargs: dict[str, Any] = {"token": hf_token} if hf_token else {}
    pipe = QwenImageEditPlusPipeline.from_pretrained(
        TRYON_EDIT_MODEL,
        quantization_config=quant_cfg,
        torch_dtype=torch.bfloat16,
        **hf_kwargs,
    )
    pipe.scheduler = FlowMatchEulerDiscreteScheduler.from_config(
        pipe.scheduler.config,
        time_shift_type="exponential",
        base_shift=math.log(3),
        use_dynamic_shifting=True,
    )
    if TRYON_LIGHTNING_REPO and TRYON_LIGHTNING_WEIGHT:
        print(f"[TryOn-v2] Loading Apache-2.0 Lightning LoRA ({TRYON_LIGHTNING_WEIGHT})...", flush=True)
        pipe.load_lora_weights(
            TRYON_LIGHTNING_REPO,
            weight_name=TRYON_LIGHTNING_WEIGHT,
            adapter_name="lightning",
            **hf_kwargs,
        )
        pipe.set_adapters(["lightning"], adapter_weights=[1.0])

    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    _firered_pipe = pipe
    print(f"[TryOn-v2] Ready in {time.perf_counter() - t0:.1f}s ({get_tryon_model_summary()})", flush=True)
    return _firered_pipe


def warmup_tryon_pipelines(
    hf_token: str | None = None,
    coresident_gpu: bool = True,
) -> None:
    """Pre-warm BiRefNet_lite and FireRed-Image-Edit-1.1 (NF4 + stage CPU offload)."""
    del coresident_gpu
    with _load_lock:
        _load_birefnet(hf_token=hf_token)
        _load_firered_pipeline(hf_token=hf_token)


@torch.inference_mode()
def _cutout_garment_birefnet(
    img: Image.Image,
    hf_token: str | None = None,
    bg_rgb: tuple[int, int, int] = (242, 242, 242),
) -> Image.Image:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _load_birefnet(hf_token=hf_token)
    model.to(device)
    try:
        size = 768
        arr = np.array(img.convert("RGB").resize((size, size), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        tensor = torch.from_numpy(((arr - mean) / std).transpose(2, 0, 1)).unsqueeze(0)
        tensor = tensor.to(device, dtype=torch.float16 if device == "cuda" else torch.float32)
        preds = model(tensor)[-1].sigmoid().float().cpu().squeeze().numpy()
    finally:
        if device == "cuda":
            model.to("cpu")
            torch.cuda.empty_cache()

    alpha = cv2.resize(preds, img.size, interpolation=cv2.INTER_LINEAR)
    fg = np.array(img.convert("RGB"), dtype=np.float32)
    bg = np.full_like(fg, bg_rgb, dtype=np.float32)
    comp = (fg * alpha[..., None] + bg * (1.0 - alpha[..., None])).clip(0, 255).astype(np.uint8)
    ys, xs = np.where(alpha > 0.15)
    if len(xs) > 10 and len(ys) > 10:
        pad = 16
        x0, x1 = max(0, int(xs.min()) - pad), min(comp.shape[1], int(xs.max()) + pad)
        y0, y1 = max(0, int(ys.min()) - pad), min(comp.shape[0], int(ys.max()) + pad)
        comp = comp[y0:y1, x0:x1]
    return Image.fromarray(comp)


def _normalize_slot(raw_type: str, desc: str) -> str:
    t = (raw_type or "").strip().lower()
    d = (desc or "").strip().lower()
    if any(k in t for k in ("full", "dress", "overall", "jumpsuit")) or any(
        k in d for k in ("dress", "gown", "jumpsuit", "romper", "boilersuit", "coverall", "overall")
    ):
        return "full_body"
    if any(k in t for k in ("outer", "jacket", "coat", "blazer")) or any(
        k in d for k in ("trench", "coat", "jacket", "blazer", "hoodie", "cardigan", "parka")
    ):
        return "outerwear"
    if any(k in t for k in ("bottom", "pant", "trouser", "jean", "skirt", "short")) or any(
        k in d for k in ("trouser", "pant", "jean", "chino", "skirt", "denim", "short")
    ):
        return "bottom"
    if any(k in t for k in ("shoe", "boot", "sneaker", "loafer", "heel", "flat")) or any(
        k in d for k in ("shoe", "boot", "sneaker", "loafer", "oxford", "mary jane", "heel", "sandal")
    ):
        return "shoes"
    if any(k in t for k in ("accessor", "bag", "tote", "belt", "watch", "earring", "necklace", "bracelet")):
        return "accessory"
    return "top"


def _build_ootd_collage(
    garment_imgs: Sequence[Image.Image],
    hf_token: str | None = None,
    canvas_size: int = TRYON_COLLAGE_SIZE,
) -> Image.Image:
    bg_color = (242, 242, 242)
    canvas = Image.new("RGB", (canvas_size, canvas_size), bg_color)
    items = list(garment_imgs[:4])
    n = len(items)
    if n == 0:
        return canvas
    cols = 1 if n == 1 else 2
    rows = 1 if n <= 2 else 2
    cell_w, cell_h = canvas_size // cols, canvas_size // rows
    margin = 20
    for idx, g_img in enumerate(items):
        cut = _cutout_garment_birefnet(g_img, hf_token=hf_token, bg_rgb=bg_color)
        cut.thumbnail((cell_w - 2 * margin, cell_h - 2 * margin), Image.Resampling.LANCZOS)
        r, c = divmod(idx, cols)
        ox = c * cell_w + (cell_w - cut.width) // 2
        oy = r * cell_h + (cell_h - cut.height) // 2
        canvas.paste(cut, (ox, oy))
    return canvas


def _build_roll_call_prompt(
    ordered_items: list[dict[str, Any]],
    *,
    is_user_photo: bool,
    is_mannequin: bool = False,
    is_sitting: bool = False,
    fit_style: str | None,
    backdrop_preset: str | None,
) -> str:
    has_outerwear = any(it["slot"] == "outerwear" for it in ordered_items)
    has_inner = any(it["slot"] in {"top", "full_body"} for it in ordered_items)

    if is_user_photo:
        anchor = (
            "Preserve the exact person, face, glasses if worn, hairstyle, skin tone, exact natural body shape and proportions, "
            "standing or seated pose, hands, any chair or wheelchair if present, and original background from Picture 1. "
            "Completely remove all of their original clothing and shoes, and dress them in the complete outfit shown in Picture 2: "
        )
    elif is_mannequin:
        if is_sitting:
            anchor = (
                "Preserve the exact featureless matte studio mannequin, body shape, proportions, seated pose on the studio stool, "
                "hands, feet, and clean light gray studio background from Picture 1. "
                "Completely replace the mannequin's plain base tank top and leggings with the complete outfit shown in Picture 2: "
            )
        else:
            anchor = (
                "Preserve the exact featureless matte studio mannequin, body shape, proportions, pose, "
                "hands, feet, and clean light gray studio background from Picture 1. "
                "Completely replace the mannequin's plain base tank top and leggings with the complete outfit shown in Picture 2: "
            )
    else:
        bg_desc = _BACKDROP_DESCRIPTIONS.get(
            (backdrop_preset or "cyclorama").strip().lower(),
            _BACKDROP_DESCRIPTIONS["cyclorama"],
        )
        anchor = (
            f"Preserve the exact studio model, face, hairstyle, body proportions, pose, hands, and {bg_desc} from Picture 1. "
            "Completely replace the model's base tank top and leggings with the complete outfit shown in Picture 2: "
        )

    clauses: list[str] = []
    inner_idx: int | None = None
    outer_idx: int | None = None

    for idx, it in enumerate(ordered_items, 1):
        slot = it["slot"]
        desc = it["desc"]
        if slot == "full_body":
            inner_idx = idx
            clauses.append(f"({idx}) the {desc} worn as the main full-length garment")
        elif slot == "top":
            inner_idx = idx
            if has_outerwear:
                clauses.append(f"({idx}) the {desc} worn neatly as the inner top")
            else:
                clauses.append(f"({idx}) the {desc} worn on its own with no jacket or coat")
        elif slot == "outerwear":
            outer_idx = idx
            if has_inner and inner_idx is not None:
                clauses.append(
                    f"({idx}) the {desc} worn neatly on both shoulders, open and unbuttoned layered over ({inner_idx}) "
                    f"so the front of ({inner_idx}) stays clearly visible"
                )
            else:
                clauses.append(f"({idx}) the {desc} worn neatly on both shoulders")
        elif slot == "bottom":
            clauses.append(f"({idx}) the {desc}")
        elif slot == "shoes":
            clauses.append(f"({idx}) the {desc} on both feet")
        else:
            clauses.append(f"({idx}) the {desc}")

    layer_note = ""
    if inner_idx is not None and outer_idx is not None:
        layer_note = f" Layering order: ({inner_idx}) under ({outer_idx})."

    fit_note = ""
    fs = (fit_style or "").strip().lower()
    if fs == "fitted":
        fit_note = " Tailored, slightly fitted silhouette."
    elif fs == "relaxed":
        fit_note = " Comfortable, slightly relaxed drape."

    closing = (
        " Natural realistic fit draped cleanly on the mannequin's exact body shape, photorealistic fabric folds and shadows, clean studio fashion photography."
        if is_mannequin
        else " Natural realistic fit matching the person's exact body shape and posture, photorealistic fabric folds and shadows, crisp hands and face, clean natural photography."
    )

    return anchor + ", ".join(clauses) + "." + layer_note + fit_note + closing


def generate_sdxl_tryon(
    *,
    openpose_img: Image.Image | None = None,
    garments: Sequence[Any],
    load_rgba_fn: Callable[[Any], tuple[np.ndarray, np.ndarray] | None],
    depth_img: Image.Image | None = None,
    keypoints: Mapping[str, Sequence[float]] | None = None,
    body_sliders: Mapping[str, float] | None = None,
    subject_mode: str | None = None,
    hand_foot_preset: str | None = None,
    camera_preset: str | None = None,
    backdrop_preset: str | None = None,
    pose_label: str | None = None,
    body_preset: str | None = None,
    fit_style: str | None = None,
    material_id: str | None = None,
    include_my_face: bool = False,
    face_img: Image.Image | None = None,
    user_photo_img: Image.Image | None = None,
    photo_mode: str | None = None,
    seed: int | None = None,
    bypass_pose_cache: bool = False,
    hf_token: str | None = None,
    progress_cb: Callable[..., None] | None = None,
) -> dict[str, Any]:
    """Drop-in replacement for the legacy 2-stage SDXL+FastFit generator using FireRed-Image-Edit-1.1."""
    del openpose_img, depth_img, keypoints, body_sliders, subject_mode, hand_foot_preset
    del camera_preset, material_id, include_my_face, face_img, bypass_pose_cache

    def _emit(phase: str, label: str, percent: int, step: int = 0, total: int = 0) -> None:
        if progress_cb is not None:
            progress_cb(phase, label, percent, step, total)

    t_stage1 = time.perf_counter()
    norm_photo_mode = (photo_mode or "none").strip().lower()
    is_user_photo = user_photo_img is not None and norm_photo_mode in {"direct_photo", "repose_picture"}
    is_mannequin = False

    if is_user_photo:
        _emit("subject", "Preparing your photo…", 10)
        base_person = ImageOps.exif_transpose(user_photo_img).convert("RGB")
        pose_used = "direct_photo"
    else:
        _emit("subject", "Preparing studio mannequin…", 10)
        base_person, pose_used, is_mannequin = _resolve_mannequin_template(body_preset, pose_label)

    w, h = _align_size_32(*base_person.size, target_pixels=TRYON_TARGET_PIXELS)
    person_aligned = base_person.resize((w, h), Image.Resampling.LANCZOS)
    stage1_ms = int((time.perf_counter() - t_stage1) * 1000)

    # Resolve garment images in semantic layering order: top/full_body -> outerwear -> bottom -> shoes -> accessory
    slot_priority = {"full_body": 0, "top": 1, "outerwear": 2, "bottom": 3, "shoes": 4, "accessory": 5}
    resolved_items: list[dict[str, Any]] = []
    for g in garments:
        desc = str(getattr(g, "description", "") or "").strip()
        color_name = str(getattr(g, "color_name", "") or "").strip()
        material = str(getattr(g, "material", "") or "").strip()
        g_type = str(getattr(g, "type", "") or "").strip()
        slot = _normalize_slot(g_type, desc)

        rgba = load_rgba_fn(g)
        if rgba is None:
            continue
        rgb_f, _ = rgba
        pil_img = Image.fromarray((np.clip(rgb_f, 0.0, 1.0) * 255.0).astype(np.uint8), mode="RGB")

        label_parts = [p for p in (color_name, desc) if p and p.lower() not in desc.lower()] if color_name else [desc]
        full_desc = " ".join(label_parts).strip() or desc or g_type
        if material and material.lower() not in full_desc.lower() and len(material) <= 28:
            full_desc = f"{full_desc} ({material})"

        resolved_items.append({"slot": slot, "desc": full_desc, "image": pil_img, "prio": slot_priority.get(slot, 5)})

    if not resolved_items:
        raise RuntimeError("No valid garment images could be resolved for try-on.")

    resolved_items.sort(key=lambda x: x["prio"])
    # Cap at 4 items for the 2x2 OOTD collage (prioritizing clothing + shoes over small accessories)
    active_items = resolved_items[:4]

    _emit("collage", "Getting your clothes ready…", 20)
    with _load_lock:
        pipe = _load_firered_pipeline(hf_token=hf_token)

    collage = _build_ootd_collage([it["image"] for it in active_items], hf_token=hf_token, canvas_size=TRYON_COLLAGE_SIZE)
    prompt = _build_roll_call_prompt(
        active_items,
        is_user_photo=is_user_photo,
        is_mannequin=is_mannequin,
        is_sitting=pose_used.endswith("sitting"),
        fit_style=fit_style,
        backdrop_preset=backdrop_preset,
    )

    seed_val = int(seed) if seed is not None else random.randint(1, 2**31 - 1)
    steps = TRYON_STEPS

    def _step_cb(_pipe: Any, step_index: int, _timestep: Any, callback_kwargs: dict[str, Any]) -> dict[str, Any]:
        cur = step_index + 1
        pct = 28 + int(round((cur / max(1, steps)) * 66))
        _emit("denoising", f"Fitting your outfit (step {cur} of {steps})…", pct, cur, steps)
        return callback_kwargs

    _emit("denoising", f"Starting outfit preview (step 0 of {steps})…", 26, 0, steps)
    t_stage2 = time.perf_counter()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    gen = torch.Generator(device=device).manual_seed(seed_val)

    with torch.inference_mode():
        out_img: Image.Image = pipe(
            image=[person_aligned, collage],
            prompt=prompt,
            width=w,
            height=h,
            num_inference_steps=steps,
            true_cfg_scale=1.0,
            guidance_scale=1.0,
            generator=gen,
            callback_on_step_end=_step_cb,
        ).images[0]

    stage2_ms = int((time.perf_counter() - t_stage2) * 1000)
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    _emit("finalizing", "Finalizing high-resolution try-on preview…", 96)
    return {
        "image": out_img,
        "model": get_tryon_model_summary(),
        "runs": 1,
        "passes": 1,
        "stage1Cached": True,
        "stage1Ms": stage1_ms,
        "stage2Ms": stage2_ms,
        "faceRefined": False,
        "photoMode": "direct_photo" if is_user_photo else f"studio_template:{pose_used}",
        "dwposePreview": _encode_preview_jpg(person_aligned),
        "depthPreview": _encode_preview_jpg(collage),
        "maskPreview": _encode_preview_jpg(collage),
        "aiDisclosure": "AI-Generated Preview · FireRed-1.1 (Apache 2.0)",
    }
