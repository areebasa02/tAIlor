# Copyright 2025 LavieAI (https://lavieai.com) & HuggingFace Team.
# Modified for tAIlor (CMPS 4200 academic coursework) — stripped unused training-only imports
# and added cleanRGBA-to-white-studio aspect-ratio padding for undistorted garment/shoe/bag references.
# See fastfit_vton/NOTICE.txt and fastfit_vton/LICENSE.md for FastFit Non-Commercial License v1.0.0 terms.

from __future__ import annotations

import inspect
from typing import List, Optional, Tuple

import numpy as np
import torch
from PIL import Image, ImageFilter


def paste_image_back_with_feathering(
    resized_background_image: Image.Image,
    image_to_paste: Image.Image,
    crop_box: Tuple[int, int, int, int],
    feather_radius: int = 50,
) -> Tuple[Image.Image, Image.Image]:
    mask = Image.new("L", resized_background_image.size, 0)
    mask.paste(255, crop_box)
    feather_mask = mask.filter(ImageFilter.GaussianBlur(radius=feather_radius))

    image_with_paste = resized_background_image.copy()
    paste_position = (crop_box[0], crop_box[1])
    image_with_paste.paste(image_to_paste, paste_position)

    final_image = Image.composite(
        image_with_paste, resized_background_image, feather_mask
    )
    return final_image, feather_mask


def get_bounding_box(mask_pil: Image.Image) -> Optional[Tuple[int, int, int, int]]:
    if mask_pil.mode != "L":
        mask_pil = mask_pil.convert("L")
    mask_np = np.array(mask_pil)
    if not np.any(mask_np > 0):
        return None
    rows = np.any(mask_np > 0, axis=1)
    cols = np.any(mask_np > 0, axis=0)
    ymin, ymax = np.where(rows)[0][[0, -1]]
    xmin, xmax = np.where(cols)[0][[0, -1]]
    return (int(xmin), int(ymin), int(xmax + 1), int(ymax + 1))


def adjust_input_image(
    image: Image.Image,
    mask: Image.Image,
    target_size: Tuple[int, int] = (768, 1024),
    padding_ratio: float = 0.05,
) -> Tuple[Image.Image, Image.Image, Image.Image, Tuple[int, int, int, int]]:
    img_w, img_h = image.size
    target_w, target_h = target_size
    target_ratio = target_w / target_h

    bbox = get_bounding_box(mask)
    if bbox is None:
        raise ValueError("Input mask is empty.")
    x_min, y_min, x_max, y_max = bbox
    box_w = x_max - x_min
    box_h = y_max - y_min

    ideal_w = max(box_h * target_ratio, box_w)
    ideal_h = max(box_w / target_ratio, box_h)

    x_center = (x_min + x_max) / 2
    y_center = (y_min + y_max) / 2
    x_min = x_center - ideal_w / 2
    y_min = y_center - ideal_h / 2
    x_max = x_center + ideal_w / 2
    y_max = y_center + ideal_h / 2

    max_padding_ratio = min(
        padding_ratio,
        (x_min + img_w - x_max) / (ideal_w * 2),
        (y_min + img_h - y_max) / (ideal_h * 2),
    )
    x_padding = int(ideal_w * max_padding_ratio)
    y_padding = int(ideal_h * max_padding_ratio)
    x_min -= x_padding
    y_min -= y_padding
    x_max += x_padding
    y_max += y_padding

    if x_min < 0:
        x_max -= x_min
        x_min = 0
    if y_min < 0:
        y_max -= y_min
        y_min = 0
    if x_max > img_w:
        x_min -= x_max - img_w
        x_max = img_w
    if y_max > img_h:
        y_min -= y_max - img_h
        y_max = img_h

    scale = target_w / (x_max - x_min)
    img_new_w = int(img_w * scale)
    img_new_h = int(img_h * scale)

    image_new = image.resize((img_new_w, img_new_h), Image.Resampling.LANCZOS)
    mask_new = mask.resize((img_new_w, img_new_h), Image.Resampling.NEAREST)

    crop_x_start = int(x_min * scale)
    crop_y_start = int(y_min * scale)
    crop_box = (
        crop_x_start,
        crop_y_start,
        crop_x_start + target_w,
        crop_y_start + target_h,
    )
    cropped_image = image_new.crop(crop_box)
    cropped_mask = mask_new.crop(crop_box)
    return image_new, cropped_image, cropped_mask, crop_box


