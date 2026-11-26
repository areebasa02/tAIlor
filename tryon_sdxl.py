"""Hybrid 2-Stage Virtual Try-On & Multi-Condition ControlNet Engine for tAIlor Studio.

Architecture (optimized for 24 GB+ local CUDA GPUs such as RTX 5090 Laptop GPU):
  - Stage 1 (Studio Subject, Pose, Proportions & Lighting — LRU Cached):
      * Base model:    SG161222/RealVisXL_V5.0_Lightning (OpenRAIL++, 6 steps, DPM++ SDE Karras, CFG 1.8)
      * VAE:           madebyollin/sdxl-vae-fp16-fix (MIT)
      * Multi-Control: OzzyGT/controlnet-union-promax-sdxl-1.0 (Apache-2.0, xinsir ProMax weights)
                       fusing DWpose w/ Hands & Feet (mode=0) + 2D Body Volume Depth (mode=1)
      * Face / Fallback: h94/IP-Adapter (Apache-2.0, ip-adapter-plus_sdxl_vit-h + ip-adapter-plus-face_sdxl_vit-h)
  - Stage 2 (Pixel-Accurate Multi-Reference Garment, Shoe, Bag & Layered Outerwear VTON):
      * VTON model:    zhengchong/FastFit-MR-1024 (FastFit Non-Commercial License v1.0.0 — see fastfit_vton/NOTICE.txt)
      * Slots:         Simultaneous upper (0), lower (1), overall/dress (2), shoe (3), bag (4) via Semi-Attention KV cache
      * Layering:      Smart 2-pass open-front outerwear compositing when Outerwear is worn over a Top or Dress
"""

from __future__ import annotations

import base64
from collections import OrderedDict
from contextlib import contextmanager
import colorsys
import gc
import hashlib
import io
import json
import math
import os
import random
import threading
import time
from typing import Any, Callable, Mapping, Sequence

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw

from fastfit_vton import (
    AI_DISCLOSURE_BADGE,
    FastFitPipeline,
    build_multi_slot_mask,
)
from fastfit_vton.utils import compose_open_layered_ref_canvas, format_garment_ref_canvas

TRYON_SDXL_MODEL = os.environ.get(
    "TRYON_SDXL_MODEL", "SG161222/RealVisXL_V5.0_Lightning"
)
TRYON_VAE_MODEL = os.environ.get("TRYON_VAE_MODEL", "madebyollin/sdxl-vae-fp16-fix")
TRYON_CONTROLNET_UNION_MODEL = os.environ.get(
    "TRYON_CONTROLNET_UNION_MODEL", "OzzyGT/controlnet-union-promax-sdxl-1.0"
)
TRYON_IP_ADAPTER_REPO = os.environ.get("TRYON_IP_ADAPTER_REPO", "h94/IP-Adapter")
TRYON_IP_ADAPTER_WEIGHT = os.environ.get(
    "TRYON_IP_ADAPTER_WEIGHT", "ip-adapter-plus_sdxl_vit-h.safetensors"
)
TRYON_IP_ADAPTER_FACE_WEIGHT = os.environ.get(
    "TRYON_IP_ADAPTER_FACE_WEIGHT", "ip-adapter-plus-face_sdxl_vit-h.safetensors"
)
TRYON_FASTFIT_MODEL = os.environ.get(
    "TRYON_FASTFIT_MODEL", "zhengchong/FastFit-MR-1024"
)
# "fastfit" (Non-Commercial Academic Research default) | "sdxl_only" (Commercial-Safe fallback)
TRYON_STAGE2_VTON = os.environ.get("TRYON_STAGE2_VTON", "fastfit").strip().lower()
if os.environ.get("COMMERCIAL_PRODUCTION_MODE", "").strip().lower() in {"1", "true", "yes"}:
    TRYON_STAGE2_VTON = "sdxl_only"

STAGE1_CACHE_MAX = max(4, int(os.environ.get("TRYON_POSE_CACHE_SIZE", "16")))

_sdxl_pipe: Any = None
_sdxl_img2img_pipe: Any = None
_fastfit_pipe: FastFitPipeline | None = None
_stage1_cache: "OrderedDict[str, tuple[Image.Image, int]]" = OrderedDict()
_cache_lock = threading.Lock()


_face_cascade: Any = None


