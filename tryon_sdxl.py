"""Local SDXL + OpenPose ControlNet + IP-Adapter generation for tAIlor Try-On Studio.

Replaces 3D rendering with genuine pose-conditioned studio fashion generation on local CUDA:
  - Base diffusion: SG161222/RealVisXL_V4.0 (fp16) + madebyollin/sdxl-vae-fp16-fix
  - Pose control:   xinsir/controlnet-openpose-sdxl-1.0
  - Outfit / face:  h94/IP-Adapter (ip-adapter-plus_sdxl_vit-h + ip-adapter-plus-face_sdxl_vit-h)
"""

from __future__ import annotations

import colorsys
import gc
import math
import os
import random
from typing import Any, Callable

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw

TRYON_SDXL_MODEL = os.environ.get("TRYON_SDXL_MODEL", "SG161222/RealVisXL_V4.0")
TRYON_VAE_MODEL = os.environ.get("TRYON_VAE_MODEL", "madebyollin/sdxl-vae-fp16-fix")
TRYON_CONTROLNET_MODEL = os.environ.get(
    "TRYON_CONTROLNET_MODEL", "xinsir/controlnet-openpose-sdxl-1.0"
)
TRYON_IP_ADAPTER_REPO = os.environ.get("TRYON_IP_ADAPTER_REPO", "h94/IP-Adapter")
TRYON_IP_ADAPTER_WEIGHT = os.environ.get(
    "TRYON_IP_ADAPTER_WEIGHT", "ip-adapter-plus_sdxl_vit-h.safetensors"
)
TRYON_IP_ADAPTER_FACE_WEIGHT = os.environ.get(
    "TRYON_IP_ADAPTER_FACE_WEIGHT", "ip-adapter-plus-face_sdxl_vit-h.safetensors"
)
TRYON_IMAGE_ENCODER_SUBFOLDER = os.environ.get("TRYON_IMAGE_ENCODER_SUBFOLDER", "")


def _get_tryon_config() -> dict[str, str]:
    sdxl_model = os.environ.get("TRYON_SDXL_MODEL", TRYON_SDXL_MODEL)
    vae_model = os.environ.get("TRYON_VAE_MODEL", TRYON_VAE_MODEL)
    controlnet_model = os.environ.get("TRYON_CONTROLNET_MODEL", TRYON_CONTROLNET_MODEL)
    ip_repo = os.environ.get("TRYON_IP_ADAPTER_REPO", TRYON_IP_ADAPTER_REPO)
    ip_weight = os.environ.get("TRYON_IP_ADAPTER_WEIGHT", TRYON_IP_ADAPTER_WEIGHT)
    ip_face_weight = os.environ.get("TRYON_IP_ADAPTER_FACE_WEIGHT", TRYON_IP_ADAPTER_FACE_WEIGHT)
    # ViT-H IP-Adapters require the 632M ViT-H-14 encoder in models/image_encoder (hidden=1280, proj=1024),
    # whereas sdxl_models/image_encoder is ViT-bigG-14 (hidden=1664, proj=1280) for ip-adapter_sdxl only.
    default_encoder_subfolder = (
        "models/image_encoder"
        if "vit-h" in ip_weight.lower()
        else "sdxl_models/image_encoder"
    )
    encoder_subfolder = os.environ.get("TRYON_IMAGE_ENCODER_SUBFOLDER", "").strip() or default_encoder_subfolder
    return {
        "sdxl_model": sdxl_model,
        "vae_model": vae_model,
        "controlnet_model": controlnet_model,
        "ip_repo": ip_repo,
        "ip_weight": ip_weight,
        "ip_face_weight": ip_face_weight,
        "encoder_subfolder": encoder_subfolder,
    }

_sdxl_pipe: Any = None


def is_tryon_loaded() -> bool:
    return _sdxl_pipe is not None

_MATERIAL_PROMPTS: dict[str, str] = {
    "porcelain": "matte white porcelain mannequin dummy",
    "bisque": "matte blush bisque mannequin dummy",
    "sand": "carved honey wood mannequin dummy",
    "tan": "matte terracotta mannequin dummy",
    "espresso": "dark espresso wood mannequin dummy",
    "walnut": "matte rose clay mannequin dummy",
    "charcoal": "matte black obsidian mannequin dummy",
}