def prepare_extra_step_kwargs(noise_scheduler, generator, eta: float):
    sig_params = set(inspect.signature(noise_scheduler.step).parameters.keys())
    extra_step_kwargs = {}
    if "eta" in sig_params:
        extra_step_kwargs["eta"] = eta
    if "generator" in sig_params:
        extra_step_kwargs["generator"] = generator
    return extra_step_kwargs


def prepare_image(
    image,
    device: str = "cuda",
    dtype: torch.dtype = torch.float32,
    do_normalize: bool = True,
) -> torch.Tensor:
    if isinstance(image, torch.Tensor):
        if image.ndim == 3:
            image = image.unsqueeze(0)
        image = image.to(dtype=torch.float32)
    else:
        if isinstance(image, (Image.Image, np.ndarray)):
            image = [image]
        if isinstance(image, list) and isinstance(image[0], Image.Image):
            image = [np.array(i.convert("RGB"))[None, :] for i in image]
            image = np.concatenate(image, axis=0)
        elif isinstance(image, list) and isinstance(image[0], np.ndarray):
            image = np.concatenate([i[None, :] for i in image], axis=0)
        image = image.transpose(0, 3, 1, 2)
        if do_normalize:
            image = torch.from_numpy(image).to(dtype=torch.float32) / 127.5 - 1.0
        else:
            image = torch.from_numpy(image).to(dtype=torch.float32) / 255.0
    return image.to(device, dtype=dtype)


def prepare_mask_image(
    mask_image,
    device: str = "cuda",
    dtype: torch.dtype = torch.float32,
) -> torch.Tensor:
    if isinstance(mask_image, torch.Tensor):
        if mask_image.ndim == 2:
            mask_image = mask_image.unsqueeze(0).unsqueeze(0)
        elif mask_image.ndim == 3 and mask_image.shape[0] == 1:
            mask_image = mask_image.unsqueeze(0)
        elif mask_image.ndim == 3 and mask_image.shape[0] != 1:
            mask_image = mask_image.unsqueeze(1)
        mask_image = (mask_image >= 0.5).to(dtype=torch.float32)
    else:
        if isinstance(mask_image, (Image.Image, np.ndarray)):
            mask_image = [mask_image]
        if isinstance(mask_image, list) and isinstance(mask_image[0], Image.Image):
            mask_image = np.concatenate(
                [np.array(m.convert("L"))[None, None, :] for m in mask_image], axis=0
            )
            mask_image = mask_image.astype(np.float32) / 255.0
        elif isinstance(mask_image, list) and isinstance(mask_image[0], np.ndarray):
            mask_image = np.concatenate([m[None, None, :] for m in mask_image], axis=0).astype(
                np.float32
            )
        mask_image = (mask_image >= 0.5).astype(np.float32)
        mask_image = torch.from_numpy(mask_image)
    return mask_image.to(device, dtype=dtype)


def numpy_to_pil(images: np.ndarray) -> List[Image.Image]:
    if images.ndim == 3:
        images = images[None, ...]
    images = (images * 255).round().astype("uint8")
    if images.shape[-1] == 1:
        return [Image.fromarray(image.squeeze(), mode="L") for image in images]
    return [Image.fromarray(image) for image in images]


