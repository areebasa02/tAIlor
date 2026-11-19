"""Generate crisp, studio-lit 768x768 product flat-lay images for all sample wardrobe items.

Uses 2x supersampled vector construction + OpenCV/NumPy 3D distance-field volume,
normal-mapped cloth drapery folds, material-aware specular studio lighting,
ambient seam occlusion, and studio drop shadows.
"""

from __future__ import annotations

import math
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "wardrobe"
BASE_SIZE = 768
SCALE = 2
DRAW_SIZE = BASE_SIZE * SCALE  # 1536x1536 supersampled drawing
BG_HEX = (246, 245, 249)


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = s.replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def shade(rgb: tuple[int, int, int], delta: int) -> tuple[int, int, int]:
    return (
        max(0, min(255, rgb[0] + delta)),
        max(0, min(255, rgb[1] + delta)),
        max(0, min(255, rgb[2] + delta)),
    )


def mix(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (
        int(round(c1[0] * (1 - t) + c2[0] * t)),
        int(round(c1[1] * (1 - t) + c2[1] * t)),
        int(round(c1[2] * (1 - t) + c2[2] * t)),
    )


def S(v: float) -> int:
    return int(round(v * SCALE))


def SP(pts: list[tuple[float, float]]) -> list[tuple[int, int]]:
    return [(S(x), S(y)) for x, y in pts]


GARMENTS: list[dict[str, str]] = [
    # Tops
    {"name": "Pastel pink tailored blouse", "category": "Tops", "color": "#E2828F", "material": "smooth viscose silk-touch blouse"},
    {"name": "Burgundy soft scoop tee", "category": "Tops", "color": "#6A1A32", "material": "soft modal cotton scoop neck t-shirt"},
    {"name": "Mint ribbed mock-neck", "category": "Tops", "color": "#76E09A", "material": "fine ribbed organic cotton mock-neck knit top"},
    {"name": "Crisp white cotton tee", "category": "Tops", "color": "#F8F8FA", "material": "heavyweight combed white cotton crew neck t-shirt"},
    {"name": "Magenta button-down", "category": "Tops", "color": "#CE005A", "material": "vivid magenta rayon button-down shirt"},
    {"name": "Lavender cable-knit sweater", "category": "Tops", "color": "#C4B5FD", "material": "soft lavender braided cable-knit sweater"},
    {"name": "Crisp white Oxford shirt", "category": "Tops", "color": "#F4F5F7", "material": "crisp white tailored Oxford cotton button-down shirt"},
    {"name": "Sky blue pinpoint dress shirt", "category": "Tops", "color": "#7EB6E8", "material": "sky blue pinpoint cotton dress shirt"},
    {"name": "Charcoal merino crewneck", "category": "Tops", "color": "#3B4252", "material": "fine gauge charcoal merino wool crewneck sweater"},
    {"name": "Navy Pima crew tee", "category": "Tops", "color": "#2B4B8C", "material": "deep navy pima cotton crew neck t-shirt"},
    {"name": "Cream linen button-down", "category": "Tops", "color": "#F5EFD8", "material": "warm cream breathable linen button-down shirt"},
    {"name": "Navy relaxed crew tee", "category": "Tops", "color": "#2B4B8C", "material": "deep navy relaxed fit pima cotton t-shirt"},
    {"name": "Sage green waffle Henley", "category": "Tops", "color": "#6E8B74", "material": "sage green thermal waffle-knit henley shirt"},
    {"name": "Oatmeal linen overshirt", "category": "Tops", "color": "#E3DAC9", "material": "warm oatmeal washed flax linen overshirt"},
    {"name": "Cream linen blouse", "category": "Tops", "color": "#F5EFD8", "material": "warm off-white European flax linen blouse"},
    {"name": "Cobalt silk-modal blouse", "category": "Tops", "color": "#1E40AF", "material": "vivid cobalt blue smooth silk-modal blouse"},
    {"name": "Emerald satin wrap top", "category": "Tops", "color": "#0F766E", "material": "rich emerald teal lustrous satin wrap blouse"},
    {"name": "Snoopy graphic studio tee", "category": "Tops", "color": "#FAF9F5", "material": "vintage cream cotton t-shirt with cute cartoon beagle graphic print"},
    {"name": "Light blue button-up shirt", "category": "Tops", "color": "#A9D7F2", "material": "light blue cotton short-sleeve button-up shirt"},
    {"name": "Navy crew tee", "category": "Tops", "color": "#2B4B8C", "material": "deep navy cotton crew neck tee"},
    {"name": "Magenta silk blouse", "category": "Tops", "color": "#CE005A", "material": "vivid magenta satin silk blouse"},
    {"name": "Gold knit cardigan", "category": "Tops", "color": "#FFCB44", "material": "warm gold soft knit cardigan sweater"},
    {"name": "Detected Cotton Tee", "category": "Tops", "color": "#69D5E6", "material": "soft turquoise cotton jersey t-shirt"},

    # Bottoms
    {"name": "Black wide-leg trousers", "category": "Bottoms", "color": "#1A1A2E", "material": "midnight black drapey crepe wide-leg pleated trousers"},
    {"name": "Slim medium jeans", "category": "Bottoms", "color": "#4A6FA5", "material": "medium indigo slim straight denim jeans"},
    {"name": "Camel wide trousers", "category": "Bottoms", "color": "#C8965A", "material": "warm camel wool-blend twill wide-leg trousers"},
    {"name": "Pleated charcoal midi skirt", "category": "Bottoms", "color": "#3A3D4D", "material": "charcoal grey pleated chiffon midi skirt"},
    {"name": "Navy tailored chinos", "category": "Bottoms", "color": "#22345E", "material": "midnight navy stretch cotton tailored chino pants"},
    {"name": "Charcoal wool dress trousers", "category": "Bottoms", "color": "#2E323D", "material": "deep charcoal worsted wool tailored dress trousers"},
    {"name": "Slim dark indigo jeans", "category": "Bottoms", "color": "#2A426E", "material": "dark indigo selvedge stretch denim jeans"},
    {"name": "Olive relaxed chinos", "category": "Bottoms", "color": "#556B2F", "material": "forest olive brushed cotton twill chinos"},
    {"name": "Ivory relaxed linen pants", "category": "Bottoms", "color": "#F3EFE0", "material": "bright ivory soft-washed linen relaxed trousers"},
    {"name": "Dark indigo pull-on denim", "category": "Bottoms", "color": "#2E436E", "material": "deep indigo stretch knit pull-on denim jeans"},
    {"name": "Tailored navy trousers", "category": "Bottoms", "color": "#22345E", "material": "deep navy structured gabardine trousers"},
    {"name": "Blue jeans", "category": "Bottoms", "color": "#315A91", "material": "classic medium blue denim jeans"},

    # Shoes
    {"name": "Chunky platform sneakers", "category": "Shoes", "color": "#E8E8E8", "material": "cloud white canvas and chunky platform sole sneakers"},
    {"name": "Black lug-sole Mary Janes", "category": "Shoes", "color": "#181820", "material": "onyx black matte leather lug-sole Mary Jane shoes with buckle strap"},
    {"name": "White leather sneakers", "category": "Shoes", "color": "#F2F2F2", "material": "crisp white full-grain leather minimalist court sneakers"},
    {"name": "Tan leather loafers", "category": "Shoes", "color": "#B8825A", "material": "cognac tan stitched leather penny loafers"},
    {"name": "Black leather dress Oxfords", "category": "Shoes", "color": "#15161D", "material": "polished black calfskin cap-toe dress Oxford shoes"},
    {"name": "Black slip-on leather loafers", "category": "Shoes", "color": "#171820", "material": "matte black sleek leather slip-on loafers"},
    {"name": "Tan suede desert boots", "category": "Shoes", "color": "#B8825A", "material": "sandstone tan brushed suede chukka desert boots"},
    {"name": "Black cushioned ballet loafers", "category": "Shoes", "color": "#15161F", "material": "jet black soft leather ballet loafers"},
    {"name": "Tan memory-foam loafers", "category": "Shoes", "color": "#B8825A", "material": "warm tan soft suede slip-on loafers"},
    {"name": "Black pointed-toe ankle boots", "category": "Shoes", "color": "#161822", "material": "onyx black smooth calfskin pointed-toe ankle boots"},

    # Outerwear
    {"name": "Teal trench coat", "category": "Outerwear", "color": "#007880", "material": "deep teal water-resistant cotton gabardine belted trench coat"},
    {"name": "Teal Gabardine Trench", "category": "Outerwear", "color": "#007880", "material": "deep teal water-resistant cotton gabardine belted trench coat"},
    {"name": "Navy structured knit blazer", "category": "Outerwear", "color": "#1B2A4A", "material": "executive navy tailored structured knit blazer"},
    {"name": "Slate bomber jacket", "category": "Outerwear", "color": "#4B5563", "material": "slate grey matte technical twill zip bomber jacket"},
    {"name": "Earth-tone quilted jacket", "category": "Outerwear", "color": "#8C6239", "material": "warm chestnut diamond-quilted lightweight jacket"},
    {"name": "Heather grey zip hoodie", "category": "Outerwear", "color": "#9CA3AF", "material": "heather grey french terry cotton zip-up hoodie"},
    {"name": "Soft bamboo-knit cardigan", "category": "Outerwear", "color": "#E5C158", "material": "high-contrast warm gold bamboo-knit cardigan with large buttons"},
    {"name": "High-contrast black trench coat", "category": "Outerwear", "color": "#1A1C26", "material": "midnight black gabardine double-breasted trench coat"},
    {"name": "Tailored cream blazer", "category": "Outerwear", "color": "#EFE8D5", "material": "ivory cream linen-cotton tailored blazer"},

    # Accessories
    {"name": "Silver moon pendant & choker", "category": "Accessories", "color": "#CBD5E1", "material": "sterling silver crescent moon pendant on black velvet choker necklace"},
    {"name": "Silver chronograph watch", "category": "Accessories", "color": "#94A3B8", "material": "brushed stainless steel chronograph wristwatch"},
    {"name": "Canvas crossbody tote", "category": "Accessories", "color": "#D6C7B2", "material": "natural organic duck canvas crossbody tote bag"},
    {"name": "Tactile braided leather belt", "category": "Accessories", "color": "#8B5A2B", "material": "cognac brown braided leather belt with brass buckle"},
    {"name": "Brushed gold cuff bracelet", "category": "Accessories", "color": "#FFCB44", "material": "warm brushed gold minimalist cuff bracelet"},
    {"name": "Gold hoop earrings & Snoopy pin", "category": "Accessories", "color": "#FFCB44", "material": "warm 18k gold hoop earrings with cute enamel pin"},
    {"name": "Gold hoop earrings", "category": "Accessories", "color": "#FFCB44", "material": "warm 18k gold polished hoop earrings"},

    # Full Body (Dresses, Jumpsuits, Boilersuits, Coveralls)
    {"name": "Black belted midi dress", "category": "Full Body", "color": "#1A1A2E", "material": "midnight black fluid viscose belted midi dress"},
    {"name": "Olive utility jumpsuit", "category": "Full Body", "color": "#556B2F", "material": "forest olive soft washed cotton twill utility jumpsuit"},
    {"name": "Burgundy velvet wrap dress", "category": "Full Body", "color": "#6A1A32", "material": "deep burgundy soft silk-touch velvet wrap midi dress"},
    {"name": "Black belted jumpsuit", "category": "Full Body", "color": "#1A1A2E", "material": "midnight black fluid crepe wide-leg belted jumpsuit"},
    {"name": "Charcoal tailored boilersuit", "category": "Full Body", "color": "#2E323D", "material": "deep charcoal brushed cotton twill tailored boilersuit"},
    {"name": "Navy utility coveralls", "category": "Full Body", "color": "#1B2A4A", "material": "executive navy stretch cotton gabardine utility coveralls"},
    {"name": "Olive relaxed utility jumpsuit", "category": "Full Body", "color": "#556B2F", "material": "forest olive washed organic cotton relaxed jumpsuit"},
    {"name": "Oatmeal linen coveralls", "category": "Full Body", "color": "#D6C7B2", "material": "warm oatmeal washed flax linen coveralls"},
    {"name": "Black & white wrap midi dress", "category": "Full Body", "color": "#11131C", "material": "high-contrast onyx black seamless bamboo-modal wrap midi dress with ivory piping"},
    {"name": "Emerald bamboo knit jumpsuit", "category": "Full Body", "color": "#0F766E", "material": "rich emerald teal tagless bamboo viscose knit jumpsuit"},
    {"name": "Emerald satin midi dress", "category": "Full Body", "color": "#0F766E", "material": "rich emerald teal fluid silk-touch satin midi dress"},
    {"name": "Tailored navy utility jumpsuit", "category": "Full Body", "color": "#1B2A4A", "material": "deep navy structured linen-cotton belted utility jumpsuit"},
]


def make_studio_bg(size: int) -> Image.Image:
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    cx, cy = size * 0.5, size * 0.42
    dist = np.sqrt(((x - cx) / (size * 0.68)) ** 2 + ((y - cy) / (size * 0.68)) ** 2)
    falloff = np.clip(1.0 - 0.14 * (dist ** 1.5), 0.86, 1.0)
    bg = np.zeros((size, size, 3), dtype=np.uint8)
    bg[..., 0] = np.clip(251 * falloff, 0, 255).astype(np.uint8)
    bg[..., 1] = np.clip(249 * falloff, 0, 255).astype(np.uint8)
    bg[..., 2] = np.clip(253 * falloff, 0, 255).astype(np.uint8)
    return Image.fromarray(bg, mode="RGB")


def apply_studio_3d_lighting_and_folds(
    garment_img: Image.Image,
    mask_img: Image.Image,
    name: str,
    category: str,
    rgb: tuple[int, int, int],
) -> Image.Image:
    """Compute a 3D normal-mapped heightfield from distance transform + cloth folds + fabric weave."""
    arr = np.array(garment_img).astype(np.float32)
    mask_u8 = np.array(mask_img)
    h, w = mask_u8.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    lower = name.lower()

    # 1. Smooth 3D pillowy silhouette thickness via Euclidean distance transform
    dist = cv2.distanceTransform((mask_u8 > 127).astype(np.uint8), cv2.DIST_L2, 5)
    max_d = max(float(dist.max()), 1.0)
    norm_d = np.clip(dist / (max_d * 0.42), 0.0, 1.0)
    # Smooth cubic volume dome
    volume_h = (1.0 - (1.0 - norm_d) ** 2.2) * 18.0

    # 2. Cloth drapery folds & garment-specific height relief
    fold_freq = 0.024 if category in ("Tops", "Outerwear", "Bottoms", "Full Body") else 0.014
    fold_amp = 3.2 if category in ("Tops", "Bottoms", "Full Body") else (2.4 if category == "Outerwear" else 1.2)
    if "pleat" in lower or "skirt" in lower:
        fold_wave = np.sin((xx - w * 0.5) * 0.095) * 4.8
    elif category == "Full Body" and any(k in lower for k in ("dress", "gown")):
        skirt_t = np.clip((yy - h * 0.42) / (h * 0.48), 0.0, 1.0)
        fold_wave = np.sin((xx - w * 0.5) * 0.068) * (2.2 + 3.4 * skirt_t)
    elif "cable" in lower:
        fold_wave = np.sin(xx * 0.08) * np.cos(yy * 0.065 + np.sin(xx * 0.08)) * 3.6
    elif "ribbed" in lower:
        fold_wave = np.sin(xx * 0.34) * 1.9 + np.sin(xx * fold_freq + np.sin(yy * 0.008) * 1.6) * 2.2
    elif "waffle" in lower:
        fold_wave = (np.sin(xx * 0.22) * np.sin(yy * 0.22)) * 2.1 + np.sin(xx * fold_freq) * 1.8
    elif "quilted" in lower:
        q1 = np.abs(np.sin((xx + yy) * 0.036))
        q2 = np.abs(np.sin((xx - yy) * 0.036))
        fold_wave = (q1 * q2) * 4.2
    else:
        fold_wave = (
            np.sin((xx - w * 0.5) * fold_freq + np.sin(yy * 0.007) * 1.8) * fold_amp
            + 0.45 * np.sin((xx - w * 0.45) * (fold_freq * 2.1) - yy * 0.004) * fold_amp
        )

    # Subtle fabric grain (weaves, denim twill, linen)
    grain = np.zeros((h, w), dtype=np.float32)
    if "denim" in lower or "jean" in lower:
        grain = 0.55 * np.sin((xx + yy) * 0.65)
    elif "linen" in lower:
        grain = 0.38 * (np.sin(xx * 0.72) + np.sin(yy * 0.72))
    elif category in ("Tops", "Outerwear", "Bottoms", "Full Body"):
        grain = 0.16 * (np.sin(xx * 0.82) + np.sin(yy * 0.82))

    heightfield = volume_h + fold_wave + grain
    heightfield = cv2.GaussianBlur(heightfield, (0, 0), sigmaX=1.4)

    # 3. Surface normals from heightfield gradients
    gx = cv2.Sobel(heightfield, cv2.CV_32F, 1, 0, ksize=3) * 0.24
    gy = cv2.Sobel(heightfield, cv2.CV_32F, 0, 1, ksize=3) * 0.24
    nz = np.ones_like(gx)
    inv_len = 1.0 / np.sqrt(gx * gx + gy * gy + nz * nz + 1e-6)
    nx, ny, nz = -gx * inv_len, -gy * inv_len, nz * inv_len

    # Key light (top-left-front) + Rim light (right-top)
    lx, ly, lz = -0.34, -0.46, 0.82
    ndotl = np.clip(nx * lx + ny * ly + nz * lz, 0.0, 1.0)
    rx, ry, rz = 0.52, -0.22, 0.82
    ndotr = np.clip(nx * rx + ny * ry + nz * rz, 0.0, 1.0)

    # Specular sheen depending on material
    is_shiny = any(k in lower for k in ["satin", "silk", "gold", "silver", "watch", "oxford", "mary jane", "leather"])
    spec_power = 28.0 if is_shiny else 10.0
    spec_strength = 0.26 if is_shiny else 0.06
    hx, hy, hz = -0.18, -0.24, 0.95
    ndoth = np.clip(nx * hx + ny * hy + nz * hz, 0.0, 1.0)
    spec = (ndoth ** spec_power) * spec_strength

    # Subtle denim whiskering & fade highlights
    if "denim" in lower or "jean" in lower:
        fade_l = np.exp(-(((xx - w * 0.36) / S(55)) ** 2 + ((yy - h * 0.46) / S(145)) ** 2))
        fade_r = np.exp(-(((xx - w * 0.64) / S(55)) ** 2 + ((yy - h * 0.46) / S(145)) ** 2))
        arr += (fade_l + fade_r)[..., None] * 18.0

    # Ambient occlusion near silhouette edge so garment lifts cleanly off backdrop
    ao = 0.86 + 0.14 * np.clip(norm_d * 1.4, 0.0, 1.0)
    lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255.0

    if lum < 0.16:
        # Dark garments need crisp rim/specular separation so seams and folds read cleanly
        lit = arr * (0.76 + 0.42 * ndotl + 0.18 * ndotr)[..., None] + (spec * 145.0)[..., None]
        lit *= ao[..., None]
        lit = np.maximum(lit, 16.0)
    elif lum > 0.84:
        # White/ivory garments keep bright studio whites without muddying shadows
        lit = arr * (0.88 + 0.14 * ndotl + 0.04 * ndotr)[..., None] + (spec * 30.0)[..., None]
        lit *= (0.94 + 0.06 * ao)[..., None]
    else:
        lit = arr * (0.72 + 0.36 * ndotl + 0.12 * ndotr)[..., None] + (spec * 110.0)[..., None]
        lit *= ao[..., None]

    lit = np.clip(lit, 0, 255).astype(np.uint8)
    shaded = Image.fromarray(lit, mode="RGB")

    # Downsample 1536x1536 -> 768x768 with LANCZOS for ultra-clean anti-aliased edges
    shaded_768 = shaded.resize((BASE_SIZE, BASE_SIZE), Image.Resampling.LANCZOS)
    mask_768 = mask_img.resize((BASE_SIZE, BASE_SIZE), Image.Resampling.LANCZOS)

    studio = make_studio_bg(BASE_SIZE)
    # Two-stage soft ambient + contact studio shadow
    soft_shadow = mask_768.filter(ImageFilter.GaussianBlur(radius=16))
    soft_shadow_np = (np.array(soft_shadow).astype(np.float32) * 0.34).astype(np.uint8)
    studio.paste(Image.new("RGB", (BASE_SIZE, BASE_SIZE), (210, 206, 222)), (0, 14), Image.fromarray(soft_shadow_np, "L"))

    contact_shadow = mask_768.filter(ImageFilter.GaussianBlur(radius=5))
    contact_np = (np.array(contact_shadow).astype(np.float32) * 0.28).astype(np.uint8)
    studio.paste(Image.new("RGB", (BASE_SIZE, BASE_SIZE), (190, 185, 204)), (0, 6), Image.fromarray(contact_np, "L"))

    studio.paste(shaded_768, (0, 0), mask_768)
    return studio


def draw_top_or_outerwear(name: str, rgb: tuple[int, int, int], is_outer: bool) -> tuple[Image.Image, Image.Image]:
    D = DRAW_SIZE
    mask = Image.new("L", (D, D), 0)
    garment = Image.new("RGB", (D, D), BG_HEX)
    md = ImageDraw.Draw(mask)
    gd = ImageDraw.Draw(garment)

    lower = name.lower()
    is_short = any(k in lower for k in ["tee", "short", "button-up"])
    is_cardigan = "cardigan" in lower
    is_hoodie = "hoodie" in lower
    is_bomber = "bomber" in lower
    is_blazer = "blazer" in lower
    is_trench = "trench" in lower
    is_wrap = "wrap" in lower
    is_button = is_outer or any(k in lower for k in ["button", "oxford", "dress shirt", "blouse", "overshirt", "henley"])
    is_mock = "mock" in lower
    is_scoop = "scoop" in lower

    base = rgb
    dark = shade(rgb, -32)
    darker = shade(rgb, -54)
    light = shade(rgb, 28)
    lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255.0
    seam = shade(rgb, 42) if lum < 0.2 else darker

    top_y = 112 if is_trench else 132
    bot_y = 678 if is_trench else (620 if is_outer else 598)
    sh_x_l, sh_x_r = (214, 554) if is_outer else (228, 540)
    waist_in = 18 if (is_blazer or is_wrap or is_trench) else 0
    hem_out = 26 if is_trench else (10 if is_outer else 0)

    if is_short:
        poly = SP([
            (318, top_y),
            (384, top_y + 24),
            (450, top_y),
            (544, top_y + 38),
            (676, top_y + 178),
            (606, top_y + 242),
            (536, top_y + 188),
            (548, bot_y),
            (384, bot_y + 8),
            (220, bot_y),
            (232, top_y + 188),
            (162, top_y + 242),
            (92, top_y + 178),
            (224, top_y + 38),
        ])
    else:
        sl_end_y = 562 if is_trench else 544
        poly = SP([
            (314, top_y),
            (384, top_y + 22),
            (454, top_y),
            (sh_x_r, top_y + 38),
            (684, sl_end_y),
            (614, sl_end_y + 22),
            (536, top_y + 216),
            (546 - waist_in, (top_y + bot_y) / 2),
            (558 + hem_out, bot_y),
            (384, bot_y + 10),
            (210 - hem_out, bot_y),
            (222 + waist_in, (top_y + bot_y) / 2),
            (232, top_y + 216),
            (154, sl_end_y + 22),
            (84, sl_end_y),
            (sh_x_l, top_y + 38),
        ])

    md.polygon(poly, fill=255)
    gd.polygon(poly, fill=base)
    gd.line(poly + [poly[0]], fill=seam, width=S(3))

    # Shoulder & armhole seams + bottom hem stitch
    gd.line(SP([(sh_x_l + 6, top_y + 42), (232, top_y + 216)]), fill=seam, width=S(2))
    gd.line(SP([(sh_x_r - 6, top_y + 42), (536, top_y + 216)]), fill=seam, width=S(2))
    gd.line(SP([(216 - hem_out, bot_y - 12), (384, bot_y - 2), (552 + hem_out, bot_y - 12)]), fill=seam, width=S(1.5))

    if is_hoodie:
        hood = SP([(290, top_y + 24), (322, 74), (384, 62), (446, 74), (478, top_y + 24), (440, top_y + 52), (384, top_y + 62), (328, top_y + 52)])
        md.polygon(hood, fill=255)
        gd.polygon(hood, fill=dark)
        gd.polygon(SP([(324, 96), (384, 82), (444, 96), (432, top_y + 36), (384, top_y + 54), (336, top_y + 36)]), fill=darker)
        gd.line(SP([(384, top_y + 52), (384, bot_y)]), fill=light, width=S(4))
        gd.line(SP([(362, top_y + 52), (358, top_y + 165)]), fill=light, width=S(4))
        gd.line(SP([(406, top_y + 52), (410, top_y + 165)]), fill=light, width=S(4))
        gd.polygon(SP([(274, bot_y - 120), (494, bot_y - 120), (512, bot_y - 24), (256, bot_y - 24)]), fill=mix(base, dark, 0.25), outline=seam, width=S(2))
        gd.line(SP([(384, bot_y - 120), (384, bot_y - 24)]), fill=light, width=S(4))
    elif is_trench or is_blazer:
        gd.polygon(SP([(316, top_y), (384, top_y + 145), (452, top_y), (384, top_y + 28)]), fill=darker)
        for side in (-1, 1):
            lapel = SP([
                (384 + side * 66, top_y + 2),
                (384 + side * 98, top_y + 120),
                (384 + side * 58, top_y + 132),
                (384 + side * 78, top_y + 195),
                (384 + side * 6, top_y + 215),
                (384 + side * 12, top_y + 50),
            ])
            gd.polygon(lapel, fill=mix(base, light, 0.34), outline=seam, width=S(2))
        if is_trench:
            gd.line(SP([(384, top_y + 145), (384, bot_y + 6)]), fill=seam, width=S(3))
            for row_y in (top_y + 185, top_y + 245, top_y + 305, top_y + 400):
                for bx in (352, 416):
                    gd.ellipse((S(bx - 7), S(row_y - 7), S(bx + 7), S(row_y + 7)), fill=(42, 34, 30), outline=light, width=S(1.5))
            belt_y = top_y + 265
            gd.rectangle((S(222), S(belt_y), S(546), S(belt_y + 34)), fill=dark, outline=seam, width=S(2))
            gd.rectangle((S(366), S(belt_y - 3), S(402), S(belt_y + 37)), outline=(195, 175, 138), width=S(4))
        else:
            gd.line(SP([(384, top_y + 210), (384, bot_y)]), fill=seam, width=S(2))
            for row_y in (top_y + 240, top_y + 310):
                gd.ellipse((S(376), S(row_y - 7), S(392), S(row_y + 7)), fill=(45, 40, 38), outline=light, width=S(1.5))
            gd.rectangle((S(256), S(top_y + 325), S(336), S(top_y + 338)), fill=dark, outline=seam, width=S(1.5))
            gd.rectangle((S(432), S(top_y + 325), S(512), S(top_y + 338)), fill=dark, outline=seam, width=S(1.5))
    elif is_cardigan:
        gd.polygon(SP([(318, top_y), (384, top_y + 175), (450, top_y), (384, top_y + 24)]), fill=darker)
        gd.rectangle((S(370), S(top_y + 150), S(398), S(bot_y)), fill=mix(base, dark, 0.25), outline=seam, width=S(1.5))
        for by in range(top_y + 180, bot_y - 40, 62):
            gd.ellipse((S(375), S(by - 9), S(393), S(by + 9)), fill=(92, 62, 36), outline=(240, 220, 185), width=S(2))
        for px in (252, 434):
            gd.rectangle((S(px), S(bot_y - 125), S(px + 82), S(bot_y - 35)), fill=mix(base, light, 0.2), outline=seam, width=S(2))
    elif is_bomber:
        gd.arc((S(312), S(top_y - 18), S(456), S(top_y + 70)), 0, 180, fill=darker, width=S(16))
        gd.line(SP([(384, top_y + 52), (384, bot_y)]), fill=(205, 210, 220), width=S(5))
        gd.rectangle((S(216), S(bot_y - 28), S(552), S(bot_y + 8)), fill=dark, outline=seam, width=S(1.5))
        gd.line(SP([(260, bot_y - 130), (305, bot_y - 50)]), fill=seam, width=S(5))
        gd.line(SP([(508, bot_y - 130), (463, bot_y - 50)]), fill=seam, width=S(5))
    elif is_wrap:
        gd.polygon(SP([(318, top_y), (384, top_y + 175), (450, top_y), (384, top_y + 22)]), fill=darker)
        gd.line(SP([(322, top_y + 10), (470, top_y + 265)]), fill=seam, width=S(3))
        gd.line(SP([(446, top_y + 10), (300, top_y + 265)]), fill=seam, width=S(3))
        gd.rectangle((S(224), S(top_y + 258), S(544), S(top_y + 286)), fill=mix(base, light, 0.28), outline=seam, width=S(2))
        gd.polygon(SP([(468, top_y + 275), (528, top_y + 390), (496, top_y + 402), (446, top_y + 286)]), fill=mix(base, dark, 0.2), outline=seam, width=S(2))
    elif is_button:
        gd.polygon(SP([(316, top_y), (384, top_y + 48), (452, top_y), (384, top_y + 14)]), fill=darker)
        for side in (-1, 1):
            flap = SP([(384 + side * 66, top_y), (384 + side * 80, top_y + 72), (384 + side * 12, top_y + 48)])
            gd.polygon(flap, fill=light, outline=seam, width=S(2))
        placket_bot = top_y + 190 if "henley" in lower else bot_y
        gd.rectangle((S(372), S(top_y + 46), S(396), S(placket_bot)), fill=mix(base, light, 0.18), outline=seam, width=S(1.5))
        btn_count = 3 if "henley" in lower else 6
        step = (placket_bot - (top_y + 74)) // max(1, btn_count)
        for i in range(btn_count):
            by = top_y + 74 + i * step
            gd.ellipse((S(378), S(by - 6), S(390), S(by + 6)), fill=(248, 245, 238), outline=seam, width=S(2))
        if not is_short and "blouse" not in lower:
            gd.rectangle((S(426), S(top_y + 148), S(504), S(top_y + 228)), fill=mix(base, light, 0.14), outline=seam, width=S(2))
    elif is_mock:
        mock = SP([(322, top_y - 24), (446, top_y - 24), (456, top_y + 26), (384, top_y + 42), (312, top_y + 26)])
        md.polygon(mock, fill=255)
        gd.polygon(mock, fill=mix(base, light, 0.15), outline=seam, width=S(2))
    else:
        depth = 86 if is_scoop else 54
        gd.pieslice((S(314), S(top_y - 20), S(454), S(top_y + depth)), 0, 180, fill=darker, outline=seam, width=S(4))
        gd.arc((S(310), S(top_y - 24), S(458), S(top_y + depth + 8)), 0, 180, fill=mix(base, dark, 0.45), width=S(9))

    if any(k in lower for k in ["sweater", "crewneck", "cardigan"]):
        gd.rectangle((S(216), S(bot_y - 28), S(552), S(bot_y + 6)), fill=mix(base, dark, 0.25), outline=seam, width=S(1.5))

    if "snoopy" in lower:
        gd.polygon(SP([(350, 298), (384, 266), (418, 298), (414, 354), (354, 354)]), fill=(208, 48, 48), outline=(35, 35, 40), width=S(3))
        gd.ellipse((S(372), S(316), S(396), S(354)), fill=(35, 35, 40))
        gd.ellipse((S(364), S(244), S(402), S(266)), fill=(255, 255, 255), outline=(30, 30, 35), width=S(3))
        gd.ellipse((S(388), S(238), S(420), S(262)), fill=(255, 255, 255), outline=(30, 30, 35), width=S(3))
        gd.ellipse((S(384), S(246), S(396), S(266)), fill=(30, 30, 35))
        gd.ellipse((S(416), S(244), S(423), S(252)), fill=(30, 30, 35))

    return garment, mask


def draw_bottom(name: str, rgb: tuple[int, int, int]) -> tuple[Image.Image, Image.Image]:
    D = DRAW_SIZE
    mask = Image.new("L", (D, D), 0)
    garment = Image.new("RGB", (D, D), BG_HEX)
    md = ImageDraw.Draw(mask)
    gd = ImageDraw.Draw(garment)

    lower = name.lower()
    is_skirt = "skirt" in lower
    is_wide = any(k in lower for k in ["wide", "relaxed"])
    is_denim = any(k in lower for k in ["jean", "denim"])

    base = rgb
    dark = shade(rgb, -32)
    light = shade(rgb, 24)
    lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255.0
    seam = shade(rgb, 42) if lum < 0.2 else shade(rgb, -50)

    if is_skirt:
        poly = SP([(268, 128), (500, 128), (596, 650), (384, 668), (172, 650)])
        md.polygon(poly, fill=255)
        gd.polygon(poly, fill=base)
        gd.line(poly + [poly[0]], fill=seam, width=S(3))
        gd.rectangle((S(268), S(128), S(500), S(162)), fill=dark, outline=seam, width=S(2))
        for i in range(1, 14):
            t = i / 14.0
            tx = 268 + t * (500 - 268)
            bx = 172 + t * (596 - 172)
            gd.line(SP([(tx, 162), (bx, 654)]), fill=seam if i % 2 == 0 else light, width=S(2))
    else:
        leg_out = 188 if is_wide else 218
        cuff_out = 158 if is_wide else 242
        cuff_in = 344 if is_wide else 356
        poly = SP([
            (238, 114),
            (530, 114),
            (768 - leg_out, 318),
            (768 - cuff_out, 672),
            (768 - cuff_in, 672),
            (396, 336),
            (384, 322),
            (372, 336),
            (cuff_in, 672),
            (cuff_out, 672),
            (leg_out, 318),
        ])
        md.polygon(poly, fill=255)
        gd.polygon(poly, fill=base)
        gd.line(poly + [poly[0]], fill=seam, width=S(3))

        gd.rectangle((S(238), S(114), S(530), S(152)), fill=dark, outline=seam, width=S(2))
        for lx in (256, 326, 442, 512):
            gd.rectangle((S(lx - 5), S(114), S(lx + 5), S(154)), fill=mix(base, light, 0.2), outline=seam, width=S(1.5))
        gd.ellipse((S(376), S(125), S(392), S(141)), fill=(215, 198, 165), outline=seam, width=S(2))

        stitch = (208, 168, 98) if is_denim else seam
        gd.line(SP([(384, 152), (384, 290)]), fill=stitch, width=S(3))
        for side in (-1, 1):
            gd.arc(
                (S(384 + side * 145 - 65), S(152 - 55), S(384 + side * 145 + 65), S(152 + 80)),
                0 if side == -1 else 90,
                90 if side == -1 else 180,
                fill=stitch,
                width=S(3),
            )
            if not is_denim:
                cx_top = 384 + side * 86
                cx_bot = 384 + side * (135 if is_wide else 80)
                gd.line(SP([(cx_top, 230), (cx_bot, 668)]), fill=light, width=S(2))

    return garment, mask


def sample_bezier(pts: list[tuple[float, float]], steps: int = 18) -> list[tuple[int, int]]:
    """Evaluate a quadratic/cubic smooth closed or open polyline via Catmull-Rom interpolation."""
    out: list[tuple[int, int]] = []
    n = len(pts)
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        for s in range(steps):
            t = s / steps
            t2 = t * t
            t3 = t2 * t
            x = 0.5 * (
                (2 * p1[0])
                + (-p0[0] + p2[0]) * t
                + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
            )
            y = 0.5 * (
                (2 * p1[1])
                + (-p0[1] + p2[1]) * t
                + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
            )
            out.append((S(x), S(y)))
    return out


def draw_shoes(name: str, rgb: tuple[int, int, int]) -> tuple[Image.Image, Image.Image]:
    D = DRAW_SIZE
    mask = Image.new("L", (D, D), 0)
    garment = Image.new("RGB", (D, D), BG_HEX)
    md = ImageDraw.Draw(mask)
    gd = ImageDraw.Draw(garment)

    lower = name.lower()
    is_boot = "boot" in lower
    is_platform = "platform" in lower
    is_sneaker = "sneaker" in lower
    is_mary_jane = "mary jane" in lower
    is_oxford = "oxford" in lower

    base = rgb
    dark = shade(rgb, -32)
    light = shade(rgb, 28)
    lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255.0
    seam = shade(rgb, 48) if lum < 0.2 else shade(rgb, -48)
    sole_col = (242, 240, 236) if is_sneaker else (24, 24, 30)

    def draw_one_shoe(dx: int, dy: int, scale: float = 1.0) -> None:
        def fpt(x: float, y: float) -> tuple[float, float]:
            return (dx + x * scale, dy + y * scale)

        def pt(x: float, y: float) -> tuple[int, int]:
            return (S(dx + x * scale), S(dy + y * scale))

        if is_boot:
            upper_ctrl = [
                fpt(54, 40), fpt(158, 36), fpt(175, 138), fpt(248, 174),
                fpt(340, 198), fpt(352, 224), fpt(48, 224), fpt(42, 145),
            ]
            sole = [pt(44, 224), pt(354, 224), pt(346, 244), pt(162, 244), pt(148, 272), pt(46, 272)]
        elif is_mary_jane:
            upper_ctrl = [
                fpt(48, 140), fpt(115, 140), fpt(145, 194), fpt(225, 194),
                fpt(268, 174), fpt(342, 192), fpt(350, 224), fpt(44, 224),
            ]
            sole = [pt(40, 224), pt(354, 224), pt(348, 260), pt(158, 260), pt(144, 272), pt(42, 272)]
        elif is_sneaker:
            sole_h = 52 if is_platform else 28
            upper_ctrl = [
                fpt(46, 128), fpt(128, 122), fpt(196, 146), fpt(290, 178),
                fpt(345, 196), fpt(348, 220), fpt(44, 220),
            ]
            sole = [
                pt(40, 220), pt(352, 220), pt(350, 220 + sole_h - 6),
                pt(338, 220 + sole_h), pt(50, 220 + sole_h), pt(40, 220 + sole_h - 6),
            ]
        else:
            upper_ctrl = [
                fpt(48, 148), fpt(116, 146), fpt(184, 168), fpt(280, 184),
                fpt(344, 198), fpt(352, 224), fpt(44, 224),
            ]
            sole = [pt(42, 224), pt(354, 224), pt(348, 240), pt(148, 240), pt(136, 258), pt(44, 258)]

        upper = sample_bezier(upper_ctrl, steps=10)
        md.polygon(upper, fill=255)
        md.polygon(sole, fill=255)
        gd.polygon(upper, fill=base)
        gd.line(upper + [upper[0]], fill=seam, width=S(2.5))
        gd.polygon(sole, fill=sole_col, outline=seam, width=S(2))

        if is_sneaker:
            for i in range(4):
                lx = 186 + i * 24
                ly = 152 + i * 9
                gd.line([pt(lx, ly), pt(lx + 15, ly - 9)], fill=light if lum < 0.5 else seam, width=S(4))
            gd.line([pt(92, 144), pt(124, 218)], fill=seam, width=S(2))
            gd.line([pt(276, 178), pt(292, 218)], fill=seam, width=S(2))
            # Sole tread groove line
            gd.line([pt(46, 232), pt(346, 232)], fill=seam, width=S(1.5))
        elif is_mary_jane:
            gd.rectangle((S(dx + 162 * scale), S(dy + 132 * scale), S(dx + 186 * scale), S(dy + 196 * scale)), fill=base, outline=seam, width=S(2))
            gd.rectangle((S(dx + 158 * scale), S(dy + 140 * scale), S(dx + 188 * scale), S(dy + 158 * scale)), outline=(198, 205, 215), width=S(3))
        elif is_oxford:
            for i in range(3):
                lx = 176 + i * 18
                ly = 166 + i * 6
                gd.line([pt(lx, ly), pt(lx + 10, ly - 8)], fill=seam, width=S(3))
            gd.line([pt(276, 184), pt(268, 224)], fill=seam, width=S(2))
        elif not is_boot:
            gd.polygon([pt(175, 166), pt(225, 176), pt(215, 204), pt(165, 198)], fill=mix(base, light, 0.25), outline=seam, width=S(2))
        else:
            gd.polygon([pt(92, 62), pt(142, 62), pt(142, 148), pt(92, 148)], fill=dark, outline=seam, width=S(1.5))

    draw_one_shoe(218, 165, 0.90)
    draw_one_shoe(174, 336, 1.04)
    return garment, mask


def draw_accessory(name: str, rgb: tuple[int, int, int]) -> tuple[Image.Image, Image.Image]:
    D = DRAW_SIZE
    mask = Image.new("L", (D, D), 0)
    garment = Image.new("RGB", (D, D), BG_HEX)
    md = ImageDraw.Draw(mask)
    gd = ImageDraw.Draw(garment)

    lower = name.lower()
    if "moon" in lower or "choker" in lower:
        md.arc((S(190), S(120), S(578), S(360)), 0, 180, fill=255, width=S(34))
        gd.arc((S(190), S(120), S(578), S(360)), 0, 180, fill=(28, 28, 34), width=S(34))
        md.arc((S(220), S(130), S(548), S(490)), 10, 170, fill=255, width=S(8))
        gd.arc((S(220), S(130), S(548), S(490)), 10, 170, fill=(210, 218, 228), width=S(8))
        # Render crescent moon cleanly on an isolated layer so cutout never erases the chain
        moon_mask = Image.new("L", (D, D), 0)
        moon_rgb = Image.new("RGB", (D, D), (224, 232, 242))
        mm = ImageDraw.Draw(moon_mask)
        mr = ImageDraw.Draw(moon_rgb)
        mm.ellipse((S(340), S(455), S(428), S(543)), fill=255)
        mr.ellipse((S(340), S(455), S(428), S(543)), fill=(228, 236, 246), outline=(140, 152, 168), width=S(3))
        mm.ellipse((S(364), S(458), S(444), S(536)), fill=0)
        garment.paste(moon_rgb, (0, 0), moon_mask)
        mask.paste(255, (0, 0), moon_mask)
    elif "watch" in lower:
        md.rectangle((S(318), S(120), S(450), S(648)), fill=255)
        gd.rectangle((S(318), S(120), S(450), S(648)), fill=(176, 184, 196), outline=(105, 115, 128), width=S(3))
        for y in range(135, 640, 34):
            gd.line(SP([(318, y), (450, y)]), fill=(105, 115, 128), width=S(3))
            gd.line(SP([(360, y), (360, y + 34)]), fill=(120, 130, 142), width=S(2))
            gd.line(SP([(408, y), (408, y + 34)]), fill=(120, 130, 142), width=S(2))
        md.ellipse((S(254), S(254), S(514), S(514)), fill=255)
        gd.ellipse((S(254), S(254), S(514), S(514)), fill=(208, 215, 225), outline=(92, 102, 114), width=S(5))
        gd.ellipse((S(278), S(278), S(490), S(490)), fill=(26, 36, 56), outline=(170, 180, 194), width=S(3))
        for cx, cy in ((342, 384), (426, 384), (384, 434)):
            gd.ellipse((S(cx - 24), S(cy - 24), S(cx + 24), S(cy + 24)), fill=(42, 56, 82), outline=(185, 194, 206), width=S(2))
        gd.line(SP([(384, 384), (384, 304)]), fill=(240, 244, 250), width=S(5))
        gd.line(SP([(384, 384), (446, 408)]), fill=(240, 244, 250), width=S(4))
    elif "tote" in lower:
        md.arc((S(270), S(108), S(498), S(340)), 180, 360, fill=255, width=S(26))
        gd.arc((S(270), S(108), S(498), S(340)), 180, 360, fill=shade(rgb, -24), width=S(26))
        bag = SP([(192, 260), (576, 260), (548, 636), (220, 636)])
        md.polygon(bag, fill=255)
        gd.polygon(bag, fill=rgb, outline=shade(rgb, -50), width=S(4))
        gd.rectangle((S(296), S(355), S(472), S(520)), fill=shade(rgb, -14), outline=shade(rgb, -48), width=S(3))
        gd.line(SP([(325, 260), (325, 355)]), fill=shade(rgb, -40), width=S(8))
        gd.line(SP([(443, 260), (443, 355)]), fill=shade(rgb, -40), width=S(8))
    elif "belt" in lower:
        md.ellipse((S(194), S(214), S(574), S(554)), fill=255)
        gd.ellipse((S(194), S(214), S(574), S(554)), fill=rgb, outline=shade(rgb, -45), width=S(4))
        md.ellipse((S(248), S(268), S(520), S(500)), fill=0)
        gd.ellipse((S(248), S(268), S(520), S(500)), fill=BG_HEX, outline=shade(rgb, -45), width=S(4))
        md.rectangle((S(480), S(345), S(588), S(428)), fill=255)
        gd.rectangle((S(480), S(345), S(588), S(428)), outline=(212, 175, 85), width=S(14))
    elif "cuff" in lower:
        md.arc((S(204), S(230), S(564), S(540)), 25, 335, fill=255, width=S(68))
        gd.arc((S(204), S(230), S(564), S(540)), 25, 335, fill=(238, 190, 74), width=S(68))
        gd.arc((S(218), S(244), S(550), S(526)), 28, 332, fill=(255, 224, 128), width=S(26))
    else:
        for cx in (284, 484):
            md.ellipse((S(cx - 88), S(260), S(cx + 88), S(490)), fill=255)
            gd.ellipse((S(cx - 88), S(260), S(cx + 88), S(490)), fill=(242, 194, 72), outline=(176, 128, 28), width=S(4))
            md.ellipse((S(cx - 56), S(294), S(cx + 56), S(456)), fill=0)
            gd.ellipse((S(cx - 56), S(294), S(cx + 56), S(456)), fill=BG_HEX, outline=(196, 148, 42), width=S(3))
        if "snoopy" in lower:
            md.ellipse((S(340), S(505), S(428), S(593)), fill=255)
            gd.ellipse((S(340), S(505), S(428), S(593)), fill=(252, 248, 240), outline=(212, 165, 52), width=S(5))
            # Cute beagle enamel pin silhouette inside gold rim
            gd.ellipse((S(358), S(536), S(392), S(564)), fill=(255, 255, 255), outline=(35, 35, 42), width=S(2))
            gd.ellipse((S(378), S(528), S(412), S(558)), fill=(255, 255, 255), outline=(35, 35, 42), width=S(2))
            gd.ellipse((S(368), S(544), S(380), S(566)), fill=(35, 35, 42))
            gd.ellipse((S(406), S(536), S(413), S(543)), fill=(35, 35, 42))

    return garment, mask


def draw_full_body(name: str, rgb: tuple[int, int, int]) -> tuple[Image.Image, Image.Image]:
    D = DRAW_SIZE
    mask = Image.new("L", (D, D), 0)
    garment = Image.new("RGB", (D, D), BG_HEX)
    md = ImageDraw.Draw(mask)
    gd = ImageDraw.Draw(garment)

    lower = name.lower()
    is_jumpsuit = any(k in lower for k in ["jumpsuit", "boilersuit", "coverall", "overall", "romper"])
    is_romper = "romper" in lower
    is_wrap = "wrap" in lower
    is_belted = "belt" in lower or "wrap" in lower or is_jumpsuit
    is_utility = any(k in lower for k in ["utility", "boilersuit", "coverall"])
    is_high_contrast_piping = "black & white" in lower or "contrast" in lower
    is_sleeveless = any(k in lower for k in ["satin", "slip", "camisole", "tank"]) and not is_jumpsuit

    base = rgb
    dark = shade(rgb, -32)
    darker = shade(rgb, -54)
    light = shade(rgb, 28)
    lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255.0
    seam = (242, 240, 236) if is_high_contrast_piping else (shade(rgb, 44) if lum < 0.2 else darker)

    top_y = 84
    waist_y = 308
    bot_y = 486 if is_romper else 686

    if is_jumpsuit:
        sh_l, sh_r = 252, 516
        sl_end_y = 342 if "short" in lower else 402
        leg_out = 236
        cuff_out = 212 if "wide" in lower or "relaxed" in lower or "belted" in lower else 234
        cuff_in = 352 if "wide" in lower or "belted" in lower else 360

        poly = SP([
            (322, top_y),
            (384, top_y + 26),
            (446, top_y),
            (sh_r, top_y + 34),
            (652, sl_end_y),
            (592, sl_end_y + 22),
            (504, top_y + 170),
            (474, waist_y),
            (768 - leg_out, 412),
            (768 - cuff_out, bot_y),
            (768 - cuff_in, bot_y),
            (394, 446),
            (384, 434),
            (374, 446),
            (cuff_in, bot_y),
            (cuff_out, bot_y),
            (leg_out, 412),
            (294, waist_y),
            (264, top_y + 170),
            (176, sl_end_y + 22),
            (116, sl_end_y),
            (sh_l, top_y + 34),
        ])
        md.polygon(poly, fill=255)
        gd.polygon(poly, fill=base)
        gd.line(poly + [poly[0]], fill=seam, width=S(3))

        # Collar & front placket / zip
        gd.polygon(SP([(322, top_y), (384, top_y + 84), (446, top_y), (384, top_y + 20)]), fill=darker)
        for side in (-1, 1):
            lapel = SP([
                (384 + side * 62, top_y + 2),
                (384 + side * 82, top_y + 72),
                (384 + side * 12, top_y + 62),
            ])
            gd.polygon(lapel, fill=mix(base, light, 0.28), outline=seam, width=S(2))
        gd.line(SP([(384, top_y + 78), (384, 434)]), fill=seam, width=S(3))

        if is_utility:
            # Chest utility pockets & buttons
            for px in (290, 416):
                gd.rectangle((S(px), S(top_y + 92), S(px + 62), S(top_y + 158)), fill=mix(base, light, 0.14), outline=seam, width=S(2))
            for by in range(top_y + 98, waist_y - 12, 46):
                gd.ellipse((S(379), S(by - 5), S(389), S(by + 5)), fill=(228, 224, 214), outline=seam, width=S(1.5))

        # Waistband / sash belt
        gd.rectangle((S(292), S(waist_y - 14), S(476), S(waist_y + 16)), fill=dark, outline=seam, width=S(2))
        gd.rectangle((S(368), S(waist_y - 17), S(400), S(waist_y + 19)), outline=(205, 188, 152), width=S(3))
        if "belted" in lower:
            gd.polygon(SP([(386, waist_y + 14), (424, waist_y + 96), (402, waist_y + 104), (374, waist_y + 18)]), fill=mix(base, light, 0.16), outline=seam, width=S(2))

        # Trouser pleats / center creases
        for side in (-1, 1):
            gd.line(SP([(384 + side * 66, waist_y + 42), (384 + side * 74, bot_y - 12)]), fill=light, width=S(2))
    else:
        # Dress silhouette (Wrap / A-line / Midi / Slip)
        sh_l, sh_r = (284, 484) if is_sleeveless else (256, 512)
        hem_l, hem_r = 166, 602
        waist_l, waist_r = 298, 470

        if is_sleeveless:
            poly = SP([
                (308, top_y + 6),
                (334, top_y + 8),
                (344, top_y + 96),
                (384, top_y + 124),
                (424, top_y + 96),
                (434, top_y + 8),
                (460, top_y + 6),
                (482, top_y + 150),
                (waist_r, waist_y),
                (hem_r, bot_y - 16),
                (384, bot_y + 10),
                (hem_l, bot_y - 16),
                (waist_l, waist_y),
                (286, top_y + 150),
            ])
        else:
            sl_end_y = 334 if "wrap" in lower or "midi" in lower else 258
            poly = SP([
                (322, top_y),
                (384, top_y + 34),
                (446, top_y),
                (sh_r, top_y + 34),
                (630, sl_end_y),
                (572, sl_end_y + 20),
                (496, top_y + 165),
                (waist_r, waist_y),
                (hem_r, bot_y - 16),
                (384, bot_y + 10),
                (hem_l, bot_y - 16),
                (waist_l, waist_y),
                (272, top_y + 165),
                (196, sl_end_y + 20),
                (138, sl_end_y),
                (sh_l, top_y + 34),
            ])

        md.polygon(poly, fill=255)
        gd.polygon(poly, fill=base)
        gd.line(poly + [poly[0]], fill=seam, width=S(3))

        if is_wrap:
            # Wrap V-neck surplice crossover & drape overlap
            gd.polygon(SP([(322, top_y), (384, top_y + 132), (446, top_y), (384, top_y + 28)]), fill=darker)
            gd.line(SP([(326, top_y + 8), (438, waist_y - 6)]), fill=seam, width=S(3.5))
            gd.line(SP([(442, top_y + 8), (330, waist_y - 6)]), fill=seam, width=S(3.5))
            gd.line(SP([(418, waist_y + 12), (464, bot_y - 12)]), fill=seam, width=S(2.5))
        elif not is_sleeveless:
            gd.pieslice((S(320), S(top_y - 14), S(448), S(top_y + 64)), 0, 180, fill=darker, outline=seam, width=S(3))

        if is_belted:
            gd.rectangle((S(waist_l - 2), S(waist_y - 13), S(waist_r + 2), S(waist_y + 14)), fill=dark, outline=seam, width=S(2))
            gd.polygon(SP([(428, waist_y + 12), (474, waist_y + 114), (448, waist_y + 122), (412, waist_y + 14)]), fill=mix(base, light, 0.2), outline=seam, width=S(2))
            gd.polygon(SP([(410, waist_y + 12), (438, waist_y + 88), (416, waist_y + 94), (398, waist_y + 14)]), fill=mix(base, light, 0.12), outline=seam, width=S(2))

        # Subtle skirt drape folds
        for i in range(1, 7):
            t = i / 7.0
            tx = waist_l + t * (waist_r - waist_l)
            bx = hem_l + t * (hem_r - hem_l)
            gd.line(SP([(tx, waist_y + 22), (bx, bot_y - 14)]), fill=seam if i % 2 == 0 else light, width=S(2))

    return garment, mask


def build_base_flatlay(item: dict[str, str]) -> tuple[Image.Image, Image.Image]:
    rgb = hex_to_rgb(item["color"])
    cat = item["category"]
    if cat in ("Tops", "Outerwear"):
        return draw_top_or_outerwear(item["name"], rgb, is_outer=(cat == "Outerwear"))
    if cat == "Full Body":
        return draw_full_body(item["name"], rgb)
    if cat == "Bottoms":
        return draw_bottom(item["name"], rgb)
    if cat == "Shoes":
        return draw_shoes(item["name"], rgb)
    return draw_accessory(item["name"], rgb)


def main() -> None:
    import sys

    missing_only = "--missing-only" in sys.argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    unique_items: list[dict[str, str]] = []
    for item in GARMENTS:
        sl = slugify(item["name"])
        if sl not in seen:
            seen.add(sl)
            unique_items.append(item)

    print(f"Generating {len(unique_items)} studio wardrobe product images in {OUT_DIR} (missing_only={missing_only})...")
    for idx, item in enumerate(unique_items, 1):
        sl = slugify(item["name"])
        out_path = OUT_DIR / f"{sl}.png"
        if missing_only and out_path.exists():
            continue
        rgb = hex_to_rgb(item["color"])
        garment_img, mask_img = build_base_flatlay(item)
        final_img = apply_studio_3d_lighting_and_folds(
            garment_img, mask_img, item["name"], item["category"], rgb
        )
        final_img.save(out_path, format="PNG", optimize=True)
        print(f"[{idx}/{len(unique_items)}] saved public/wardrobe/{sl}.png")

    print("Done generating all wardrobe images!")


if __name__ == "__main__":
    main()