_BACKDROP_PROMPTS: dict[str, str] = {
    "cyclorama": "lavender-grey studio sweep, softbox light",
    "warm_editorial": "warm beige studio sweep, strobe light",
    "golden_hour": "warm amber golden studio sweep, sunlight",
    "cool_daylight": "pale-blue daylight studio sweep",
    "midnight": "dark charcoal indigo studio backdrop, rim light",
}

_CAMERA_PROMPTS: dict[str, str] = {
    "front": "front view",
    "three_quarter": "three-quarter view",
    "side": "side profile view",
    "low_angle": "low-angle full shot",
}

_BODY_PROMPTS: dict[str, str] = {
    "petite": "petite frame",
    "standard": "tailored proportions",
    "athletic": "athletic shoulders",
    "curvy": "curvy silhouette",
    "tall / broad": "tall runway frame",
    "tall": "tall runway frame",
}


def hex_to_color_hint(hex_str: str) -> str:
    cleaned = (hex_str or "").strip().lstrip("#")
    if len(cleaned) != 6:
        return ""
    try:
        r = int(cleaned[0:2], 16) / 255.0
        g = int(cleaned[2:4], 16) / 255.0
        b = int(cleaned[4:6], 16) / 255.0
    except ValueError:
        return ""

    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if v < 0.2:
        return "black"
    if v > 0.9 and s < 0.14:
        return "white"
    if s < 0.16:
        return "light grey" if v > 0.65 else ("charcoal" if v < 0.38 else "grey")
    if s < 0.35 and v > 0.72 and 0.06 <= h <= 0.16:
        return "cream"

    deg = h * 360.0
    prefix = "pastel " if (s < 0.45 and v > 0.72) else ("dark " if v < 0.38 else "")
    if deg < 15 or deg >= 345:
        hue_word = "pink" if s < 0.55 and v > 0.75 else "red"
    elif deg < 40:
        hue_word = "tan" if s < 0.55 and v > 0.6 else ("brown" if v < 0.55 else "orange")
    elif deg < 65:
        hue_word = "yellow"
    elif deg < 160:
        hue_word = "sage green" if s < 0.45 else "green"
    elif deg < 200:
        hue_word = "teal"
    elif deg < 255:
        hue_word = "navy" if v < 0.45 else "blue"
    elif deg < 295:
        hue_word = "lavender" if v > 0.68 else "purple"
    else:
        hue_word = "pink" if v > 0.65 else "magenta"
    return f"{prefix}{hue_word}".strip()


def normalize_slot_name(g_type: str, description: str) -> str:
    v = f"{g_type} {description}".lower()
    if any(k in v for k in ("outer", "trench", "coat", "blazer", "jacket", "cardigan", "hoodie", "bomber")):
        return "Outerwear"
    if any(k in v for k in ("bottom", "pant", "jean", "trouser", "chino", "skirt")):
        return "Bottom"
    if any(k in v for k in ("shoe", "sneaker", "loafer", "boot", "oxford", "mary jane")):
        return "Shoes"
    if any(k in v for k in ("access", "watch", "belt", "cuff", "earring", "choker", "pendant", "tote")):
        return "Accessory"
    return "Top"