def _extract_face_portrait_crop(img: Image.Image) -> Image.Image:
    """Detect and crop a tight, clean 512x512 face portrait from either a selfie or full-body photo.

    Feeding an uncropped full-body white-background image into ip-adapter-plus-face_sdxl_vit-h
    corrupts facial geometry; isolating the actual face prevents white-box artifacts.
    """
    global _face_cascade
    rgb = img.convert("RGB")
    w, h = rgb.size
    arr = np.array(rgb, dtype=np.uint8)

    try:
        if _face_cascade is None:
            xml_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
            if os.path.exists(xml_path):
                _face_cascade = cv2.CascadeClassifier(xml_path)
        if _face_cascade is not None and not _face_cascade.empty():
            gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
            faces = _face_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=4, minSize=(max(24, w // 18), max(24, h // 18))
            )
            if len(faces) > 0:
                # Pick the largest detected face (preferring upper half if ties)
                fx, fy, fw, fh = max(faces, key=lambda b: (b[2] * b[3]) * (1.2 if b[1] < h * 0.45 else 1.0))
                pad_x = int(round(fw * 0.48))
                pad_top = int(round(fh * 0.55))
                pad_bot = int(round(fh * 0.42))
                x0 = max(0, int(fx) - pad_x)
                y0 = max(0, int(fy) - pad_top)
                x1 = min(w, int(fx + fw) + pad_x)
                y1 = min(h, int(fy + fh) + pad_bot)
                # Make square
                cw, ch = x1 - x0, y1 - y0
                side = max(cw, ch)
                cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
                sx0 = max(0, min(w - side, cx - side // 2))
                sy0 = max(0, min(h - side, cy - side // 2))
                sx1 = min(w, sx0 + side)
                sy1 = min(h, sy0 + side)
                return rgb.crop((sx0, sy0, sx1, sy1)).resize((512, 512), Image.Resampling.LANCZOS)
    except Exception:
        pass

    # Fallback: if the photo looks like a full-body shot (white borders or tall aspect), crop upper-center head band
    non_white = (arr.min(axis=-1) < 240).any(axis=1)
    if non_white.any() and h >= w * 0.95:
        ys = np.where(non_white)[0]
        top_y, bot_y = int(ys[0]), int(ys[-1])
        subj_h = max(64, bot_y - top_y)
        if subj_h > h * 0.55:
            head_h = int(round(subj_h * 0.24))
            cx = w // 2
            half = max(48, int(round(head_h * 0.65)))
            x0 = max(0, cx - half)
            x1 = min(w, cx + half)
            y0 = max(0, top_y - int(head_h * 0.08))
            y1 = min(h, top_y + head_h)
            return rgb.crop((x0, y0, x1, y1)).resize((512, 512), Image.Resampling.LANCZOS)

    return rgb.resize((512, 512), Image.Resampling.LANCZOS)


def _get_face_detailer_pipe(base_pipe: Any) -> Any:
    """Create a zero-VRAM-overhead SDXL Img2Img view sharing base_pipe's weights for high-res face refinement."""
    global _sdxl_img2img_pipe
    if _sdxl_img2img_pipe is not None:
        return _sdxl_img2img_pipe
    from diffusers import EulerDiscreteScheduler, StableDiffusionXLImg2ImgPipeline

    img2img_scheduler = EulerDiscreteScheduler.from_config(
        base_pipe.scheduler.config,
        timestep_spacing="trailing",
        prediction_type="epsilon",
    )
    _sdxl_img2img_pipe = StableDiffusionXLImg2ImgPipeline(
        vae=base_pipe.vae,
        text_encoder=base_pipe.text_encoder,
        text_encoder_2=base_pipe.text_encoder_2,
        tokenizer=base_pipe.tokenizer,
        tokenizer_2=base_pipe.tokenizer_2,
        unet=base_pipe.unet,
        scheduler=img2img_scheduler,
        image_encoder=base_pipe.image_encoder,
        feature_extractor=base_pipe.feature_extractor,
    )
    return _sdxl_img2img_pipe


def _fit_user_photo_to_studio(
    user_photo: Image.Image,
    backdrop_preset: str = "cyclorama",
    target_size: tuple[int, int] = (768, 1024),
) -> Image.Image:
    """Fit a user's uploaded full-body photo cleanly to 768x1024 without stretching or cropping their head/face."""
    tw, th = target_size
    src = user_photo.convert("RGB")
    sw, sh = src.size
    if sw == tw and sh == th:
        return src
    # If aspect ratio is already close to portrait 3:4, center-crop gently (biasing top so head stays intact)
    src_ratio = sw / max(1, sh)
    tgt_ratio = tw / th
    if 0.60 <= src_ratio <= 0.92:
        if src_ratio > tgt_ratio:
            new_w = int(round(sh * tgt_ratio))
            x0 = max(0, (sw - new_w) // 2)
            cropped = src.crop((x0, 0, x0 + new_w, sh))
        else:
            new_h = int(round(sw / tgt_ratio))
            y0 = max(0, int((sh - new_h) * 0.18))
            cropped = src.crop((0, y0, sw, min(sh, y0 + new_h)))
        return cropped.resize((tw, th), Image.Resampling.LANCZOS)

    # Otherwise letterbox cleanly onto a matching studio backdrop
    bg_colors = {
        "cyclorama": (236, 236, 240),
        "warm_editorial": (238, 232, 224),
        "golden_hour": (244, 232, 214),
        "cool_daylight": (230, 237, 244),
        "midnight": (38, 42, 54),
    }
    bg_col = bg_colors.get((backdrop_preset or "cyclorama").lower(), (236, 236, 240))
    canvas = Image.new("RGB", (tw, th), bg_col)
    scale = min(tw / max(1, sw), th / max(1, sh))
    nw = max(16, int(round(sw * scale)))
    nh = max(16, int(round(sh * scale)))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def _refine_face_detailer(
    base_img: Image.Image,
    pipe: Any,
    keypoints: Mapping[str, Sequence[float]] | None,
    *,
    face_img: Image.Image | None,
    material_id: str | None,
    seed_val: int,
    progress_cb: Callable[..., None] | None = None,
) -> Image.Image:
    """512x512 ADetailer-style facial refinement pass so generated human faces are crisp, symmetrical, and never melted."""
    w, h = base_img.size
    kps = keypoints or {}
    raw_nose = kps.get("nose")
    raw_neck = kps.get("neck")
    nose_x = float(raw_nose[0]) * w if (raw_nose and len(raw_nose) >= 2) else 0.50 * w
    nose_y = float(raw_nose[1]) * h if (raw_nose and len(raw_nose) >= 2) else 0.145 * h
    neck_y = float(raw_neck[1]) * h if (raw_neck and len(raw_neck) >= 2) else 0.22 * h

    head_h = max(48.0, abs(neck_y - nose_y) * 1.35)
    box_side = int(max(192, min(320, round(head_h * 2.55))))
    half = box_side // 2
    cx = int(round(nose_x))
    cy = int(round(nose_y - head_h * 0.06))
    x0 = max(0, min(w - box_side, cx - half))
    y0 = max(0, min(h - box_side, cy - half))
    x1 = min(w, x0 + box_side)
    y1 = min(h, y0 + box_side)

    crop = base_img.crop((x0, y0, x1, y1))
    # Run SDXL Img2Img at 768x768 (native SDXL scale) so RealVisXL_V5.0_Lightning never collapses into 512x512 artifacts
    crop_hd = crop.resize((768, 768), Image.Resampling.LANCZOS)

    skin_desc = _HUMAN_SKIN_PROMPTS.get((material_id or "porcelain").lower(), _HUMAN_SKIN_PROMPTS["porcelain"])
    face_prompt = (
        f"sharp high-resolution close-up studio portrait of a {skin_desc}, "
        "clear symmetrical natural eyes, realistic nose and lips, soft natural skin texture, "
        "clean studio softbox lighting, DSLR 85mm photograph"
    )
    face_neg = (
        "distorted face, melted face, horror face, hollow dark eye sockets, smeared eyes, "
        "asymmetrical eyes, deformed nose, malformed mouth, uncanny, creepy, painterly, "
        "mannequin, blurry, lowres, worst quality, extra eyes, white frame, border, cutout"
    )

    detailer = _get_face_detailer_pipe(pipe)
    neutral_ref = Image.new("RGB", (512, 512), (236, 236, 240))
    if face_img is not None:
        face_ref = _extract_face_portrait_crop(face_img)
        detailer.set_ip_adapter_scale([0.0, 0.36])
        ip_imgs = [neutral_ref, face_ref]
    else:
        dummy_face = Image.new("RGB", (512, 512), (240, 240, 244))
        detailer.set_ip_adapter_scale([0.0, 0.0])
        ip_imgs = [neutral_ref, dummy_face]

    gen_dev = "cuda" if torch.cuda.is_available() else "cpu"
    gen = torch.Generator(device=gen_dev).manual_seed(seed_val + 97)
    detail_steps = 12
    detail_strength = 0.36
    effective_steps = max(1, int(detail_steps * detail_strength))

    def _on_step(_p, step_idx, _t, kwargs):
        if progress_cb is not None:
            progress_cb(
                "face_detailer",
                f"Refining face details at 768×768 (step {step_idx + 1}/{effective_steps})…",
                38 + int(8 * min(1.0, (step_idx + 1) / effective_steps)),
                step_idx + 1,
                effective_steps,
            )
        return kwargs

    if progress_cb is not None:
        progress_cb("face_detailer", "Refining face details at 768×768…", 38, 0, effective_steps)

    with _stage1_encoders_active(pipe), torch.inference_mode():
        refined_hd = detailer(
            prompt=face_prompt,
            negative_prompt=face_neg,
            image=crop_hd,
            ip_adapter_image=ip_imgs,
            strength=detail_strength,
            num_inference_steps=detail_steps,
            guidance_scale=1.9,
            generator=gen,
            callback_on_step_end=_on_step,
        ).images[0]

    refined_crop = refined_hd.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)

    # Sanity check: reject anomalous brightness/color collapse (never paste a blank or blown-out box over the head)
    orig_arr = np.array(crop, dtype=np.float32)
    ref_arr = np.array(refined_crop, dtype=np.float32)
    if float(np.abs(ref_arr.mean() - orig_arr.mean())) > 55.0 or float(ref_arr.std()) < 10.0:
        return base_img

    # Smooth elliptical feathered composite so the refined face blends invisibly into the studio photo
    mw, mh = x1 - x0, y1 - y0
    mask = np.zeros((mh, mw), dtype=np.float32)
    cv2.ellipse(
        mask,
        (mw // 2, mh // 2),
        (int(mw * 0.36), int(mh * 0.40)),
        0,
        0,
        360,
        1.0,
        -1,
    )
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=max(8.0, mw * 0.10))
    mask = np.clip(mask, 0.0, 1.0)[:, :, None]

    base_arr = np.array(base_img, dtype=np.float32)
    base_arr[y0:y1, x0:x1] = ref_arr * mask + base_arr[y0:y1, x0:x1] * (1.0 - mask)
    return Image.fromarray(np.clip(base_arr, 0, 255).round().astype(np.uint8), mode="RGB")


def _get_tryon_config() -> dict[str, str]:
    sdxl_model = os.environ.get("TRYON_SDXL_MODEL", TRYON_SDXL_MODEL)
    vae_model = os.environ.get("TRYON_VAE_MODEL", TRYON_VAE_MODEL)
    controlnet_model = os.environ.get(
        "TRYON_CONTROLNET_UNION_MODEL", TRYON_CONTROLNET_UNION_MODEL
    )
    ip_repo = os.environ.get("TRYON_IP_ADAPTER_REPO", TRYON_IP_ADAPTER_REPO)
    ip_weight = os.environ.get("TRYON_IP_ADAPTER_WEIGHT", TRYON_IP_ADAPTER_WEIGHT)
    ip_face_weight = os.environ.get(
        "TRYON_IP_ADAPTER_FACE_WEIGHT", TRYON_IP_ADAPTER_FACE_WEIGHT
    )
    default_encoder_subfolder = (
        "models/image_encoder"
        if "vit-h" in ip_weight.lower()
        else "sdxl_models/image_encoder"
    )
    encoder_subfolder = (
        os.environ.get("TRYON_IMAGE_ENCODER_SUBFOLDER", "").strip()
        or default_encoder_subfolder
    )
    fastfit_model = os.environ.get("TRYON_FASTFIT_MODEL", TRYON_FASTFIT_MODEL)
    stage2_mode = os.environ.get("TRYON_STAGE2_VTON", TRYON_STAGE2_VTON).strip().lower()
    if os.environ.get("COMMERCIAL_PRODUCTION_MODE", "").strip().lower() in {"1", "true", "yes"}:
        stage2_mode = "sdxl_only"
    return {
        "sdxl_model": sdxl_model,
        "vae_model": vae_model,
        "controlnet_model": controlnet_model,
        "ip_repo": ip_repo,
        "ip_weight": ip_weight,
        "ip_face_weight": ip_face_weight,
        "encoder_subfolder": encoder_subfolder,
        "fastfit_model": fastfit_model,
        "stage2_mode": stage2_mode,
    }


def is_tryon_loaded() -> bool:
    cfg = _get_tryon_config()
    if cfg["stage2_mode"] == "fastfit":
        return _sdxl_pipe is not None and _fastfit_pipe is not None
    return _sdxl_pipe is not None


def get_tryon_model_summary() -> str:
    cfg = _get_tryon_config()
    sdxl_short = cfg["sdxl_model"].split("/")[-1]
    if cfg["stage2_mode"] == "fastfit":
        ff_short = cfg["fastfit_model"].split("/")[-1]
        return f"{sdxl_short}+ControlNetUnion+{ff_short}"
    return f"{sdxl_short}+ControlNetUnion"


_MATERIAL_PROMPTS: dict[str, str] = {
    "porcelain": "matte warm ivory porcelain full-body articulated retail fashion mannequin",
    "bisque": "matte soft blush bisque full-body articulated retail fashion mannequin",
    "sand": "smooth honey maple wood full-body articulated retail fashion mannequin",
    "tan": "smooth matte warm terracotta clay full-body articulated retail fashion mannequin",
    "espresso": "satin dark espresso walnut full-body articulated retail fashion mannequin",
    "walnut": "matte rose-clay full-body articulated retail fashion mannequin",
    "charcoal": "sleek matte black obsidian full-body articulated retail fashion mannequin",
}

_HUMAN_SKIN_PROMPTS: dict[str, str] = {
    "porcelain": "fair warm ivory skin tone fashion model",
    "bisque": "light peach skin tone fashion model",
    "sand": "warm golden honey skin tone fashion model",
    "tan": "sun-kissed medium tan skin tone fashion model",
    "espresso": "rich deep espresso brown skin tone fashion model",
    "walnut": "warm rosy medium-tan skin tone fashion model",
    "charcoal": "deep ebony brown skin tone editorial fashion model",
}

_BACKDROP_PROMPTS: dict[str, str] = {
    "cyclorama": "clean lavender-grey seamless studio cyclorama sweep, softbox key light, floor contact shadow",
    "warm_editorial": "warm beige stone seamless studio sweep, diffused editorial strobe light",
    "golden_hour": "warm amber sunlit studio cyclorama sweep, golden rim light, soft floor shadow",
    "cool_daylight": "crisp pale-blue daylight studio cyclorama sweep, north-window softbox light",
    "midnight": "moody dark charcoal-indigo studio sweep, crisp softbox rim light",
}

_CAMERA_PROMPTS: dict[str, str] = {
    "front": "straight-on front full-body view",
    "three_quarter": "three-quarter editorial full-body view",
    "side": "clean side profile full-body view",
    "back": "rear back full-body view from behind, facing away",
    "low_angle": "low-angle full-body runway shot",
}

_FIT_PROMPTS: dict[str, str] = {
    "fitted": "tailored fitted silhouette",
    "standard": "classic regular tailored fit",
    "relaxed": "relaxed loose editorial drape",
}

_BODY_PROMPTS: dict[str, str] = {
    "petite": "petite slender frame",
    "standard": "balanced studio proportions",
    "athletic": "athletic broad-shouldered build",
    "curvy": "curvy hourglass silhouette",
    "tall / broad": "tall elongated runway frame",
    "tall": "tall elongated runway frame",
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
    t = (g_type or "").strip().lower()
    d = (description or "").strip().lower()
    v = f"{t} {d}"

    if any(
        k in t
        for k in (
            "full body",
            "full_body",
            "full-body",
            "one-piece",
            "one piece",
            "dress",
            "gown",
            "jumpsuit",
            "romper",
            "boilersuit",
            "coverall",
            "overalls",
        )
    ):
        return "FullBody"
    if any(k in t for k in ("outer", "coat", "jacket", "blazer", "trench", "cardigan")):
        return "Outerwear"
    if any(k in t for k in ("bottom", "pant", "jean", "trouser", "skirt")):
        return "Bottom"
    if any(k in t for k in ("shoe", "boot", "sneaker", "loafer", "oxford")):
        return "Shoes"
    if any(k in t for k in ("access", "watch", "belt", "bag", "tote", "jewelry")):
        return "Accessory"

    if any(k in v for k in ("dress shirt", "dress blouse", "dress top")):
        return "Top"
    if any(k in v for k in ("dress trouser", "dress pant", "dress slack")):
        return "Bottom"
    if any(k in v for k in ("dress oxford", "dress shoe", "dress boot", "dress loafer")):
        return "Shoes"
    if any(k in v for k in ("dress coat", "dress jacket")):
        return "Outerwear"

    if any(
        k in v
        for k in (
            "full body",
            "full_body",
            "full-body",
            "one-piece",
            "one piece",
            "dress",
            "gown",
            "jumpsuit",
            "romper",
            "boilersuit",
            "coverall",
            "overalls",
            "kaftan",
        )
    ):
        return "FullBody"
    if any(k in v for k in ("outer", "trench", "coat", "blazer", "jacket", "cardigan", "hoodie", "bomber")):
        return "Outerwear"
    if any(k in v for k in ("bottom", "pant", "jean", "trouser", "chino", "skirt")):
        return "Bottom"
    if any(k in v for k in ("shoe", "sneaker", "loafer", "boot", "oxford", "mary jane", "heel", "flat", "pump")):
        return "Shoes"
    if any(
        k in v
        for k in ("access", "watch", "belt", "cuff", "earring", "choker", "pendant", "tote", "bag", "purse", "satchel")
    ):
        return "Accessory"
    return "Top"


def is_bag_accessory(description: str) -> bool:
    d = (description or "").lower()
    return any(
        k in d
        for k in ("bag", "tote", "crossbody", "purse", "satchel", "backpack", "clutch", "handbag", "weekender")
    )


def render_openpose_from_keypoints(
    keypoints: Mapping[str, Sequence[float]] | None,
    w: int = 768,
    h: int = 1024,
    include_face_features: bool = False,
    is_back_view: bool = False,
    hand_foot_preset: str = "neutral",
) -> Image.Image:
    """DWpose / COCO-WholeBody style renderer with articulated hand-finger rays and foot/toe vectors."""
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
    ]
    if not is_back_view:
        limb_specs.append(("neck", "nose", (0, 0, 255)))
    if include_face_features and not is_back_view:
        limb_specs.extend(
            [
                ("nose", "eyeR", (85, 0, 255)),
                ("eyeR", "earR", (170, 0, 255)),
                ("nose", "eyeL", (255, 0, 255)),
                ("eyeL", "earL", (255, 0, 170)),
            ]
        )

    overlay = canvas.copy()
    for a, b, col in limb_specs:
        p1, p2 = pts[a], pts[b]
        mx, my = int(round((p1[0] + p2[0]) * 0.5)), int(round((p1[1] + p2[1]) * 0.5))
        length = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        if length < 2:
            continue
        angle = math.degrees(math.atan2(p2[1] - p1[1], p2[0] - p1[0]))
        poly = cv2.ellipse2Poly(
            (mx, my), (max(1, int(length * 0.5)), 4), int(round(angle)), 0, 360, 1
        )
        cv2.fillConvexPoly(overlay, poly, col)
    canvas = cv2.addWeighted(overlay, 0.70, canvas, 0.30, 0.0)

    # DWpose Hand Finger Rays (5 rays per wrist) + Foot Heel/BigToe/SmallToe vectors
    hf = (hand_foot_preset or "neutral").lower()
    spread_deg = 12.0 if hf == "pocket_relax" else (22.0 if hf == "hands_hips" else 16.0)
    finger_colors = [
        (255, 60, 60),
        (255, 190, 0),
        (80, 255, 60),
        (0, 210, 255),
        (180, 70, 255),
    ]
    for side, (el_k, wr_k) in ((-1, ("elbowR", "wristR")), (1, ("elbowL", "wristL"))):
        el, wr = pts[el_k], pts[wr_k]
        base_ang = math.atan2(wr[1] - el[1], wr[0] - el[0])
        if hf == "hands_hips":
            base_ang += side * (-0.35)
        palm_len = 24.0 if hf != "pocket_relax" else 14.0
        for fi, col in enumerate(finger_colors):
            delta = math.radians((fi - 2) * spread_deg * side)
            ang = base_ang + delta
            mid_pt = (
                int(round(wr[0] + math.cos(ang) * (palm_len * 0.52))),
                int(round(wr[1] + math.sin(ang) * (palm_len * 0.52))),
            )
            tip_pt = (
                int(round(wr[0] + math.cos(ang) * palm_len)),
                int(round(wr[1] + math.sin(ang) * palm_len)),
            )
            cv2.line(
                canvas,
                (int(round(wr[0])), int(round(wr[1]))),
                mid_pt,
                col,
                2,
                cv2.LINE_AA,
            )
            cv2.line(canvas, mid_pt, tip_pt, col, 2, cv2.LINE_AA)
            cv2.circle(canvas, tip_pt, 2, col, -1, cv2.LINE_AA)

    turnout = 22.0 if hf == "runway_turnout" else 11.0
    for side, ak_k in ((-1, "ankleR"), (1, "ankleL")):
        ak = pts[ak_k]
        heel = (int(round(ak[0] - side * 5.0)), int(round(ak[1] + 10.0)))
        big_toe = (int(round(ak[0] + side * (turnout * 0.65))), int(round(ak[1] + 24.0)))
        small_toe = (int(round(ak[0] + side * (turnout * 1.35))), int(round(ak[1] + 20.0)))
        ak_i = (int(round(ak[0])), int(round(ak[1])))
        cv2.line(canvas, ak_i, heel, (0, 200, 255), 3, cv2.LINE_AA)
        cv2.line(canvas, ak_i, big_toe, (0, 255, 190), 3, cv2.LINE_AA)
        cv2.line(canvas, ak_i, small_toe, (80, 170, 255), 2, cv2.LINE_AA)
        for fp in (heel, big_toe, small_toe):
            cv2.circle(canvas, fp, 3, (0, 230, 255), -1, cv2.LINE_AA)

    joint_cols = [
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
    if is_back_view:
        joint_cols.extend([("earR", (255, 0, 170)), ("earL", (255, 0, 85))])
    else:
        joint_cols.insert(0, ("nose", (255, 0, 0)))
        if include_face_features:
            joint_cols.extend(
                [
                    ("eyeR", (170, 0, 255)),
                    ("eyeL", (255, 0, 255)),
                    ("earR", (255, 0, 170)),
                    ("earL", (255, 0, 85)),
                ]
            )
    for name, col in joint_cols:
        px, py = pts[name]
        cv2.circle(
            canvas,
            (int(round(px)), int(round(py))),
            4,
            col,
            thickness=-1,
            lineType=cv2.LINE_AA,
        )

    return Image.fromarray(canvas, mode="RGB")


def render_depth_from_keypoints(
    keypoints: Mapping[str, Sequence[float]] | None,
    *,
    chest_scale: float = 1.0,
    waist_hips_scale: float = 1.0,
    limb_scale: float = 1.0,
    w: int = 768,
    h: int = 1024,
) -> Image.Image:
    """Synthesize a smooth 3D-like grayscale studio depth map (mode=1 for ControlNetUnion)
    so Petite/Athletic/Curvy/Tall body sliders physically constrain body silhouette volume."""
    depth = np.zeros((h, w), dtype=np.float32)
    # Subtle studio floor depth ramp from y=76%..100%
    ys = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    floor_ramp = np.clip((ys - 0.78) / 0.22, 0.0, 1.0) * 52.0
    depth += floor_ramp

    kps = keypoints or {}

    def pt(name: str, default: tuple[float, float]) -> tuple[float, float]:
        raw = kps.get(name)
        if raw and len(raw) >= 2:
            return float(raw[0]) * w, float(raw[1]) * h
        return default[0] * w, default[1] * h

    nose = pt("nose", (0.50, 0.145))
    neck = pt("neck", (0.50, 0.22))
    pelvis = pt("pelvis", (0.50, 0.485))
    sh_r, sh_l = pt("shoulderR", (0.415, 0.245)), pt("shoulderL", (0.585, 0.245))
    el_r, el_l = pt("elbowR", (0.375, 0.365)), pt("elbowL", (0.625, 0.365))
    wr_r, wr_l = pt("wristR", (0.355, 0.495)), pt("wristL", (0.645, 0.495))
    hp_r, hp_l = pt("hipR", (0.455, 0.505)), pt("hipL", (0.545, 0.505))
    kn_r, kn_l = pt("kneeR", (0.448, 0.695)), pt("kneeL", (0.552, 0.695))
    ak_r, ak_l = pt("ankleR", (0.445, 0.885)), pt("ankleL", (0.555, 0.885))

    body = np.zeros((h, w), dtype=np.uint8)

    def limb(a: tuple[float, float], b: tuple[float, float], base_w: float, val: int) -> None:
        cv2.line(
            body,
            (int(round(a[0])), int(round(a[1]))),
            (int(round(b[0])), int(round(b[1]))),
            val,
            max(4, int(round(base_w * limb_scale))),
            cv2.LINE_AA,
        )

    # Legs
    limb(hp_r, kn_r, 44.0, 195)
    limb(kn_r, ak_r, 31.0, 190)
    limb(hp_l, kn_l, 44.0, 195)
    limb(kn_l, ak_l, 31.0, 190)
    for ak in (ak_r, ak_l):
        cv2.ellipse(
            body,
            (int(round(ak[0])), int(round(ak[1] + 15.0))),
            (int(round(18.0 * limb_scale)), 11),
            0,
            0,
            360,
            205,
            -1,
        )

    # Torso polygon scaled by chest & waistHips
    waist_half = max(26.0, abs(hp_l[0] - hp_r[0]) * 0.72 * chest_scale)
    hip_pad = 12.0 * waist_hips_scale
    waist_y = sh_r[1] * 0.38 + hp_r[1] * 0.62
    waist_cx = pelvis[0]
    torso_poly = np.array(
        [
            [min(sh_r[0], sh_l[0]) - 6.0, min(sh_r[1], sh_l[1]) - 8.0],
            [max(sh_r[0], sh_l[0]) + 6.0, min(sh_r[1], sh_l[1]) - 8.0],
            [waist_cx + waist_half, waist_y],
            [max(hp_r[0], hp_l[0]) + hip_pad, max(hp_r[1], hp_l[1]) + 20.0],
            [min(hp_r[0], hp_l[0]) - hip_pad, max(hp_r[1], hp_l[1]) + 20.0],
            [waist_cx - waist_half, waist_y],
        ],
        dtype=np.int32,
    )
    cv2.fillPoly(body, [torso_poly], 215)

    # Neck & head
    limb(neck, nose, 25.0, 210)
    cv2.ellipse(
        body,
        (int(round(nose[0])), int(round(nose[1] - 4.0))),
        (34, 46),
        0,
        0,
        360,
        228,
        -1,
    )

    # Arms slightly brighter in foreground
    limb(sh_r, el_r, 28.0, 222)
    limb(el_r, wr_r, 22.0, 232)
    limb(sh_l, el_l, 28.0, 222)
    limb(el_l, wr_l, 22.0, 232)

    # Distance-transform shading gives realistic 3D cylindrical Z-depth rolloff
    fg_bin = (body > 0).astype(np.uint8)
    dist = cv2.distanceTransform(fg_bin, cv2.DIST_L2, 5)
    max_d = max(1.0, float(dist.max()))
    cyl_shade = np.sqrt(np.clip(dist / (max_d * 0.68), 0.0, 1.0))
    shaded_fg = body.astype(np.float32) * (0.58 + 0.42 * cyl_shade)
    combined = np.where(fg_bin > 0, np.clip(shaded_fg, 40.0, 248.0), depth)
    combined = cv2.GaussianBlur(combined, (9, 9), 2.0)
    u8 = np.clip(combined, 0, 255).astype(np.uint8)
    return Image.fromarray(np.stack([u8, u8, u8], axis=-1), mode="RGB")


def build_garment_collage(
    garments: list[Any],
    load_rgba_fn: Callable[[Any], tuple[np.ndarray, np.ndarray] | None],
) -> Image.Image:
    """Create a harmonious color/texture reference collage for Stage-1 ambient studio lighting & sdxl_only fallback."""
    slot_rank = {"FullBody": 0, "Outerwear": 1, "Top": 2, "Bottom": 3, "Shoes": 4}
    ordered = sorted(
        (g for g in garments if normalize_slot_name(g.type, g.description) in slot_rank),
        key=lambda g: slot_rank.get(normalize_slot_name(g.type, g.description), 5),
    )
    tiles: list[Image.Image] = []
    tile_slots: list[str] = []

    for g in ordered:
        slot = normalize_slot_name(g.type, g.description)
        loaded = load_rgba_fn(g)
        if loaded is not None:
            rgb, alpha = loaded
            tiles.append(format_garment_ref_canvas(rgb, alpha, (256, 256), margin_ratio=0.05))
            tile_slots.append(slot)
            if len(tiles) >= 3:
                break
            continue

        swatch = Image.new("RGB", (220, 220), (245, 245, 248))
        hex_str = (g.color or "#7A8194").strip().lstrip("#")
        if len(hex_str) == 6:
            try:
                rgb_tuple = (
                    int(hex_str[0:2], 16),
                    int(hex_str[2:4], 16),
                    int(hex_str[4:6], 16),
                )
                draw = ImageDraw.Draw(swatch)
                draw.rounded_rectangle([32, 32, 188, 188], radius=24, fill=rgb_tuple)
            except ValueError:
                pass
        tiles.append(swatch)
        tile_slots.append(slot)
        if len(tiles) >= 3:
            break

    canvas = Image.new("RGB", (512, 512), (248, 248, 250))
    if not tiles:
        return canvas

    def paste_fit(img: Image.Image, box: tuple[int, int, int, int]) -> None:
        bx0, by0, bx1, by1 = box
        bw, bh = bx1 - bx0, by1 - by0
        scale = min(bw / max(1, img.width), bh / max(1, img.height))
        nw, nh = max(1, int(img.width * scale)), max(1, int(img.height * scale))
        resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
        canvas.paste(resized, (bx0 + (bw - nw) // 2, by0 + (bh - nh) // 2))

    has_full_body = "FullBody" in tile_slots
    if len(tiles) == 1:
        paste_fit(tiles[0], (24, 24, 488, 488))
    elif len(tiles) == 2:
        if has_full_body:
            paste_fit(tiles[0], (16, 20, 252, 492))
            paste_fit(tiles[1], (260, 20, 496, 492))
        else:
            paste_fit(tiles[0], (56, 16, 456, 260))
            paste_fit(tiles[1], (56, 264, 456, 496))
    else:
        if has_full_body:
            paste_fit(tiles[0], (16, 20, 276, 492))
            paste_fit(tiles[1], (288, 20, 496, 252))
            paste_fit(tiles[2], (288, 260, 496, 492))
        else:
            paste_fit(tiles[0], (16, 16, 250, 256))
            paste_fit(tiles[1], (262, 16, 496, 256))
            paste_fit(tiles[2], (56, 264, 456, 496))

    return canvas


def build_stage1_prompts(
    garments: list[Any],
    *,
    for_vton_base: bool,
    subject_mode: str = "mannequin",
    camera_preset: str | None = "front",
    backdrop_preset: str | None = "cyclorama",
    pose_label: str | None = None,
    body_preset: str | None = None,
    fit_style: str | None = "standard",
    material_id: str | None = "porcelain",
    include_my_face: bool = False,
) -> tuple[str, str]:
    """Build Stage-1 SDXL Lightning prompts.
    When `for_vton_base=True`, Stage 1 synthesizes a clean, neutral base-layered mannequin/model
    (plus any small non-bag jewelry hints) so Stage-1 renders are reusable across outfit swaps!"""
    cam_key = (camera_preset or "front").lower()
    is_back_view = cam_key == "back"
    mat_key = (material_id or "porcelain").lower()
    is_human = (subject_mode or "mannequin").strip().lower() == "human"
    cam_desc = _CAMERA_PROMPTS.get(cam_key, _CAMERA_PROMPTS["front"])
    backdrop_desc = _BACKDROP_PROMPTS.get(
        (backdrop_preset or "cyclorama").lower(), _BACKDROP_PROMPTS["cyclorama"]
    )
    body_desc = _BODY_PROMPTS.get(
        (body_preset or "standard").lower(), _BODY_PROMPTS["standard"]
    )
    fit_desc = _FIT_PROMPTS.get((fit_style or "standard").lower(), _FIT_PROMPTS["standard"])
    pose_part = (
        f", {pose_label.lower()} pose"
        if pose_label and pose_label.lower() != "custom pose"
        else ""
    )

    # Collect subtle non-bag accessory hints (watch, belt, bracelet, earrings) if present
    jewelry_clauses: list[str] = []
    for g in garments:
        if normalize_slot_name(g.type, g.description) == "Accessory" and not is_bag_accessory(
            g.description
        ):
            desc = (g.description or "").strip()
            if desc:
                jewelry_clauses.append(desc)

    if for_vton_base:
        outfit_desc = (
            "plain light-grey short-sleeve crew-neck t-shirt, plain medium-grey straight-leg trousers, "
            "simple white low-top sneakers, standing upright on two separated legs and feet"
        )
        if jewelry_clauses:
            outfit_desc = f"{outfit_desc}, {', '.join(jewelry_clauses[:2])}"
    else:
        slot_rank = {
            "FullBody": 0,
            "Outerwear": 1,
            "Top": 2,
            "Bottom": 3,
            "Shoes": 4,
            "Accessory": 5,
        }
        ordered = sorted(
            garments,
            key=lambda g: slot_rank.get(normalize_slot_name(g.type, g.description), 5),
        )
        clauses: list[str] = []
        for g in ordered[:4]:
            desc = (g.description or "").strip()
            if not desc:
                continue
            color_word = (g.color_name or "").strip().lower() or hex_to_color_hint(g.color)
            if color_word and not any(w in desc.lower() for w in color_word.split()):
                clauses.append(f"{color_word} {desc}")
            else:
                clauses.append(desc)
        outfit_desc = ", ".join(clauses) if clauses else "tailored contemporary studio outfit"

    back_neg = ", front view, looking at camera, face, eyes, nose, mouth" if is_back_view else ""
    safety_neg = (
        "nude, naked, topless, underwear, lingerie, sheer, explicit, nsfw, "
        "tailor dummy, dress form, torso bust, wooden stand, central pole, metal rod, tripod stand, "
        "peg leg, single leg, merged legs, missing legs, missing arms, "
        "blurry, lowres, worst quality, bad anatomy, deformed hands, fused fingers, twisted feet, "
        "floating shoes, extra limbs, cropped head, cropped feet, watermark, text"
    )

    if is_human:
        skin_desc = _HUMAN_SKIN_PROMPTS.get(mat_key, _HUMAN_SKIN_PROMPTS["porcelain"])
        if is_back_view:
            subj_clause = (
                f"photorealistic real human studio fashion model, {skin_desc}, natural styled hair, seen from behind"
            )
        elif include_my_face:
            subj_clause = (
                f"photorealistic real human studio fashion model, {skin_desc}, "
                "natural human face matching reference portrait, realistic eyes, lips, and hair"
            )
        else:
            subj_clause = (
                f"photorealistic real human studio fashion model, {skin_desc}, "
                "realistic human face with clear eyes, nose, lips, natural poised expression, styled hair"
            )
        positive = (
            f"RAW editorial fashion lookbook full-body photograph of a {subj_clause}, {cam_desc}, "
            f"{body_desc}{pose_part}, wearing {outfit_desc}, {fit_desc}, {backdrop_desc}, sharp focus, 85mm lens"
        )
        negative = (
            "mannequin, wooden mannequin, retail mannequin, plastic doll, blank face, featureless head, "
            f"egg head, faceless, wooden head, statue, CGI, 3d render, uncanny face, distorted eyes, {safety_neg}{back_neg}"
        )
    elif include_my_face and not is_back_view:
        mat_desc = _MATERIAL_PROMPTS.get(mat_key, _MATERIAL_PROMPTS["porcelain"])
        subj_clause = (
            f"sculpted studio {mat_desc} with two full arms, hands, two full legs, "
            "and realistic portrait face matching reference"
        )
        positive = (
            f"studio full-body catalog photo, {cam_desc}, {subj_clause}, {body_desc}{pose_part}, "
            f"wearing {outfit_desc}, {fit_desc}, {backdrop_desc}"
        )
        negative = f"uncanny face, distorted features, {safety_neg}"
    else:
        mat_desc = _MATERIAL_PROMPTS.get(mat_key, _MATERIAL_PROMPTS["porcelain"])
        head_clause = (
            f"abstract featureless {mat_desc} with two full arms and two full legs seen from behind, smooth back of head"
            if is_back_view
            else (
                f"abstract featureless {mat_desc} with two full arms, sculpted hands, and two full separated legs, "
                "smooth blank egg head, no facial features, no hair"
            )
        )
        positive = (
            f"full-length head-to-toe fashion store mannequin photo, {head_clause}, {cam_desc}, "
            f"{body_desc}{pose_part}, wearing {outfit_desc}, {fit_desc}, {backdrop_desc}"
        )
        negative = (
            "human, real person, face, facial features, eyes, eyebrows, nose, mouth, lips, hair, wig, "
            f"skin pores, {safety_neg}{back_neg}"
        )

    return positive, negative


def _load_cached_first(loader_fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    try:
        return loader_fn(*args, local_files_only=True, **kwargs)
    except Exception:  # noqa: BLE001
        return loader_fn(*args, **kwargs)


def _park_stage1_encoders(pipe: Any, device: str) -> None:
    """Move Stage-1 prompt/CLIP encoders (~2.9 GB) between CPU and CUDA while keeping UNet+ControlNet+VAE hot on GPU."""
    if getattr(pipe, "_hf_hook", None) is not None:
        return
    for attr in ("text_encoder", "text_encoder_2", "image_encoder"):
        mod = getattr(pipe, attr, None)
        if mod is not None:
            mod.to(device)


@contextmanager
def _stage1_encoders_active(pipe: Any):
    use_park = torch.cuda.is_available() and getattr(pipe, "_park_encoders_cpu", False)
    if use_park:
        _park_stage1_encoders(pipe, "cuda:0")
    try:
        yield
    finally:
        if use_park:
            _park_stage1_encoders(pipe, "cpu")
            gc.collect()
            torch.cuda.empty_cache()


def get_sdxl_union_pipe(hf_token: str | None = None, coresident_gpu: bool = True) -> Any:
    global _sdxl_pipe
    if _sdxl_pipe is not None:
        return _sdxl_pipe

    from diffusers import (
        AutoencoderKL,
        ControlNetUnionModel,
        DPMSolverMultistepScheduler,
        StableDiffusionXLControlNetUnionPipeline,
    )
    from transformers import CLIPVisionModelWithProjection

    cfg = _get_tryon_config()
    has_cuda = torch.cuda.is_available()
    dtype = torch.float16 if has_cuda else torch.float32
    hf_kwargs: dict[str, Any] = {"token": hf_token} if hf_token else {}

    print(
        f"[Try-On Stage 1] Loading {cfg['sdxl_model']} + {cfg['controlnet_model']} + IP-Adapter…",
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
    cn_kwargs: dict[str, Any] = {
        "torch_dtype": dtype,
        "use_safetensors": True,
        **hf_kwargs,
    }
    if has_cuda and "ozzygt" in cfg["controlnet_model"].lower():
        cn_kwargs["variant"] = "fp16"

    controlnet = _load_cached_first(
        ControlNetUnionModel.from_pretrained,
        cfg["controlnet_model"],
        **cn_kwargs,
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

    try:
        pipe = _load_cached_first(
            StableDiffusionXLControlNetUnionPipeline.from_pretrained,
            cfg["sdxl_model"],
            **pipe_kwargs,
        )
    except Exception:
        pipe_kwargs.pop("variant", None)
        pipe = _load_cached_first(
            StableDiffusionXLControlNetUnionPipeline.from_pretrained,
            cfg["sdxl_model"],
            **pipe_kwargs,
        )

    is_lightning = "lightning" in cfg["sdxl_model"].lower() or "hyper" in cfg["sdxl_model"].lower()
    if is_lightning:
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            pipe.scheduler.config,
            algorithm_type="sde-dpmsolver++",
            use_karras_sigmas=True,
        )
    else:
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
        total_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        if coresident_gpu and total_gb >= 22.0:
            pipe.to("cuda:0")
            pipe._park_encoders_cpu = True
            _park_stage1_encoders(pipe, "cpu")
            gc.collect()
            torch.cuda.empty_cache()
        else:
            pipe._park_encoders_cpu = False
            pipe.enable_model_cpu_offload(gpu_id=0)
        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()
        elif getattr(pipe, "vae", None) is not None and hasattr(pipe.vae, "enable_slicing"):
            pipe.vae.enable_slicing()

    _sdxl_pipe = pipe
    print(
        f"[Try-On Stage 1] Ready on {'cuda:0 (co-resident)' if has_cuda and coresident_gpu else 'CPU-offload'}.",
        flush=True,
    )
    return _sdxl_pipe


def get_fastfit_pipe(hf_token: str | None = None) -> FastFitPipeline:
    global _fastfit_pipe
    if _fastfit_pipe is not None:
        return _fastfit_pipe

    from huggingface_hub import snapshot_download

    cfg = _get_tryon_config()
    repo_id = cfg["fastfit_model"]
    print(f"[Try-On Stage 2] Loading {repo_id} (Semi-Attention Multi-Ref VTON)…", flush=True)
    try:
        local_dir = snapshot_download(repo_id=repo_id, local_files_only=True, token=hf_token)
    except Exception:  # noqa: BLE001
        local_dir = snapshot_download(repo_id=repo_id, token=hf_token)

    _fastfit_pipe = FastFitPipeline(
        base_model_path=local_dir,
        device="cuda:0" if torch.cuda.is_available() else "cpu",
        mixed_precision="bf16",
        allow_tf32=True,
        use_ddim=True,
    )
    print("[Try-On Stage 2] FastFit-MR-1024 ready on cuda:0.", flush=True)
    return _fastfit_pipe


def warmup_tryon_pipelines(hf_token: str | None = None, coresident_gpu: bool = True) -> None:
    """Preload Stage-1 ControlNetUnion + Stage-2 FastFit-MR-1024 at host startup so first click is instant."""
    cfg = _get_tryon_config()
    get_sdxl_union_pipe(hf_token=hf_token, coresident_gpu=coresident_gpu)
    if cfg["stage2_mode"] == "fastfit":
        get_fastfit_pipe(hf_token=hf_token)


def _compute_stage1_cache_key(
    *,
    keypoints: Mapping[str, Sequence[float]] | None,
    openpose_img: Image.Image,
    depth_img: Image.Image,
    camera_preset: str,
    backdrop_preset: str,
    subject_mode: str,
    body_preset: str,
    fit_style: str,
    material_id: str,
    hand_foot_preset: str,
    include_my_face: bool,
    face_img: Image.Image | None,
    jewelry_hint: str,
    body_sliders: Mapping[str, float] | None,
) -> str:
    h = hashlib.sha256()
    meta = {
        "kps": {
            k: [round(float(v[0]), 3), round(float(v[1]), 3)]
            for k, v in sorted((keypoints or {}).items())
            if v and len(v) >= 2
        },
        "cam": camera_preset,
        "bg": backdrop_preset,
        "subj": subject_mode,
        "body": body_preset,
        "fit": fit_style,
        "mat": material_id,
        "hf": hand_foot_preset,
        "face": include_my_face,
        "jwl": jewelry_hint,
        "sliders": {
            k: round(float(v), 2) for k, v in sorted((body_sliders or {}).items())
        },
    }
    h.update(json.dumps(meta, sort_keys=True).encode("utf-8"))
    if not keypoints:
        h.update(openpose_img.resize((64, 64)).tobytes())
        h.update(depth_img.resize((64, 64)).tobytes())
    if include_my_face and face_img is not None:
        h.update(face_img.resize((48, 48)).tobytes())
    return h.hexdigest()[:24]


def _encode_thumb_data_url(img: Image.Image, size: tuple[int, int] = (192, 256)) -> str:
    thumb = img.convert("RGB").resize(size, Image.Resampling.BILINEAR)
    buf = io.BytesIO()
    thumb.save(buf, format="WEBP", quality=78)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _prepare_fastfit_refs(
    upper_img: Image.Image | None,
    lower_img: Image.Image | None,
    overall_img: Image.Image | None,
    shoe_img: Image.Image | None,
    bag_img: Image.Image | None,
    ref_height: int = 768,
) -> tuple[list[Image.Image], list[str], list[int]]:
    clothing_size = (int(ref_height * 3 / 4), ref_height)  # (576, 768)
    accessory_size = (384, 512)
    specs = [
        (upper_img, "upper", clothing_size),
        (lower_img, "lower", clothing_size),
        (overall_img, "overall", clothing_size),
        (shoe_img, "shoe", accessory_size),
        (bag_img, "bag", accessory_size),
    ]
    ref_images: list[Image.Image] = []
    ref_labels: list[str] = []
    ref_masks: list[int] = []
    for img, label, target_size in specs:
        if img is not None:
            if img.size != target_size:
                img = img.convert("RGB").resize(target_size, Image.Resampling.LANCZOS)
            ref_images.append(img)
            ref_labels.append(label)
            ref_masks.append(1)
        else:
            ref_images.append(Image.new("RGB", target_size, (0, 0, 0)))
            ref_labels.append(label)
            ref_masks.append(0)
    return ref_images, ref_labels, ref_masks


def _garment_to_ref_image(
    garment: Any,
    load_rgba_fn: Callable[[Any], tuple[np.ndarray, np.ndarray] | None],
    target_size: tuple[int, int],
) -> Image.Image:
    loaded = load_rgba_fn(garment)
    if loaded is not None:
        rgb, alpha = loaded
        return format_garment_ref_canvas(rgb, alpha, target_size, margin_ratio=0.06)

    canvas = Image.new("RGB", target_size, (255, 255, 255))
    hex_str = (getattr(garment, "color", "") or "#7A8194").strip().lstrip("#")
    if len(hex_str) == 6:
        try:
            rgb_tuple = (
                int(hex_str[0:2], 16),
                int(hex_str[2:4], 16),
                int(hex_str[4:6], 16),
            )
            draw = ImageDraw.Draw(canvas)
            mx, my = int(target_size[0] * 0.16), int(target_size[1] * 0.14)
            draw.rounded_rectangle(
                [mx, my, target_size[0] - mx, target_size[1] - my],
                radius=28,
                fill=rgb_tuple,
            )
        except ValueError:
            pass
    return canvas


def generate_sdxl_tryon(
    openpose_img: Image.Image,
    garments: list[Any],
    load_rgba_fn: Callable[[Any], tuple[np.ndarray, np.ndarray] | None],
    *,
    depth_img: Image.Image | None = None,
    keypoints: Mapping[str, Sequence[float]] | None = None,
    body_sliders: Mapping[str, float] | None = None,
    subject_mode: str | None = "mannequin",
    hand_foot_preset: str | None = "neutral",
    camera_preset: str | None = "front",
    backdrop_preset: str | None = "cyclorama",
    pose_label: str | None = None,
    body_preset: str | None = None,
    fit_style: str | None = "standard",
    material_id: str | None = "porcelain",
    include_my_face: bool = False,
    face_img: Image.Image | None = None,
    user_photo_img: Image.Image | None = None,
    photo_mode: str = "none",
    seed: int | None = None,
    bypass_pose_cache: bool = False,
    hf_token: str | None = None,
    progress_cb: Callable[..., None] | None = None,
) -> dict[str, Any]:
    """Run Hybrid 2-Stage Try-On (Stage 1 ControlNetUnion Pose Base + Optional Face Detailer + Stage 2 FastFit-MR-1024)."""
    cfg = _get_tryon_config()
    use_fastfit = cfg["stage2_mode"] == "fastfit"
    target_w, target_h = 768, 1024

    def _report(phase: str, label: str, percent: int, step: int = 0, total_steps: int = 0) -> None:
        if progress_cb is not None:
            try:
                progress_cb(phase, label, percent, step, total_steps)
            except Exception:
                pass

    _report("preparing", "Preparing DWpose skeleton, 2D depth & garment references…", 6)

    sliders = body_sliders or {}
    chest_scale = float(sliders.get("chest", 1.0))
    waist_hips_scale = float(sliders.get("waistHips", 1.0))
    limb_scale = float(sliders.get("limbBuild", 1.0))

    if openpose_img.size != (target_w, target_h):
        openpose_img = openpose_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    if depth_img is None:
        depth_img = render_depth_from_keypoints(
            keypoints,
            chest_scale=chest_scale,
            waist_hips_scale=waist_hips_scale,
            limb_scale=limb_scale,
            w=target_w,
            h=target_h,
        )
    elif depth_img.size != (target_w, target_h):
        depth_img = depth_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    is_back_view = (camera_preset or "").strip().lower() == "back"
    norm_photo_mode = (photo_mode or "none").strip().lower()
    is_direct_photo = norm_photo_mode == "direct_photo" and user_photo_img is not None
    subj_mode = (
        "human"
        if ((subject_mode or "").strip().lower() in {"human", "picture"} or is_direct_photo)
        else "mannequin"
    )
    effective_face_img = face_img or (user_photo_img if norm_photo_mode == "repose_picture" else None)
    use_face = bool(
        (include_my_face or norm_photo_mode == "repose_picture")
        and effective_face_img is not None
        and not is_back_view
        and not is_direct_photo
    )

    jewelry_items = [
        (g.description or "").strip()
        for g in garments
        if normalize_slot_name(g.type, g.description) == "Accessory"
        and not is_bag_accessory(g.description)
    ]
    jewelry_hint = ", ".join(j for j in jewelry_items if j)[:80]

    cache_key = _compute_stage1_cache_key(
        keypoints=keypoints,
        openpose_img=openpose_img,
        depth_img=depth_img,
        camera_preset=camera_preset or "front",
        backdrop_preset=backdrop_preset or "cyclorama",
        subject_mode=subj_mode,
        body_preset=body_preset or "standard",
        fit_style=fit_style or "standard",
        material_id=material_id or "porcelain",
        hand_foot_preset=hand_foot_preset or "neutral",
        include_my_face=use_face,
        face_img=effective_face_img,
        jewelry_hint=jewelry_hint,
        body_sliders=sliders,
    )

    stage1_cached = False
    stage1_ms = 0
    base_seed = int(seed) if seed is not None else None
    face_refined = False

    if is_direct_photo and user_photo_img is not None:
        # Direct Full-Body Photo Mode: keep user's real photo & face 100% pixel-identical!
        _report("stage1_cached", "Keeping your real photo & face 100% intact (0 ms Stage 1)…", 32)
        base_person_img = _fit_user_photo_to_studio(
            user_photo_img, backdrop_preset=backdrop_preset or "cyclorama", target_size=(target_w, target_h)
        )
        seed_val = base_seed if base_seed is not None else (int(cache_key[:8], 16) % 1_900_000_000 + 10_000)
        stage1_cached = True
    elif use_fastfit and not bypass_pose_cache and base_seed is None:
        with _cache_lock:
            cached_entry = _stage1_cache.get(cache_key)
            if cached_entry is not None:
                _stage1_cache.move_to_end(cache_key)
                base_person_img = cached_entry[0].copy()
                seed_val = cached_entry[1]
                stage1_cached = True
                _report("stage1_cached", "Reusing cached studio pose & lighting (0 ms Stage 1)…", 34)

    if not stage1_cached:
        t0 = time.perf_counter()
        pipe = get_sdxl_union_pipe(hf_token=hf_token)
        is_lightning = (
            "lightning" in cfg["sdxl_model"].lower() or "hyper" in cfg["sdxl_model"].lower()
        )
        steps_s1 = 6 if is_lightning else 22
        cfg_s1 = 1.8 if is_lightning else 6.8
        _report("stage1", f"Rendering pose & studio lighting (step 0/{steps_s1})…", 12, 0, steps_s1)

        prompt, negative_prompt = build_stage1_prompts(
            garments,
            for_vton_base=use_fastfit,
            subject_mode=subj_mode,
            camera_preset=camera_preset,
            backdrop_preset=backdrop_preset,
            pose_label=pose_label,
            body_preset=body_preset,
            fit_style=fit_style,
            material_id=material_id,
            include_my_face=use_face,
        )

        neutral_ref = (
            Image.new("RGB", (512, 512), (236, 236, 240))
            if use_fastfit
            else build_garment_collage(garments, load_rgba_fn)
        )
        garment_ip_scale = 0.0 if use_fastfit else 0.34
        if use_face and effective_face_img is not None:
            face_ref = _extract_face_portrait_crop(effective_face_img)
            pipe.set_ip_adapter_scale([garment_ip_scale, 0.40])
            ip_imgs = [neutral_ref, face_ref]
        else:
            dummy_face = Image.new("RGB", (512, 512), (240, 240, 244))
            pipe.set_ip_adapter_scale([garment_ip_scale, 0.0])
            ip_imgs = [neutral_ref, dummy_face]

        if base_seed is not None:
            seed_val = base_seed
        else:
            # Deterministic studio seed per pose key unless user explicitly re-rolls
            seed_val = int(cache_key[:8], 16) % 1_900_000_000 + 10_000

        gen_device = "cuda" if torch.cuda.is_available() else "cpu"
        generator = torch.Generator(device=gen_device).manual_seed(seed_val)

        # For human studio models, zero out the rigid bald-egg head depth above the collarbone
        # so RealVisXL V5.0 Lightning renders natural human hair and facial geometry freely.
        stage1_depth = depth_img
        if subj_mode == "human":
            d_arr = np.array(depth_img, dtype=np.float32)
            neck_y = int(
                round(
                    (
                        float(keypoints["neck"][1])
                        if (keypoints and "neck" in keypoints and len(keypoints["neck"]) >= 2)
                        else 0.22
                    )
                    * target_h
                )
            )
            fade_y0 = max(0, neck_y - 18)
            fade_y1 = min(target_h, neck_y + 16)
            d_arr[:fade_y0, :, :] = 0.0
            if fade_y1 > fade_y0:
                ramp = np.linspace(0.0, 1.0, fade_y1 - fade_y0, dtype=np.float32)[:, None, None]
                d_arr[fade_y0:fade_y1, :, :] *= ramp
            stage1_depth = Image.fromarray(np.clip(d_arr, 0, 255).astype(np.uint8), mode="RGB")

        cn_scale = 0.74 if subj_mode == "human" else 0.86
        cn_end = 0.84 if subj_mode == "human" else 0.92

        def _on_s1_step(_p, step_idx, _t, kwargs):
            _report(
                "stage1",
                f"Rendering pose & studio lighting (step {step_idx + 1}/{steps_s1})…",
                12 + int(24 * (step_idx + 1) / steps_s1),
                step_idx + 1,
                steps_s1,
            )
            return kwargs

        with _stage1_encoders_active(pipe), torch.inference_mode():
            res_s1 = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                control_image=[openpose_img, stage1_depth],
                control_mode=[0, 1],
                ip_adapter_image=ip_imgs,
                width=target_w,
                height=target_h,
                num_inference_steps=steps_s1,
                guidance_scale=cfg_s1,
                controlnet_conditioning_scale=cn_scale,
                control_guidance_start=0.0,
                control_guidance_end=cn_end,
                generator=generator,
                callback_on_step_end=_on_s1_step,
            )
            base_person_img = res_s1.images[0]

        # Mandatory 512x512 High-Res Face Detailer whenever a human face is generated (zero melted/horror faces!)
        if (subj_mode == "human" or use_face) and not is_back_view:
            base_person_img = _refine_face_detailer(
                base_person_img,
                pipe,
                keypoints,
                face_img=effective_face_img if use_face else None,
                material_id=material_id,
                seed_val=seed_val,
                progress_cb=_report,
            )
            face_refined = True

        stage1_ms = int(round((time.perf_counter() - t0) * 1000))
        if use_fastfit:
            with _cache_lock:
                _stage1_cache[cache_key] = (base_person_img.copy(), seed_val)
                _stage1_cache.move_to_end(cache_key)
                while len(_stage1_cache) > STAGE1_CACHE_MAX:
                    _stage1_cache.popitem(last=False)

    # Commercial-safe fallback or zero-VTON mode returns Stage-1 output directly
    if not use_fastfit:
        return {
            "image": base_person_img,
            "model": get_tryon_model_summary(),
            "runs": 1,
            "passes": 1,
            "stage1Cached": False,
            "stage1Ms": stage1_ms,
            "stage2Ms": 0,
            "dwposePreview": _encode_thumb_data_url(openpose_img),
            "depthPreview": _encode_thumb_data_url(depth_img),
            "maskPreview": None,
            "aiDisclosure": AI_DISCLOSURE_BADGE,
        }

    # --- Stage 2: FastFit-MR-1024 Multi-Reference Pixel-Aligned Draping ---
    t_s2 = time.perf_counter()
    ff_pipe = get_fastfit_pipe(hf_token=hf_token)

    top_g = next((g for g in garments if normalize_slot_name(g.type, g.description) == "Top"), None)
    bottom_g = next(
        (g for g in garments if normalize_slot_name(g.type, g.description) == "Bottom"), None
    )
    overall_g = next(
        (g for g in garments if normalize_slot_name(g.type, g.description) == "FullBody"), None
    )
    outer_g = next(
        (g for g in garments if normalize_slot_name(g.type, g.description) == "Outerwear"), None
    )
    shoe_g = next(
        (g for g in garments if normalize_slot_name(g.type, g.description) == "Shoes"), None
    )
    bag_g = next(
        (
            g
            for g in garments
            if normalize_slot_name(g.type, g.description) == "Accessory"
            and is_bag_accessory(g.description)
        ),
        None,
    )

    # Single-Pass Open-Front Outerwear Layering:
    # Pre-composite parted Outerwear over Top (or FullBody Dress) in DressCode-MR studio reference space
    # so FastFit-MR-1024 drapes both layers naturally in 1 unified pass with zero seam artifacts!
    clothing_ref_size = (576, 768)
    acc_ref_size = (384, 512)
    is_layered_outer = False

    upper_ref: Image.Image | None = None
    overall_ref: Image.Image | None = None
    upper_mask_desc = ""
    overall_mask_desc = ""

    if overall_g is not None:
        overall_mask_desc = getattr(overall_g, "description", "") or ""
        if outer_g is not None:
            ov_loaded = load_rgba_fn(overall_g)
            ou_loaded = load_rgba_fn(outer_g)
            if ov_loaded is not None and ou_loaded is not None:
                overall_ref = compose_open_layered_ref_canvas(
                    ov_loaded[0],
                    ov_loaded[1],
                    ou_loaded[0],
                    ou_loaded[1],
                    target_size=clothing_ref_size,
                    is_full_body_inner=True,
                )
                is_layered_outer = True
                overall_mask_desc = f"{overall_mask_desc} with open {getattr(outer_g, 'description', '')}"
        if overall_ref is None:
            overall_ref = _garment_to_ref_image(overall_g, load_rgba_fn, clothing_ref_size)
    elif top_g is not None and outer_g is not None:
        tp_loaded = load_rgba_fn(top_g)
        ou_loaded = load_rgba_fn(outer_g)
        upper_mask_desc = f"{getattr(top_g, 'description', '')} {getattr(outer_g, 'description', '')}".strip()
        if tp_loaded is not None and ou_loaded is not None:
            upper_ref = compose_open_layered_ref_canvas(
                tp_loaded[0],
                tp_loaded[1],
                ou_loaded[0],
                ou_loaded[1],
                target_size=clothing_ref_size,
                is_full_body_inner=False,
            )
            is_layered_outer = True
        else:
            upper_ref = _garment_to_ref_image(outer_g, load_rgba_fn, clothing_ref_size)
    elif top_g is not None or outer_g is not None:
        single_u = top_g if top_g is not None else outer_g
        upper_mask_desc = getattr(single_u, "description", "") or ""
        upper_ref = _garment_to_ref_image(single_u, load_rgba_fn, clothing_ref_size)

    pass1_lower_g = None if overall_g is not None else bottom_g
    lower_ref = (
        _garment_to_ref_image(pass1_lower_g, load_rgba_fn, clothing_ref_size)
        if pass1_lower_g is not None
        else None
    )
    shoe_ref = (
        _garment_to_ref_image(shoe_g, load_rgba_fn, acc_ref_size)
        if shoe_g is not None
        else None
    )
    bag_ref = (
        _garment_to_ref_image(bag_g, load_rgba_fn, acc_ref_size)
        if bag_g is not None
        else None
    )

    mask_p1 = build_multi_slot_mask(
        keypoints,
        has_upper=upper_ref is not None,
        has_lower=lower_ref is not None,
        has_overall=overall_ref is not None,
        has_shoe=shoe_ref is not None,
        has_bag=bag_ref is not None,
        upper_desc=upper_mask_desc,
        lower_desc=getattr(pass1_lower_g, "description", "") if pass1_lower_g else "",
        overall_desc=overall_mask_desc,
        bag_desc=getattr(bag_g, "description", "") if bag_g else "",
        fit_style=fit_style or "standard",
        chest_scale=chest_scale,
        waist_hips_scale=waist_hips_scale,
        limb_scale=limb_scale,
        w=target_w,
        h=target_h,
    )

    ref_imgs_p1, ref_labels_p1, ref_attn_p1 = _prepare_fastfit_refs(
        upper_ref, lower_ref, overall_ref, shoe_ref, bag_ref, ref_height=768
    )

    gen_dev = ff_pipe.device
    vton_steps = int(os.environ.get("TRYON_FASTFIT_STEPS", "20"))
    gen_p1 = torch.Generator(device=gen_dev).manual_seed(seed_val + 7)
    _report("stage2", f"Draping garments via FastFit (step 0/{vton_steps})…", 48, 0, vton_steps)

    def _on_s2_step(step_num: int, total_s: int) -> None:
        _report(
            "stage2",
            f"Draping garments via FastFit (step {step_num}/{total_s})…",
            48 + int(46 * step_num / max(1, total_s)),
            step_num,
            total_s,
        )

    dressed_img = ff_pipe(
        person=base_person_img,
        mask=mask_p1,
        ref_images=ref_imgs_p1,
        ref_labels=ref_labels_p1,
        ref_attention_masks=ref_attn_p1,
        pose=None if is_direct_photo else openpose_img,
        num_inference_steps=vton_steps,
        guidance_scale=2.5,
        generator=gen_p1,
        return_pil=True,
        step_callback=_on_s2_step,
    )[0]

    passes = 1
    final_mask_preview = mask_p1
    _ = is_layered_outer

    stage2_ms = int(round((time.perf_counter() - t_s2) * 1000))
    _report("finalizing", "Embedding AI disclosure metadata & preparing preview…", 97, vton_steps, vton_steps)

    return {
        "image": dressed_img,
        "model": get_tryon_model_summary(),
        "runs": passes,
        "passes": passes,
        "stage1Cached": stage1_cached,
        "stage1Ms": stage1_ms,
        "stage2Ms": stage2_ms,
        "faceRefined": face_refined,
        "photoMode": norm_photo_mode,
        "dwposePreview": _encode_thumb_data_url(openpose_img),
        "depthPreview": _encode_thumb_data_url(depth_img),
        "maskPreview": _encode_thumb_data_url(final_mask_preview),
        "aiDisclosure": AI_DISCLOSURE_BADGE,
    }
