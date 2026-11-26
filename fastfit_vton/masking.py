"""Deterministic 768x1024 cloth-agnostic slot masking from 2D Pose Studio skeleton & body sliders.

Eliminates external C++/Detectron2/DensePose/SCHP dependencies on Windows while generating
smooth, pose-locked DressCode-MR style masks for:
  - Pass 1: active slots among ("upper", "lower", "overall", "shoe", "bag")
  - Pass 2: open-front outerwear layering ("Outerwear" over an inner "Top" or "FullBody")
"""

from __future__ import annotations

from typing import Mapping, Sequence

import cv2
import numpy as np
from PIL import Image

FIT_SCALE = {
    "fitted": 0.96,
    "standard": 1.05,
    "relaxed": 1.20,
}


def _resolve_pts(
    keypoints: Mapping[str, Sequence[float]] | None,
    w: int = 768,
    h: int = 1024,
) -> dict[str, tuple[float, float]]:
    kps = keypoints or {}

    def pt(name: str, default: tuple[float, float]) -> tuple[float, float]:
        raw = kps.get(name)
        if raw is not None and len(raw) >= 2:
            return float(raw[0]) * w, float(raw[1]) * h
        return default[0] * w, default[1] * h

    neck = pt("neck", (0.50, 0.22))
    nose = pt("nose", (0.50, 0.145))
    pelvis = pt("pelvis", (0.50, 0.485))
    return {
        "nose": nose,
        "neck": neck,
        "pelvis": pelvis,
        "shoulderR": pt("shoulderR", (0.415, 0.245)),
        "elbowR": pt("elbowR", (0.375, 0.365)),
        "wristR": pt("wristR", (0.355, 0.495)),
        "shoulderL": pt("shoulderL", (0.585, 0.245)),
        "elbowL": pt("elbowL", (0.625, 0.365)),
        "wristL": pt("wristL", (0.645, 0.495)),
        "hipR": pt("hipR", (0.455, 0.505)),
        "kneeR": pt("kneeR", (0.448, 0.695)),
        "ankleR": pt("ankleR", (0.445, 0.885)),
        "hipL": pt("hipL", (0.545, 0.505)),
        "kneeL": pt("kneeL", (0.552, 0.695)),
        "ankleL": pt("ankleL", (0.555, 0.885)),
    }


def _draw_capsule(
    mask: np.ndarray,
    p1: tuple[float, float],
    p2: tuple[float, float],
    thickness: float,
    val: int = 255,
) -> None:
    cv2.line(
        mask,
        (int(round(p1[0])), int(round(p1[1]))),
        (int(round(p2[0])), int(round(p2[1]))),
        val,
        thickness=max(4, int(round(thickness))),
        lineType=cv2.LINE_AA,
    )


def _head_protect_mask(
    pts: dict[str, tuple[float, float]],
    w: int,
    h: int,
    include_hair_halo: bool = True,
) -> np.ndarray:
    """Strictly protect the face & head above the collar line so face identity / mannequin egg head never distorts."""
    protect = np.zeros((h, w), dtype=np.uint8)
    nose = pts["nose"]
    neck = pts["neck"]
    head_h = max(46.0, abs(neck[1] - nose[1]) * 1.15)
    rx = int(round(head_h * (0.76 if include_hair_halo else 0.62)))
    ry = int(round(head_h * (0.92 if include_hair_halo else 0.78)))
    cy = int(round(nose[1] - head_h * 0.08))
    # Stop protection slightly above collarbone so crew/mock/collar necklines can form cleanly
    collar_y = int(round(neck[1] - max(8.0, head_h * 0.14)))
    cv2.ellipse(protect, (int(round(nose[0])), cy), (rx, ry), 0, 0, 360, 255, -1)
    protect[collar_y:, :] = 0
    return protect


def _hand_protect_mask(
    pts: dict[str, tuple[float, float]],
    limb_scale: float,
    w: int,
    h: int,
) -> np.ndarray:
    protect = np.zeros((h, w), dtype=np.uint8)
    for sh_k, el_k, wr_k in (("shoulderR", "elbowR", "wristR"), ("shoulderL", "elbowL", "wristL")):
        el = pts[el_k]
        wr = pts[wr_k]
        dx, dy = wr[0] - el[0], wr[1] - el[1]
        norm = max(1.0, float(np.hypot(dx, dy)))
        ux, uy = dx / norm, dy / norm
        palm_cx = int(round(wr[0] + ux * 20.0))
        palm_cy = int(round(wr[1] + uy * 20.0))
        r = int(round(18.0 * limb_scale))
        cv2.circle(protect, (palm_cx, palm_cy), r, 255, -1)
    return protect