def render_openpose_from_keypoints(
    keypoints: dict[str, list[float]] | None,
    w: int = 768,
    h: int = 1024,
    include_face_features: bool = False,
) -> Image.Image:
    """Fallback OpenPose COCO-18 renderer from normalized 2D skeleton keypoints."""
    canvas = np.zeros((h, w, 3), dtype=np.uint8)
    kps = keypoints or {}

    def get_pt(name: str, default: tuple[float, float]) -> tuple[float, float]:
        raw = kps.get(name)
        if raw and len(raw) >= 2:
            return float(raw[0]) * w, float(raw[1]) * h
        return default[0] * w, default[1] * h

    neck = get_pt("neck", (0.50, 0.22))
    nose = get_pt("nose", get_pt("headCenter", (0.50, 0.145)))
    head_h = max(32.0, abs(neck[1] - nose[1]))
    eye_dx = max(10.0, head_h * 0.22)
    ear_dx = max(18.0, head_h * 0.42)

    pts = {
        "nose": nose,
        "neck": neck,
        "shoulderR": get_pt("shoulderR", (0.415, 0.245)),
        "elbowR": get_pt("elbowR", (0.375, 0.365)),
        "wristR": get_pt("wristR", (0.355, 0.495)),
        "shoulderL": get_pt("shoulderL", (0.585, 0.245)),
        "elbowL": get_pt("elbowL", (0.625, 0.365)),
        "wristL": get_pt("wristL", (0.645, 0.495)),
        "hipR": get_pt("hipR", (0.455, 0.505)),
        "kneeR": get_pt("kneeR", (0.448, 0.695)),
        "ankleR": get_pt("ankleR", (0.445, 0.885)),
        "hipL": get_pt("hipL", (0.545, 0.505)),
        "kneeL": get_pt("kneeL", (0.552, 0.695)),
        "ankleL": get_pt("ankleL", (0.555, 0.885)),
        "eyeR": (nose[0] - eye_dx, nose[1] - head_h * 0.14),
        "eyeL": (nose[0] + eye_dx, nose[1] - head_h * 0.14),
        "earR": (nose[0] - ear_dx, nose[1] - head_h * 0.06),
        "earL": (nose[0] + ear_dx, nose[1] - head_h * 0.06),
    }

    limb_specs = [
        ("neck", "shoulderR", (255, 0, 0)),
        ("neck", "shoulderL", (255, 85, 0)),
        ("shoulderR", "elbowR", (255, 170, 0)),
        ("elbowR", "wristR", (255, 255, 0)),
        ("shoulderL", "elbowL", (170, 255, 0)),
        ("elbowL", "wristL", (85, 255, 0)),
        ("neck", "hipR", (0, 255, 0)),
        ("hipR", "kneeR", (0, 255, 85)),
        ("kneeR", "ankleR", (0, 255, 170)),
        ("neck", "hipL", (0, 255, 255)),
        ("hipL", "kneeL", (0, 170, 255)),
        ("kneeL", "ankleL", (0, 85, 255)),
        ("neck", "nose", (0, 0, 255)),
    ]
    if include_face_features:
        limb_specs.extend([
            ("nose", "eyeR", (85, 0, 255)),
            ("eyeR", "earR", (170, 0, 255)),
            ("nose", "eyeL", (255, 0, 255)),
            ("eyeL", "earL", (255, 0, 170)),
        ])

    overlay = canvas.copy()
    for a, b, col in limb_specs:
        p1, p2 = pts[a], pts[b]
        mx, my = int(round((p1[0] + p2[0]) * 0.5)), int(round((p1[1] + p2[1]) * 0.5))
        length = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        if length < 2:
            continue
        angle = math.degrees(math.atan2(p2[1] - p1[1], p2[0] - p1[0]))
        poly = cv2.ellipse2Poly((mx, my), (max(1, int(length * 0.5)), 4), int(round(angle)), 0, 360, 1)
        cv2.fillConvexPoly(overlay, poly, col)
    canvas = cv2.addWeighted(overlay, 0.65, canvas, 0.35, 0.0)

    joint_cols = [
        ("nose", (255, 0, 0)),
        ("neck", (255, 85, 0)),
        ("shoulderR", (255, 170, 0)),
        ("elbowR", (255, 255, 0)),
        ("wristR", (170, 255, 0)),
        ("shoulderL", (85, 255, 0)),
        ("elbowL", (0, 255, 0)),
        ("wristL", (0, 255, 85)),
        ("hipR", (0, 255, 170)),
        ("kneeR", (0, 255, 255)),
        ("ankleR", (0, 170, 255)),
        ("hipL", (0, 85, 255)),
        ("kneeL", (0, 0, 255)),
        ("ankleL", (85, 0, 255)),
    ]
    if include_face_features:
        joint_cols.extend([
            ("eyeR", (170, 0, 255)),
            ("eyeL", (255, 0, 255)),
            ("earR", (255, 0, 170)),
            ("earL", (255, 0, 85)),
        ])
    for name, col in joint_cols:
        px, py = pts[name]
        cv2.circle(canvas, (int(round(px)), int(round(py))), 4, col, thickness=-1, lineType=cv2.LINE_AA)

    return Image.fromarray(canvas, mode="RGB")


