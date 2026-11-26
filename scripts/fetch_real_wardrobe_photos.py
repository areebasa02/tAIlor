"""Fetch real, high-resolution studio product photos for all 73 demo wardrobe items in public/wardrobe/.

Primary source: Hugging Face `benitomartin/fashion-product-images-small-900x1200` (900x1200 isolated studio product catalog)
for academic/non-commercial demo use, with optional Wikimedia Commons fallback for niche items.
Writes attribution log to public/wardrobe/SOURCES.md and .licenses/WARDROBE_PHOTOS_LICENSE.md.
"""

from __future__ import annotations

import io
import json
import os
import re
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WARDROBE_DIR = ROOT / "public" / "wardrobe"
LICENSES_DIR = ROOT / ".licenses"
DATASET_ID = "benitomartin/fashion-product-images-small-900x1200"

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


# Target specifications: (slug -> article_types, preferred_colors, bonus_keywords, prefer_flatlay)
ITEM_SPECS: dict[str, tuple[list[str], list[str], list[str], bool]] = {
    "black-and-white-wrap-midi-dress": (["Dresses"], ["Black", "White"], ["wrap", "black", "white", "midi", "print"], True),
    "black-belted-jumpsuit": (["Jumpsuit", "Dresses"], ["Black"], ["jumpsuit", "belt", "black"], True),
    "black-belted-midi-dress": (["Dresses"], ["Black"], ["black", "belt", "midi", "dress"], True),
    "black-cushioned-ballet-loafers": (["Flats", "Casual Shoes"], ["Black"], ["ballet", "flat", "loafer", "black"], False),
    "black-leather-dress-oxfords": (["Formal Shoes"], ["Black"], ["oxford", "lace", "formal", "leather", "black"], False),
    "black-lug-sole-mary-janes": (["Flats", "Heels", "Casual Shoes"], ["Black"], ["strap", "mary", "black", "buckle", "flat"], False),
    "black-pointed-toe-ankle-boots": (["Heels", "Casual Shoes", "Formal Shoes"], ["Black"], ["boot", "ankle", "black", "heel"], False),
    "black-slip-on-leather-loafers": (["Formal Shoes", "Casual Shoes"], ["Black"], ["loafer", "slip", "black", "leather"], False),
    "black-wide-leg-trousers": (["Trousers", "Track Pants"], ["Black"], ["trouser", "pant", "black", "wide"], True),
    "blue-jeans": (["Jeans"], ["Blue"], ["jean", "denim", "blue"], True),
    "brushed-gold-cuff-bracelet": (["Bracelet", "Bangle"], ["Gold"], ["gold", "cuff", "bracelet", "bangle"], False),
    "burgundy-soft-scoop-tee": (["Tshirts", "Tops"], ["Burgundy", "Maroon"], ["burgundy", "maroon", "tee", "t-shirt", "top"], True),
    "burgundy-velvet-wrap-dress": (["Dresses"], ["Burgundy", "Maroon", "Red"], ["maroon", "burgundy", "dress", "wrap"], True),
    "camel-wide-trousers": (["Trousers"], ["Beige", "Khaki", "Tan", "Brown"], ["beige", "khaki", "camel", "trouser", "pant"], True),
    "canvas-crossbody-tote": (["Handbags", "Messenger Bag", "Duffel Bag"], ["Beige", "Cream", "Off White", "Brown", "White"], ["tote", "canvas", "bag", "sling", "crossbody"], False),
    "charcoal-merino-crewneck": (["Sweaters", "Sweatshirts"], ["Charcoal", "Grey"], ["sweater", "pullover", "grey", "charcoal", "knit"], True),
    "charcoal-tailored-boilersuit": (["Jumpsuit", "Suits", "Dresses"], ["Charcoal", "Grey", "Black"], ["jumpsuit", "grey", "charcoal", "suit"], True),
    "charcoal-wool-dress-trousers": (["Trousers"], ["Charcoal", "Grey"], ["charcoal", "grey", "formal", "trouser"], True),
    "chunky-platform-sneakers": (["Casual Shoes", "Sports Shoes"], ["White"], ["sneaker", "white", "casual", "shoe"], False),
    "cobalt-silk-modal-blouse": (["Tops", "Shirts"], ["Blue"], ["blue", "cobalt", "top", "blouse", "shirt"], True),
    "cream-linen-blouse": (["Tops", "Shirts"], ["Cream", "Off White", "Beige", "White"], ["cream", "off white", "beige", "top", "blouse"], True),
    "cream-linen-button-down": (["Shirts", "Tops"], ["Cream", "Off White", "Beige", "White"], ["cream", "beige", "off white", "shirt", "linen"], True),
    "crisp-white-cotton-tee": (["Tshirts"], ["White"], ["white", "solid", "t-shirt", "crew", "cotton"], True),
    "crisp-white-oxford-shirt": (["Shirts"], ["White"], ["white", "formal", "shirt", "solid", "oxford"], True),
    "dark-indigo-pull-on-denim": (["Jeans"], ["Navy Blue", "Blue"], ["dark", "navy", "indigo", "jean"], True),
    "detected-cotton-tee": (["Tshirts"], ["Turquoise Blue", "Teal", "Blue"], ["turquoise", "teal", "blue", "t-shirt"], True),
    "earth-tone-quilted-jacket": (["Jackets"], ["Brown", "Tan", "Khaki", "Olive"], ["brown", "jacket", "quilt", "tan"], True),
    "emerald-bamboo-knit-jumpsuit": (["Jumpsuit", "Dresses"], ["Green", "Teal", "Sea Green"], ["green", "teal", "emerald", "jumpsuit", "dress"], True),
    "emerald-satin-midi-dress": (["Dresses"], ["Green", "Teal", "Sea Green"], ["green", "teal", "emerald", "dress", "midi"], True),
    "emerald-satin-wrap-top": (["Tops", "Shirts"], ["Green", "Teal", "Sea Green"], ["green", "teal", "top", "blouse"], True),
    "gold-hoop-earrings": (["Earrings"], ["Gold"], ["gold", "hoop", "earring"], False),
    "gold-hoop-earrings-and-snoopy-pin": (["Earrings", "Jewellery Set"], ["Gold"], ["gold", "earring", "hoop", "drop"], False),
    "gold-knit-cardigan": (["Sweaters", "Jackets", "Shrug"], ["Mustard", "Yellow", "Gold"], ["yellow", "mustard", "cardigan", "sweater", "shrug"], True),
    "heather-grey-zip-hoodie": (["Sweatshirts", "Jackets"], ["Grey", "Grey Melange"], ["hoodie", "sweatshirt", "grey", "zip"], True),
    "high-contrast-black-trench-coat": (["Jackets", "Blazers", "Coats"], ["Black"], ["black", "coat", "trench", "jacket", "blazer"], True),
    "ivory-relaxed-linen-pants": (["Trousers", "Capris"], ["Off White", "White", "Cream", "Beige"], ["white", "off white", "cream", "beige", "trouser", "pant"], True),
    "lavender-cable-knit-sweater": (["Sweaters", "Sweatshirts", "Tops"], ["Lavender", "Purple", "Mauve"], ["lavender", "purple", "lilac", "sweater", "knit"], True),
    "light-blue-button-up-shirt": (["Shirts"], ["Blue"], ["light blue", "sky", "blue", "shirt", "solid"], True),
    "magenta-button-down": (["Shirts", "Tops"], ["Magenta", "Pink"], ["magenta", "pink", "shirt"], True),
    "magenta-silk-blouse": (["Tops", "Shirts"], ["Magenta", "Pink"], ["magenta", "pink", "top", "blouse"], True),
    "mint-ribbed-mock-neck": (["Tops", "Tshirts", "Sweaters"], ["Sea Green", "Green", "Turquoise Blue"], ["mint", "sea green", "green", "top", "knit"], True),
    "navy-crew-tee": (["Tshirts"], ["Navy Blue"], ["navy", "solid", "t-shirt", "round"], True),
    "navy-pima-crew-tee": (["Tshirts"], ["Navy Blue"], ["navy", "t-shirt", "polo", "solid"], True),
    "navy-relaxed-crew-tee": (["Tshirts"], ["Navy Blue", "Blue"], ["navy", "blue", "t-shirt", "casual"], True),
    "navy-structured-knit-blazer": (["Blazers", "Jackets"], ["Navy Blue", "Blue"], ["navy", "blazer", "suit", "jacket"], True),
    "navy-tailored-chinos": (["Trousers"], ["Navy Blue"], ["navy", "chino", "trouser", "pant"], True),
    "navy-utility-coveralls": (["Jumpsuit", "Suits", "Dresses"], ["Navy Blue", "Blue"], ["navy", "blue", "jumpsuit", "suit"], True),
    "oatmeal-linen-coveralls": (["Jumpsuit", "Dresses"], ["Beige", "Cream", "Off White"], ["beige", "cream", "jumpsuit", "dress"], True),
    "oatmeal-linen-overshirt": (["Shirts", "Jackets"], ["Beige", "Cream", "Off White", "Khaki"], ["beige", "cream", "khaki", "shirt", "linen"], True),
    "olive-relaxed-chinos": (["Trousers"], ["Olive", "Green", "Khaki"], ["olive", "green", "chino", "trouser"], True),
    "olive-relaxed-utility-jumpsuit": (["Jumpsuit", "Dresses", "Trousers"], ["Olive", "Green"], ["olive", "green", "jumpsuit", "cargo"], True),
    "olive-utility-jumpsuit": (["Jumpsuit", "Dresses"], ["Olive", "Green"], ["olive", "green", "jumpsuit", "dress"], True),
    "pastel-pink-tailored-blouse": (["Tops", "Shirts"], ["Pink", "Peach"], ["pink", "peach", "pastel", "shirt", "top", "blouse"], True),
    "pleated-charcoal-midi-skirt": (["Skirts"], ["Grey", "Charcoal", "Black"], ["skirt", "grey", "black", "charcoal", "pleat"], True),
    "sage-green-waffle-henley": (["Tshirts", "Tops", "Shirts"], ["Green", "Olive", "Sea Green"], ["green", "olive", "henley", "t-shirt", "full sleeve"], True),
    "silver-chronograph-watch": (["Watches"], ["Silver", "Steel", "Grey"], ["silver", "steel", "chronograph", "watch"], False),
    "silver-moon-pendant-and-choker": (["Pendant", "Necklace and Chains"], ["Silver"], ["silver", "pendant", "necklace", "chain"], False),
    "sky-blue-pinpoint-dress-shirt": (["Shirts"], ["Blue"], ["blue", "formal", "shirt", "striped", "solid"], True),
    "slate-bomber-jacket": (["Jackets"], ["Grey", "Charcoal", "Black"], ["grey", "charcoal", "bomber", "jacket"], True),
    "slim-dark-indigo-jeans": (["Jeans"], ["Blue", "Navy Blue"], ["slim", "dark", "indigo", "blue", "jean"], True),
    "slim-medium-jeans": (["Jeans"], ["Blue"], ["slim", "blue", "jean", "wash"], True),
    "snoopy-graphic-studio-tee": (["Tshirts"], ["White", "Cream", "Off White", "Grey"], ["snoopy", "peanuts", "cartoon", "printed", "graphic", "white", "t-shirt"], True),
    "soft-bamboo-knit-cardigan": (["Sweaters", "Shrug", "Jackets"], ["Mustard", "Yellow", "Beige", "Gold"], ["mustard", "yellow", "gold", "cardigan", "sweater"], True),
    "tactile-braided-leather-belt": (["Belts"], ["Brown", "Tan"], ["brown", "tan", "leather", "belt", "braid"], False),
    "tailored-cream-blazer": (["Blazers", "Jackets"], ["Beige", "Cream", "Off White", "White"], ["beige", "cream", "white", "blazer", "jacket"], True),
    "tailored-navy-trousers": (["Trousers"], ["Navy Blue"], ["navy", "formal", "trouser"], True),
    "tailored-navy-utility-jumpsuit": (["Jumpsuit", "Suits", "Dresses"], ["Navy Blue"], ["navy", "jumpsuit", "dress", "suit"], True),
    "tan-leather-loafers": (["Formal Shoes", "Casual Shoes"], ["Brown", "Tan"], ["tan", "brown", "loafer", "leather", "slip"], False),
    "tan-memory-foam-loafers": (["Casual Shoes", "Formal Shoes"], ["Tan", "Brown", "Beige"], ["tan", "brown", "beige", "loafer", "casual"], False),
    "tan-suede-desert-boots": (["Casual Shoes", "Formal Shoes"], ["Brown", "Tan", "Beige"], ["boot", "suede", "tan", "brown", "desert"], False),
    "teal-gabardine-trench": (["Jackets", "Blazers", "Coats", "Sweaters"], ["Teal", "Turquoise Blue", "Green", "Blue"], ["teal", "turquoise", "jacket", "coat", "blazer"], True),
    "teal-trench-coat": (["Jackets", "Blazers", "Coats", "Sweaters"], ["Teal", "Green", "Blue"], ["teal", "green", "blue", "coat", "jacket", "trench"], True),
    "white-leather-sneakers": (["Casual Shoes", "Sports Shoes"], ["White"], ["white", "sneaker", "leather", "casual"], False),
}