def format_garment_ref_canvas(
    rgb: np.ndarray,
    alpha: np.ndarray,
    target_size: Tuple[int, int],
    margin_ratio: float = 0.06,
) -> Image.Image:
    """Crop foreground garment/shoe/bag cleanly onto a pure white DressCode-MR studio canvas without aspect distortion."""
    tw, th = target_size
    ys, xs = np.where(alpha > 0.20)
    if len(ys) > 12:
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        crop_rgb = rgb[y0:y1, x0:x1]
        crop_a = alpha[y0:y1, x0:x1][:, :, None]
    else:
        crop_rgb = rgb
        crop_a = alpha[:, :, None]

    # Composite onto pure studio white (1.0, 1.0, 1.0) matching DressCode-MR flat-lay background
    blended = np.clip(crop_rgb * crop_a + (1.0 - crop_a), 0.0, 1.0)
    fg_pil = Image.fromarray((blended * 255.0).round().astype(np.uint8), mode="RGB")

    avail_w = max(16, int(tw * (1.0 - 2 * margin_ratio)))
    avail_h = max(16, int(th * (1.0 - 2 * margin_ratio)))
    scale = min(avail_w / max(1, fg_pil.width), avail_h / max(1, fg_pil.height))
    nw = max(1, int(round(fg_pil.width * scale)))
    nh = max(1, int(round(fg_pil.height * scale)))
    resized = fg_pil.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (tw, th), (255, 255, 255))
    canvas.paste(resized, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def _crop_foreground_rgba(rgb: np.ndarray, alpha: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    ys, xs = np.where(alpha > 0.20)
    if len(ys) > 12:
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        return rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    return rgb, alpha


def compose_open_layered_ref_canvas(
    inner_rgb: np.ndarray,
    inner_alpha: np.ndarray,
    outer_rgb: np.ndarray,
    outer_alpha: np.ndarray,
    target_size: Tuple[int, int] = (576, 768),
    is_full_body_inner: bool = False,
) -> Image.Image:
    """Composite an open-front Outerwear flat-lay over an inner Top or FullBody Dress on a white
    DressCode-MR studio canvas so FastFit-MR-1024 drapes both layers seamlessly in a single pass."""
    tw, th = target_size
    in_c_rgb, in_c_a = _crop_foreground_rgba(inner_rgb, inner_alpha)
    out_c_rgb, out_c_a = _crop_foreground_rgba(outer_rgb, outer_alpha)

    canvas = np.ones((th, tw, 3), dtype=np.float32)

    # 1. Place inner garment (Top or FullBody Dress) centered on studio canvas
    in_margin = 0.08 if is_full_body_inner else 0.13
    in_avail_w = max(32, int(tw * (1.0 - 2 * in_margin)))
    in_avail_h = max(32, int(th * (1.0 - 2 * in_margin)))
    in_scale = min(in_avail_w / max(1, in_c_rgb.shape[1]), in_avail_h / max(1, in_c_rgb.shape[0]))
    in_w = max(16, int(round(in_c_rgb.shape[1] * in_scale)))
    in_h = max(16, int(round(in_c_rgb.shape[0] * in_scale)))

    in_rgb_pil = Image.fromarray((np.clip(in_c_rgb, 0.0, 1.0) * 255.0).round().astype(np.uint8)).resize(
        (in_w, in_h), Image.Resampling.LANCZOS
    )
    in_a_pil = Image.fromarray((np.clip(in_c_a, 0.0, 1.0) * 255.0).round().astype(np.uint8)).resize(
        (in_w, in_h), Image.Resampling.BILINEAR
    )
    in_rgb_r = np.array(in_rgb_pil, dtype=np.float32) / 255.0
    in_a_r = (np.array(in_a_pil, dtype=np.float32) / 255.0)[:, :, None]

    in_x0 = (tw - in_w) // 2
    in_y0 = (th - in_h) // 2
    roi = canvas[in_y0 : in_y0 + in_h, in_x0 : in_x0 + in_w]
    canvas[in_y0 : in_y0 + in_h, in_x0 : in_x0 + in_w] = in_rgb_r * in_a_r + roi * (1.0 - in_a_r)

    # 2. Scale Outerwear to match shoulder/bodice proportions of the inner garment
    if is_full_body_inner:
        target_out_w = min(int(tw * 0.84), max(64, int(round(in_w * 1.12))))
        target_out_h = min(int(th * 0.62), max(64, int(round(in_h * 0.56))))
    else:
        target_out_w = int(tw * 0.82)
        target_out_h = int(th * 0.82)

    out_scale = min(
        target_out_w / max(1, out_c_rgb.shape[1]),
        target_out_h / max(1, out_c_rgb.shape[0]),
    )
    out_w = max(24, int(round(out_c_rgb.shape[1] * out_scale)))
    out_h = max(24, int(round(out_c_rgb.shape[0] * out_scale)))

    out_rgb_pil = Image.fromarray((np.clip(out_c_rgb, 0.0, 1.0) * 255.0).round().astype(np.uint8)).resize(
        (out_w, out_h), Image.Resampling.LANCZOS
    )
    out_a_pil = Image.fromarray((np.clip(out_c_a, 0.0, 1.0) * 255.0).round().astype(np.uint8)).resize(
        (out_w, out_h), Image.Resampling.BILINEAR
    )
    out_rgb_r = np.array(out_rgb_pil, dtype=np.float32) / 255.0
    out_a_r = np.array(out_a_pil, dtype=np.float32) / 255.0

    # 3. Part closed outerwear down its vertical centerline to form a natural open-front silhouette
    mid = out_w // 2
    trim_half = max(6, int(round(out_w * 0.028)))
    part_shift = max(18, int(round(out_w * (0.068 if is_full_body_inner else 0.088))))

    layer_rgb = np.zeros((th, tw, 3), dtype=np.float32)
    layer_a = np.zeros((th, tw), dtype=np.float32)
    out_y0 = max(8, in_y0 - 8)
    avail_paste_h = min(out_h, th - out_y0 - 4)
    out_rgb_r = out_rgb_r[:avail_paste_h]
    out_a_r = out_a_r[:avail_paste_h]

    # Left panel shifted left
    l_end = max(1, mid - trim_half)
    l_dst_x1 = max(1, tw // 2 - part_shift)
    l_src_w = min(l_end, l_dst_x1)
    layer_rgb[out_y0 : out_y0 + avail_paste_h, l_dst_x1 - l_src_w : l_dst_x1] = out_rgb_r[
        :, l_end - l_src_w : l_end
    ]
    layer_a[out_y0 : out_y0 + avail_paste_h, l_dst_x1 - l_src_w : l_dst_x1] = out_a_r[
        :, l_end - l_src_w : l_end
    ]

    # Right panel shifted right
    r_start = min(out_w - 1, mid + trim_half)
    r_dst_x0 = min(tw - 1, tw // 2 + part_shift)
    r_src_w = min(out_w - r_start, tw - r_dst_x0)
    layer_rgb[out_y0 : out_y0 + avail_paste_h, r_dst_x0 : r_dst_x0 + r_src_w] = out_rgb_r[
        :, r_start : r_start + r_src_w
    ]
    layer_a[out_y0 : out_y0 + avail_paste_h, r_dst_x0 : r_dst_x0 + r_src_w] = out_a_r[
        :, r_start : r_start + r_src_w
    ]

    # Soft cast shadow from open jacket edges onto inner garment for 3D layering cue
    shadow_pil = Image.fromarray((np.clip(layer_a, 0.0, 1.0) * 255.0).round().astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(radius=5.0)
    )
    shadow = (np.array(shadow_pil, dtype=np.float32) / 255.0)[:, :, None] * (1.0 - layer_a[:, :, None])
    canvas = canvas * (1.0 - 0.14 * shadow)

    # Composite parted outerwear over inner piece
    la3 = layer_a[:, :, None]
    canvas = np.clip(layer_rgb * la3 + canvas * (1.0 - la3), 0.0, 1.0)
    return Image.fromarray((canvas * 255.0).round().astype(np.uint8), mode="RGB")