def _smooth_binary(mask: np.ndarray, blur_ksize: int = 21, thresh: int = 96) -> np.ndarray:
    k = blur_ksize if blur_ksize % 2 == 1 else blur_ksize + 1
    blurred = cv2.GaussianBlur(mask, (k, k), 0)
    return np.where(blurred >= thresh, 255, 0).astype(np.uint8)


def build_multi_slot_mask(
    keypoints: Mapping[str, Sequence[float]] | None,
    *,
    has_upper: bool = False,
    has_lower: bool = False,
    has_overall: bool = False,
    has_shoe: bool = False,
    has_bag: bool = False,
    upper_desc: str = "",
    lower_desc: str = "",
    overall_desc: str = "",
    bag_desc: str = "",
    fit_style: str = "standard",
    chest_scale: float = 1.0,
    waist_hips_scale: float = 1.0,
    limb_scale: float = 1.0,
    w: int = 768,
    h: int = 1024,
) -> Image.Image:
    """Build a unified, pose-aligned FastFit inpainting mask covering ONLY the active clothing/shoe/bag slots."""
    pts = _resolve_pts(keypoints, w, h)
    ease = FIT_SCALE.get((fit_style or "standard").lower(), 1.05)
    mask = np.zeros((h, w), dtype=np.uint8)

    sh_l, sh_r = pts["shoulderL"], pts["shoulderR"]
    hp_l, hp_r = pts["hipL"], pts["hipR"]
    kn_l, kn_r = pts["kneeL"], pts["kneeR"]
    ak_l, ak_r = pts["ankleL"], pts["ankleR"]
    neck = pts["neck"]
    pelvis = pts["pelvis"]

    sh_span = max(76.0, abs(sh_l[0] - sh_r[0]))
    hip_span = max(68.0, abs(hp_l[0] - hp_r[0]))
    torso_w_pad = sh_span * 0.34 * chest_scale * ease
    hip_w_pad = hip_span * 0.48 * waist_hips_scale * ease

    # 1. Upper body (Tops or standalone/layered Outerwear)
    if has_upper and not has_overall:
        u_low = (upper_desc or "").lower()
        is_long_coat = any(k in u_low for k in ("trench", "coat", "cardigan", "blazer", "overshirt"))
        is_sleeveless = any(k in u_low for k in ("tank", "camisole", "sleeveless", "vest"))
        # Never create a knee-level shelf when lower trousers/skirts are also active: keep upper box at hip level
        # so the lower hull transitions smoothly from waist to ankle without a horizontal step!
        if has_lower:
            hem_y = max(hp_l[1], hp_r[1]) + (44.0 if is_long_coat else 34.0) * ease
        else:
            hem_y = (
                min(kn_l[1], kn_r[1]) - 6.0
                if "trench" in u_low or "coat" in u_low
                else (
                    max(hp_l[1], hp_r[1]) + 56.0
                    if is_long_coat
                    else max(hp_l[1], hp_r[1]) + 38.0 * ease
                )
            )
        # Anchor torso width to shoulders & hips only (not wide-outstretched elbows/wrists)
        left_x = min(sh_r[0], sh_l[0], hp_r[0], hp_l[0]) - torso_w_pad
        right_x = max(sh_r[0], sh_l[0], hp_r[0], hp_l[0]) + torso_w_pad
        top_y = min(sh_r[1], sh_l[1], neck[1]) - 18.0

        poly = np.array(
            [
                [left_x, top_y],
                [right_x, top_y],
                [right_x + 8.0 * ease, hem_y],
                [left_x - 8.0 * ease, hem_y],
            ],
            dtype=np.int32,
        )
        cv2.fillConvexPoly(mask, poly, 255)

        # Arms (mask full arms so sleeves or bare arms match garment sleeve length cleanly, while protecting palms)
        arm_thick = (60.0 if not is_sleeveless else 46.0) * limb_scale * ease
        for sh_k, el_k, wr_k in (("shoulderR", "elbowR", "wristR"), ("shoulderL", "elbowL", "wristL")):
            _draw_capsule(mask, pts[sh_k], pts[el_k], arm_thick)
            _draw_capsule(mask, pts[el_k], pts[wr_k], arm_thick * 0.88)

    # 2. Lower body (Pants, Jeans, Trousers, Chinos, Skirts) — smooth waist-to-ankle DressCode-MR hull
    if has_lower and not has_overall:
        l_low = (lower_desc or "").lower()
        is_skirt = "skirt" in l_low
        is_wide = any(k in l_low for k in ("wide", "relaxed", "flare", "pleat", "baggy", "cargo"))
        waist_top_y = min(hp_l[1], hp_r[1], pelvis[1]) - 28.0
        ankle_bot_y = max(ak_l[1], ak_r[1]) - 2.0

        if is_skirt:
            skirt_hem_y = (
                ankle_bot_y - 18.0
                if any(k in l_low for k in ("midi", "maxi", "long"))
                else (max(kn_l[1], kn_r[1]) + 32.0)
            )
            flare = 68.0 * ease * waist_hips_scale
            left_hip = min(hp_r[0], hp_l[0]) - hip_w_pad
            right_hip = max(hp_r[0], hp_l[0]) + hip_w_pad
            left_ank = min(ak_r[0], ak_l[0], kn_r[0], kn_l[0]) - flare
            right_ank = max(ak_r[0], ak_l[0], kn_r[0], kn_l[0]) + flare
            poly = np.array(
                [
                    [left_hip, waist_top_y],
                    [right_hip, waist_top_y],
                    [right_ank, skirt_hem_y],
                    [left_ank, skirt_hem_y],
                ],
                dtype=np.int32,
            )
            cv2.fillConvexPoly(mask, poly, 255)
            leg_w = 56.0 * limb_scale
            _draw_capsule(mask, kn_r, ak_r, leg_w)
            _draw_capsule(mask, kn_l, ak_l, leg_w)
        else:
            # Smooth straight/wide trapezoid from hip to ankle (never bulge out at knee & pinch in below knee!)
            leg_thick = (92.0 if is_wide else 76.0) * limb_scale * ease
            calf_thick = (90.0 if is_wide else 68.0) * limb_scale * ease
            outer_pad_top = hip_w_pad + (14.0 if is_wide else 6.0)
            outer_pad_ank = calf_thick * (0.64 if is_wide else 0.54)
            left_bot = min(ak_r[0], ak_l[0], kn_r[0], kn_l[0]) - outer_pad_ank
            right_bot = max(ak_r[0], ak_l[0], kn_r[0], kn_l[0]) + outer_pad_ank
            lower_hull = np.array(
                [
                    [min(hp_r[0], hp_l[0]) - outer_pad_top, waist_top_y],
                    [max(hp_r[0], hp_l[0]) + outer_pad_top, waist_top_y],
                    [right_bot, ankle_bot_y],
                    [left_bot, ankle_bot_y],
                ],
                dtype=np.int32,
            )
            cv2.fillConvexPoly(mask, lower_hull, 255)
            for hp_k, kn_k, ak_k in (("hipR", "kneeR", "ankleR"), ("hipL", "kneeL", "ankleL")):
                _draw_capsule(mask, pts[hp_k], pts[kn_k], leg_thick)
                _draw_capsule(mask, pts[kn_k], (pts[ak_k][0], pts[ak_k][1] - 2.0), calf_thick)

    # 3. Full Body / Overall (Dresses, Jumpsuits, Boilersuits, Coveralls, Rompers)
    if has_overall:
        o_low = (overall_desc or "").lower()
        is_pants_piece = any(
            k in o_low for k in ("jumpsuit", "boilersuit", "coverall", "overall", "romper")
        )
        top_y = min(sh_r[1], sh_l[1], neck[1]) - 16.0
        bot_y = max(ak_l[1], ak_r[1]) - 6.0

        # Upper bodice + arms
        left_sh = min(sh_r[0], sh_l[0]) - torso_w_pad
        right_sh = max(sh_r[0], sh_l[0]) + torso_w_pad
        arm_thick = 52.0 * limb_scale * ease
        for sh_k, el_k, wr_k in (("shoulderR", "elbowR", "wristR"), ("shoulderL", "elbowL", "wristL")):
            _draw_capsule(mask, pts[sh_k], pts[el_k], arm_thick)
            _draw_capsule(mask, pts[el_k], pts[wr_k], arm_thick * 0.85)

        if is_pants_piece:
            bodice_poly = np.array(
                [
                    [left_sh, top_y],
                    [right_sh, top_y],
                    [max(hp_r[0], hp_l[0]) + hip_w_pad + 10.0, max(hp_r[1], hp_l[1]) + 32.0],
                    [min(hp_r[0], hp_l[0]) - hip_w_pad - 10.0, max(hp_r[1], hp_l[1]) + 32.0],
                ],
                dtype=np.int32,
            )
            cv2.fillConvexPoly(mask, bodice_poly, 255)
            leg_thick = 70.0 * limb_scale * ease
            for hp_k, kn_k, ak_k in (("hipR", "kneeR", "ankleR"), ("hipL", "kneeL", "ankleL")):
                _draw_capsule(mask, pts[hp_k], pts[kn_k], leg_thick)
                _draw_capsule(mask, pts[kn_k], (pts[ak_k][0], pts[ak_k][1] - 6.0), leg_thick * 0.9)
        else:
            # Flowing dress A-line hull so full/wrap/pleated skirts aren't pinched between the knees
            flare = 64.0 * ease * waist_hips_scale
            dress_poly = np.array(
                [
                    [left_sh, top_y],
                    [right_sh, top_y],
                    [max(hp_r[0], hp_l[0]) + hip_w_pad + 14.0, (top_y + bot_y) * 0.45],
                    [max(ak_r[0], ak_l[0], kn_r[0], kn_l[0]) + flare, bot_y],
                    [min(ak_r[0], ak_l[0], kn_r[0], kn_l[0]) - flare, bot_y],
                    [min(hp_r[0], hp_l[0]) - hip_w_pad - 14.0, (top_y + bot_y) * 0.45],
                ],
                dtype=np.int32,
            )
            cv2.fillConvexPoly(mask, dress_poly, 255)

    # 4. Shoes (Ankle boots, sneakers, loafers, Mary Janes, oxfords)
    if has_shoe:
        for kn_k, ak_k in (("kneeR", "ankleR"), ("kneeL", "ankleL")):
            ak = pts[ak_k]
            kn = pts[kn_k]
            boot_top = (ak[0] * 0.85 + kn[0] * 0.15, ak[1] - 26.0)
            foot_bot = (ak[0], min(h - 10.0, ak[1] + 48.0))
            _draw_capsule(mask, boot_top, foot_bot, 64.0 * limb_scale)
            cv2.ellipse(
                mask,
                (int(round(ak[0])), int(round(min(h - 16.0, ak[1] + 22.0)))),
                (int(round(44.0 * limb_scale)), 32),
                0,
                0,
                360,
                255,
                -1,
            )

    # 5. Bag / Tote (Crossbody or side-carried tote near left wrist/hip)
    if has_bag:
        b_low = (bag_desc or "").lower()
        wr_l = pts["wristL"]
        hp_l = pts["hipL"]
        if "crossbody" in b_low:
            # Diagonal strap across torso + hip pouch on left hip
            _draw_capsule(mask, pts["shoulderR"], (hp_l[0] + 24.0, hp_l[1] + 24.0), 26.0)
            bag_cx = int(round(hp_l[0] + 38.0 * ease))
            bag_cy = int(round(hp_l[1] + 42.0))
            cv2.ellipse(mask, (bag_cx, bag_cy), (52, 62), 0, 0, 360, 255, -1)
        else:
            bag_cx = int(round(wr_l[0] + 18.0))
            bag_cy = int(round(wr_l[1] + 68.0))
            cv2.ellipse(mask, (bag_cx, min(h - 60, bag_cy)), (58, 72), 0, 0, 360, 255, -1)

    # Protect head/face strictly, and protect palms unless bag is held in hand
    head_prot = _head_protect_mask(pts, w, h, include_hair_halo=True)
    hand_prot = _hand_protect_mask(pts, limb_scale, w, h)
    mask[head_prot > 0] = 0
    if not has_bag:
        mask[hand_prot > 0] = 0
    else:
        # Only protect right hand when left hand holds tote
        wr_r, el_r = pts["wristR"], pts["elbowR"]
        dx, dy = wr_r[0] - el_r[0], wr_r[1] - el_r[1]
        norm = max(1.0, float(np.hypot(dx, dy)))
        cv2.circle(
            mask,
            (int(round(wr_r[0] + dx / norm * 20.0)), int(round(wr_r[1] + dy / norm * 20.0))),
            int(round(18.0 * limb_scale)),
            0,
            -1,
        )

    mask = _smooth_binary(mask, blur_ksize=23, thresh=92)
    mask[head_prot > 0] = 0
    return Image.fromarray(mask, mode="L")