def is_isolated_flatlay(img: Image.Image) -> tuple[bool, float]:
    """Check if a 900x1200 product photo is a clean white-background flat-lay (no model head/legs touching edges)."""
    small = img.resize((96, 128), Image.Resampling.BILINEAR)
    arr = np.array(small, dtype=np.float32)
    border = np.concatenate([arr[:6, :, :].reshape(-1, 3), arr[:, :6, :].reshape(-1, 3), arr[:, -6:, :].reshape(-1, 3)])
    border_luma = float(border.mean())
    # Top 9% center band: model-worn photos usually have hair/head here; flat-lays are pure white!
    top_center = arr[:12, 24:72]
    top_occ = float((top_center.min(axis=-1) < 232).mean())
    bot_center = arr[116:, 20:76]
    bot_occ = float((bot_center.min(axis=-1) < 232).mean())
    flat = border_luma > 230.0 and top_occ < 0.08 and bot_occ < 0.14
    # Penalize folded retail-box shirts (solid dense rectangle fill > 0.80) so FastFit gets unfolded silhouettes
    fg = (arr.min(axis=-1) < 242) | ((arr.max(axis=-1) - arr.min(axis=-1)) > 12)
    ys, xs = np.where(fg)
    rect_penalty = 0.0
    if len(ys) > 50:
        fill = float(fg[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].mean())
        if fill > 0.80:
            flat = False
            rect_penalty = 2.5
    score = (border_luma / 255.0) - top_occ * 1.5 - bot_occ * 0.8 - rect_penalty
    return flat, score