def build_garment_collage(
    garments: list[Any],
    load_rgba_fn: Callable[[Any], tuple[np.ndarray, np.ndarray] | None],
) -> Image.Image:
    """Create a focused clothing reference for IP-Adapter (upper/lower garments only, avoiding corner shoe/collage artifacts)."""
    slot_rank = {"Outerwear": 0, "Top": 1, "Bottom": 2}
    ordered = sorted(
        (g for g in garments if normalize_slot_name(g.type, g.description) in slot_rank),
        key=lambda g: slot_rank.get(normalize_slot_name(g.type, g.description), 4),
    )
    tiles: list[Image.Image] = []

    for g in ordered:
        loaded = load_rgba_fn(g)
        if loaded is not None:
            rgb, alpha = loaded
            ys, xs = np.where(alpha > 0.25)
            if len(ys) > 8:
                y0, y1 = int(ys.min()), int(ys.max()) + 1
                x0, x1 = int(xs.min()), int(xs.max()) + 1
                crop_rgb = rgb[y0:y1, x0:x1]
                crop_a = alpha[y0:y1, x0:x1][:, :, None]
                bg_tile = np.full_like(crop_rgb, 240.0 / 255.0)
                blended = np.clip(crop_rgb * crop_a + bg_tile * (1.0 - crop_a), 0.0, 1.0)
                tiles.append(Image.fromarray((blended * 255).astype(np.uint8), mode="RGB"))
                if len(tiles) >= 3:
                    break
                continue

        # Clean solid fabric swatch fallback when no image file is present
        swatch = Image.new("RGB", (220, 220), (240, 240, 244))
        hex_str = (g.color or "#7A8194").strip().lstrip("#")
        if len(hex_str) == 6:
            try:
                rgb_tuple = (int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16))
                draw = ImageDraw.Draw(swatch)
                draw.rounded_rectangle([32, 32, 188, 188], radius=24, fill=rgb_tuple)
            except ValueError:
                pass
        tiles.append(swatch)
        if len(tiles) >= 3:
            break

    canvas = Image.new("RGB", (512, 512), (240, 240, 244))
    if not tiles:
        return canvas

    def paste_fit(img: Image.Image, box: tuple[int, int, int, int]) -> None:
        bx0, by0, bx1, by1 = box
        bw, bh = bx1 - bx0, by1 - by0
        scale = min(bw / max(1, img.width), bh / max(1, img.height))
        nw, nh = max(1, int(img.width * scale)), max(1, int(img.height * scale))
        resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
        canvas.paste(resized, (bx0 + (bw - nw) // 2, by0 + (bh - nh) // 2))

    if len(tiles) == 1:
        paste_fit(tiles[0], (24, 24, 488, 488))
    elif len(tiles) == 2:
        # Stack upper garment above bottom vertically matching natural full-body layout
        paste_fit(tiles[0], (56, 16, 456, 260))
        paste_fit(tiles[1], (56, 264, 456, 496))
    else:
        # Three-piece layered look: outerwear + top side-by-side above trousers/skirt
        paste_fit(tiles[0], (16, 16, 250, 256))
        paste_fit(tiles[1], (262, 16, 496, 256))
        paste_fit(tiles[2], (56, 264, 456, 496))

    return canvas


def build_tryon_prompts(
    garments: list[Any],
    *,
    camera_preset: str | None = "front",
    backdrop_preset: str | None = "cyclorama",
    pose_label: str | None = None,
    body_preset: str | None = None,
    material_id: str | None = "porcelain",
    include_my_face: bool = False,
) -> tuple[str, str]:
    """Build concise, high-impact SDXL prompts fitting safely under 77 CLIP tokens."""
    mat_desc = _MATERIAL_PROMPTS.get((material_id or "porcelain").lower(), _MATERIAL_PROMPTS["porcelain"])
    cam_desc = _CAMERA_PROMPTS.get((camera_preset or "front").lower(), _CAMERA_PROMPTS["front"])
    backdrop_desc = _BACKDROP_PROMPTS.get(
        (backdrop_preset or "cyclorama").lower(), _BACKDROP_PROMPTS["cyclorama"]
    )
    body_desc = _BODY_PROMPTS.get((body_preset or "standard").lower(), _BODY_PROMPTS["standard"])

    slot_rank = {"Outerwear": 0, "Top": 1, "Bottom": 2, "Shoes": 3, "Accessory": 4}
    ordered = sorted(
        garments,
        key=lambda g: slot_rank.get(normalize_slot_name(g.type, g.description), 4),
    )

    garment_clauses: list[str] = []
    for g in ordered[:4]:
        desc = (g.description or "").strip()
        if not desc:
            continue
        desc_lower = desc.lower()
        color_word = (g.color_name or "").strip().lower() or hex_to_color_hint(g.color)
        mat_word = (g.material or "").strip().lower()
        parts: list[str] = []
        if color_word and not any(w in desc_lower for w in color_word.split()):
            parts.append(color_word)
        # Keep material hints short so full prompt stays safely inside 77 CLIP tokens
        if mat_word and len(ordered) <= 2:
            mat_short = " ".join(mat_word.split()[:2])
            if mat_short.split()[0] not in desc_lower:
                parts.append(mat_short)
        parts.append(desc)
        garment_clauses.append(" ".join(parts))

    outfit_desc = ", ".join(garment_clauses) if garment_clauses else "tailored contemporary outfit"
    pose_part = f", {pose_label.lower()} pose" if pose_label and pose_label.lower() != "custom pose" else ""

    if include_my_face:
        head_clause = "sculpted studio mannequin with realistic portrait face matching reference"
        negative = (
            "uncanny face, distorted features, naked torso, bare chest, blurry, lowres, "
            "cropped head, cropped shoes, floating shoes, spare shoes, extra limbs, fused fingers, flat-lay collage, text, watermark"
        )
        positive = (
            f"studio full-body catalog photo, {cam_desc}, {head_clause}, {body_desc}{pose_part}, "
            f"wearing {outfit_desc}, {backdrop_desc}"
        )
    else:
        head_clause = f"abstract featureless {mat_desc}, completely blank smooth egg head, no eyes, no hair"
        negative = (
            "human, real person, face, facial features, eyes, eyebrows, eyelashes, nose, mouth, lips, hair, wig, "
            "ears, skin pores, blurry, lowres, cropped head, cropped shoes, floating shoes, spare shoes, extra shoes, "
            "extra limbs, extra arms, flat-lay collage, white border, text, watermark"
        )
        positive = (
            f"studio catalog mannequin photo, {head_clause}, {cam_desc}, {body_desc}{pose_part}, "
            f"wearing {outfit_desc}, {backdrop_desc}"
        )
    return positive, negative


def _get_sdxl_tryon_pipe(hf_token: str | None = None) -> Any:
    global _sdxl_pipe
    if _sdxl_pipe is not None:
        return _sdxl_pipe

    from diffusers import (
        AutoencoderKL,
        ControlNetModel,
        DPMSolverMultistepScheduler,
        StableDiffusionXLControlNetPipeline,
    )
    from transformers import CLIPVisionModelWithProjection

    cfg = _get_tryon_config()
    has_cuda = torch.cuda.is_available()
    dtype = torch.float16 if has_cuda else torch.float32
    hf_kwargs: dict[str, Any] = {"token": hf_token} if hf_token else {}

    def _load_cached_first(loader_fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        try:
            return loader_fn(*args, local_files_only=True, **kwargs)
        except Exception:  # noqa: BLE001
            return loader_fn(*args, **kwargs)

    print(
        f"Loading local SDXL Try-On pipeline ({cfg['sdxl_model']} + {cfg['controlnet_model']} + IP-Adapter [{cfg['encoder_subfolder']}])…",
        flush=True,
    )
    image_encoder = _load_cached_first(
        CLIPVisionModelWithProjection.from_pretrained,
        cfg["ip_repo"],
        subfolder=cfg["encoder_subfolder"],
        dtype=dtype,
        **hf_kwargs,
    )
    vae = _load_cached_first(
        AutoencoderKL.from_pretrained,
        cfg["vae_model"],
        torch_dtype=dtype,
        **hf_kwargs,
    )
    controlnet = _load_cached_first(
        ControlNetModel.from_pretrained,
        cfg["controlnet_model"],
        torch_dtype=dtype,
        **hf_kwargs,
    )
    pipe_kwargs: dict[str, Any] = {
        "controlnet": controlnet,
        "vae": vae,
        "image_encoder": image_encoder,
        "torch_dtype": dtype,
        "use_safetensors": True,
        **hf_kwargs,
    }
    if has_cuda:
        pipe_kwargs["variant"] = "fp16"

    pipe = _load_cached_first(
        StableDiffusionXLControlNetPipeline.from_pretrained,
        cfg["sdxl_model"],
        **pipe_kwargs,
    )
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(
        pipe.scheduler.config,
        use_karras_sigmas=True,
    )
    _load_cached_first(
        pipe.load_ip_adapter,
        cfg["ip_repo"],
        subfolder="sdxl_models",
        weight_name=[cfg["ip_weight"], cfg["ip_face_weight"]],
        **hf_kwargs,
    )

    if has_cuda:
        pipe.enable_model_cpu_offload(gpu_id=0)
        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()
        elif getattr(pipe, "vae", None) is not None and hasattr(pipe.vae, "enable_slicing"):
            pipe.vae.enable_slicing()

    _sdxl_pipe = pipe
    print("SDXL OpenPose + IP-Adapter Try-On pipeline ready.", flush=True)
    return _sdxl_pipe


def generate_sdxl_tryon(
    openpose_img: Image.Image,
    garments: list[Any],
    load_rgba_fn: Callable[[Any], tuple[np.ndarray, np.ndarray] | None],
    *,
    camera_preset: str | None = "front",
    backdrop_preset: str | None = "cyclorama",
    pose_label: str | None = None,
    body_preset: str | None = None,
    material_id: str | None = "porcelain",
    include_my_face: bool = False,
    face_img: Image.Image | None = None,
    seed: int | None = None,
    hf_token: str | None = None,
) -> Image.Image:
    """Generate a cohesive 768x1024 studio image of the mannequin in the chosen pose & outfit."""
    pipe = _get_sdxl_tryon_pipe(hf_token=hf_token)

    target_w, target_h = 768, 1024
    if openpose_img.size != (target_w, target_h):
        openpose_img = openpose_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    garment_collage = build_garment_collage(garments, load_rgba_fn)
    prompt, negative_prompt = build_tryon_prompts(
        garments,
        camera_preset=camera_preset,
        backdrop_preset=backdrop_preset,
        pose_label=pose_label,
        body_preset=body_preset,
        material_id=material_id,
        include_my_face=include_my_face and face_img is not None,
    )

    use_face = bool(include_my_face and face_img is not None)
    if use_face and face_img is not None:
        face_ref = face_img.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
        pipe.set_ip_adapter_scale([0.28, 0.56])
        ip_imgs = [garment_collage, face_ref]
    else:
        dummy_face = Image.new("RGB", (512, 512), (240, 240, 244))
        pipe.set_ip_adapter_scale([0.28, 0.0])
        ip_imgs = [garment_collage, dummy_face]

    seed_val = int(seed) if seed is not None else random.randint(1, 2_000_000_000)
    gen_device = "cuda" if torch.cuda.is_available() else "cpu"
    generator = torch.Generator(device=gen_device).manual_seed(seed_val)

    with torch.inference_mode():
        result = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            image=openpose_img,
            ip_adapter_image=ip_imgs,
            width=target_w,
            height=target_h,
            num_inference_steps=26,
            guidance_scale=7.4,
            controlnet_conditioning_scale=0.88,
            generator=generator,
        )
        out_img: Image.Image = result.images[0]

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    gc.collect()
    return out_img