def build_open_outerwear_mask(
    keypoints: Mapping[str, Sequence[float]] | None,
    *,
    outer_desc: str = "",
    fit_style: str = "standard",
    chest_scale: float = 1.0,
    waist_hips_scale: float = 1.0,
    limb_scale: float = 1.0,
    is_back_view: bool = False,
    has_dress: bool = False,
    w: int = 768,
    h: int = 1024,
) -> Image.Image:
    """Build Pass-2 open-front outerwear mask: covers sleeves, shoulders, and outer lapels/panels
    while preserving a wide center chest-to-hem window so graphic tees (e.g. Snoopy tee) or dresses remain crisp."""
    pts = _resolve_pts(keypoints, w, h)
    ease = FIT_SCALE.get((fit_style or "standard").lower(), 1.05) * 1.04
    mask = np.zeros((h, w), dtype=np.uint8)

    sh_l, sh_r = pts["shoulderL"], pts["shoulderR"]
    hp_l, hp_r = pts["hipL"], pts["hipR"]
    kn_l, kn_r = pts["kneeL"], pts["kneeR"]
    neck = pts["neck"]
    pelvis = pts["pelvis"]

    o_low = (outer_desc or "").lower()
    is_long_trench = any(k in o_low for k in ("trench", "long coat", "overcoat"))
    is_mid_blazer = any(k in o_low for k in ("blazer", "cardigan", "overshirt", "coat"))

    if has_dress and not is_long_trench:
        hem_y = max(hp_l[1], hp_r[1]) + 28.0
    else:
        hem_y = (
            min(kn_l[1], kn_r[1]) + 18.0
            if is_long_trench
            else (
                max(hp_l[1], hp_r[1]) + 42.0
                if is_mid_blazer
                else max(hp_l[1], hp_r[1]) + 26.0
            )
        )
    sh_span = max(76.0, abs(sh_l[0] - sh_r[0]))
    pad_x = sh_span * 0.34 * chest_scale * ease
    left_x = min(sh_r[0], sh_l[0], hp_r[0], hp_l[0]) - pad_x
    right_x = max(sh_r[0], sh_l[0], hp_r[0], hp_l[0]) + pad_x
    top_y = min(sh_r[1], sh_l[1], neck[1]) - 14.0

    poly = np.array(
        [
            [left_x, top_y],
            [right_x, top_y],
            [right_x + 14.0 * waist_hips_scale, hem_y],
            [left_x - 14.0 * waist_hips_scale, hem_y],
        ],
        dtype=np.int32,
    )
    cv2.fillConvexPoly(mask, poly, 255)

    arm_thick = 58.0 * limb_scale * ease
    for sh_k, el_k, wr_k in (("shoulderR", "elbowR", "wristR"), ("shoulderL", "elbowL", "wristL")):
        _draw_capsule(mask, pts[sh_k], pts[el_k], arm_thick)
        _draw_capsule(mask, pts[el_k], pts[wr_k], arm_thick * 0.88)

    if not is_back_view:
        # Carve out a generous center inner-garment window so graphic prints & waistbands stay intact
        cx_top = neck[0]
        cx_mid = pelvis[0]
        cx_bot = (hp_l[0] + hp_r[0]) * 0.5
        inner_half_top = max(24.0, sh_span * 0.21)
        inner_half_mid = max(25.0, sh_span * 0.22)
        inner_half_bot = max(30.0, sh_span * 0.26)
        preserve_strip = np.array(
            [
                [cx_top - inner_half_top, top_y - 12.0],
                [cx_top + inner_half_top, top_y - 12.0],
                [cx_mid + inner_half_mid, (top_y + hem_y) * 0.5],
                [cx_bot + inner_half_bot, hem_y + 18.0],
                [cx_bot - inner_half_bot, hem_y + 18.0],
                [cx_mid - inner_half_mid, (top_y + hem_y) * 0.5],
            ],
            dtype=np.int32,
        )
        cv2.fillPoly(mask, [preserve_strip], 0)

    head_prot = _head_protect_mask(pts, w, h, include_hair_halo=True)
    hand_prot = _hand_protect_mask(pts, limb_scale, w, h)
    mask[head_prot > 0] = 0
    mask[hand_prot > 0] = 0
    mask = _smooth_binary(mask, blur_ksize=19, thresh=96)
    mask[head_prot > 0] = 0
    return Image.fromarray(mask, mode="L")