def save_studio_square(img: Image.Image, out_path: Path, size: int = 768) -> None:
    """Crop white margins cleanly and center the real garment photo onto a crisp 768x768 pure white studio PNG."""
    rgb = img.convert("RGB")
    arr = np.array(rgb, dtype=np.uint8)
    # Detect foreground pixels darker than near-white background
    non_white = (arr.min(axis=-1) < 244) | ((arr.max(axis=-1) - arr.min(axis=-1)) > 12)
    ys, xs = np.where(non_white)
    if len(ys) > 100:
        y0, y1 = max(0, int(ys.min()) - 8), min(arr.shape[0], int(ys.max()) + 9)
        x0, x1 = max(0, int(xs.min()) - 8), min(arr.shape[1], int(xs.max()) + 9)
        rgb = rgb.crop((x0, y0, x1, y1))

    margin = int(size * 0.06)
    avail = size - 2 * margin
    scale = min(avail / max(1, rgb.width), avail / max(1, rgb.height))
    nw = max(16, int(round(rgb.width * scale)))
    nh = max(16, int(round(rgb.height * scale)))
    resized = rgb.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2))
    canvas.save(out_path, format="PNG", optimize=True)


def main() -> None:
    shard_names = [f"data/train-{i:05d}-of-00014.parquet" for i in range(4)]
    records: list[dict[str, Any]] = []
    for shard in shard_names:
        print(f"Downloading/loading {shard}…", flush=True)
        local_pq = hf_hub_download(repo_id=DATASET_ID, filename=shard, repo_type="dataset")
        table = pq.read_table(
            local_pq,
            columns=["id", "gender", "masterCategory", "subCategory", "articleType", "baseColour", "productDisplayName", "image"],
        )
        cols = table.to_pydict()
        n = len(cols["id"])
        for i in range(n):
            gender = str(cols["gender"][i] or "")
            name_str = str(cols["productDisplayName"][i] or "")
            if gender.lower() in {"boys", "girls"} or any(
                k in name_str.lower() for k in ("kids", "boy ", "boys", "girl ", "girls", "toddler", "infant")
            ):
                continue
            records.append(
                {
                    "id": cols["id"][i],
                    "gender": gender,
                    "articleType": str(cols["articleType"][i] or ""),
                    "baseColour": str(cols["baseColour"][i] or ""),
                    "name": name_str,
                    "image": cols["image"][i],
                    "shard": shard,
                }
            )
    print(f"Indexed {len(records)} real 900x1200 product photos.", flush=True)

    used_ids: set[Any] = set()
    manifest_rows: list[str] = []

    for slug in sorted(ITEM_SPECS.keys()):
        art_types, colors, kws, prefer_flat = ITEM_SPECS[slug]
        art_set = {a.lower() for a in art_types}
        col_set = {c.lower() for c in colors}

        candidates: list[tuple[float, dict[str, Any]]] = []
        for rec in records:
            if rec["id"] in used_ids:
                continue
            a_low = rec["articleType"].lower()
            c_low = rec["baseColour"].lower()
            n_low = rec["name"].lower()

            score = 0.0
            if a_low in art_set:
                score += 10.0 if a_low == art_types[0].lower() else 7.5
            elif any(a in n_low for a in art_set):
                score += 4.0
            else:
                continue

            if c_low in col_set:
                score += 6.5 if c_low == colors[0].lower() else 4.5
            elif any(c in n_low for c in col_set):
                score += 3.0

            for kw in kws:
                if kw in n_low:
                    score += 2.2
            if score >= 8.0:
                candidates.append((score, rec))

        candidates.sort(key=lambda x: x[0], reverse=True)
        best_rec = None
        best_img = None
        best_total = -1e9

        for meta_score, rec in candidates[:18]:
            img_field = rec["image"]
            raw_bytes = img_field.get("bytes") if isinstance(img_field, dict) else None
            if not raw_bytes:
                continue
            try:
                im = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
            except Exception:
                continue
            flat, flat_score = is_isolated_flatlay(im)
            total = meta_score + (flat_score * 4.0 if prefer_flat else flat_score * 1.0) + (3.5 if (prefer_flat and flat) else 0.0)
            if total > best_total:
                best_total = total
                best_rec = rec
                best_img = im
            if prefer_flat and flat and meta_score >= 16.0:
                break

        if best_rec is None or best_img is None:
            print(f"[WARN] No match for {slug}", flush=True)
            continue

        used_ids.add(best_rec["id"])
        out_path = WARDROBE_DIR / f"{slug}.png"
        save_studio_square(best_img, out_path, size=768)
        manifest_rows.append(
            f"| `{slug}.png` | `{DATASET_ID}` (ID `{best_rec['id']}`) | {best_rec['name']} ({best_rec['articleType']}, {best_rec['baseColour']}) |"
        )
        print(f"[OK] {slug:36s} <- #{best_rec['id']} {best_rec['name'][:48]}", flush=True)

    sources_md = [
        "# Demo Wardrobe Real Product Photo Sources",
        "",
        f"All {len(manifest_rows)} demo wardrobe items in `public/wardrobe/` were sourced from real studio product photographs in the public Hugging Face dataset `{DATASET_ID}` for non-commercial academic coursework (CMPS 4200).",
        "",
        "| Local File | Source Dataset & ID | Matched Real Product |",
        "| :--- | :--- | :--- |",
        *manifest_rows,
        "",
    ]
    (WARDROBE_DIR / "SOURCES.md").write_text("\n".join(sources_md), encoding="utf-8")

    LICENSES_DIR.mkdir(parents=True, exist_ok=True)
    (LICENSES_DIR / "WARDROBE_PHOTOS_LICENSE.md").write_text(
        "# Demo Wardrobe Product Photos — Attribution & Academic Use Notice\n\n"
        f"- **Dataset:** `https://huggingface.co/datasets/{DATASET_ID}` (derived from Kaggle Fashion Product Images dataset)\n"
        "- **Scope:** Non-commercial academic coursework & virtual try-on evaluation (`CMPS 4200`, `tAIlor`).\n"
        "- **Processing:** Cropped white margins and centered onto clean `768×768` studio white PNG canvases in `public/wardrobe/`.\n"
        "- **Full Item-by-Item Mapping:** See `public/wardrobe/SOURCES.md`.\n",
        encoding="utf-8",
    )
    print(f"Done! Replaced {len(manifest_rows)} / {len(ITEM_SPECS)} demo wardrobe PNGs with real product photos.", flush=True)


if __name__ == "__main__":
    main()
