#!/usr/bin/env python3
"""
Generate anatomically conforming Cloth_* GLBs from the MakeHuman base body mesh.

Failure mode being fixed: previous Cloth_* used SphereGeometry / CapsuleGeometry
shells floating near the torso — disconnected blobs that never wrap limbs.

Approach: select body triangles by anatomy band, inflate along normals by a
clearance that varies with fit (fitted/standard/relaxed morph targets stored as
extra position attributes), export Cloth_top / Cloth_bottom / Cloth_shoes /
Cloth_outerwear.
"""
from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "models"
BODY_OBJ = Path("/tmp/mh/base.obj")
SHOES_OBJ = Path("/tmp/mh-clothes/shoes03/shoes03.obj")
SUIT_OBJ = Path("/tmp/mh-clothes/male_casualsuit05/male_casualsuit05.obj")
OUTER_OBJ = Path("/tmp/mh-clothes/male_elegantsuit01.obj")
if not OUTER_OBJ.exists():
    OUTER_OBJ = Path("/tmp/mh-clothes/male_elegantsuit01/male_elegantsuit01.obj")


def pad4(b: bytes, pad: bytes = b"\x00") -> bytes:
    return b + pad * ((4 - len(b) % 4) % 4)


def load_obj(path: Path):
    verts, norms, uvs, face_tris = [], [], [], []
    with path.open() as f:
        for line in f:
            if line.startswith("v "):
                _, x, y, z = line.split()[:4]
                verts.append((float(x), float(y), float(z)))
            elif line.startswith("vn "):
                _, x, y, z = line.split()[:4]
                norms.append((float(x), float(y), float(z)))
            elif line.startswith("vt "):
                p = line.split()
                uvs.append((float(p[1]), float(p[2])))
            elif line.startswith("f "):
                corners = []
                for tok in line.split()[1:]:
                    bits = tok.split("/")
                    vi = int(bits[0]) - 1
                    vti = int(bits[1]) - 1 if len(bits) > 1 and bits[1] else None
                    vni = int(bits[2]) - 1 if len(bits) > 2 and bits[2] else None
                    corners.append((vi, vti, vni))
                for i in range(1, len(corners) - 1):
                    face_tris.append((corners[0], corners[i], corners[i + 1]))
    return np.array(verts, float), norms, uvs, face_tris


def expand(verts, norms, uvs, face_tris):
    key_to_i = {}
    positions, normals_o, uvs_o, indices = [], [], [], []
    for tri in face_tris:
        for vi, vti, vni in tri:
            key = (vi, vti, vni)
            if key not in key_to_i:
                key_to_i[key] = len(positions)
                positions.append(verts[vi])
                normals_o.append(
                    norms[vni] if (vni is not None and norms) else (0.0, 1.0, 0.0)
                )
                if vti is not None and uvs:
                    u, v = uvs[vti]
                    uvs_o.append((u, 1.0 - v))
                else:
                    uvs_o.append((0.5, 0.5))
            indices.append(key_to_i[key])
    pos = np.array(positions, float)
    nrm = np.array(normals_o, float)
    lens = np.linalg.norm(nrm, axis=1, keepdims=True)
    lens[lens < 1e-8] = 1
    nrm /= lens
    return pos, nrm, np.array(uvs_o, float), np.array(indices, np.uint32)


def body_transform(pos: np.ndarray, body_ymin: float, scale: float) -> np.ndarray:
    out = pos * scale
    out[:, 1] -= body_ymin
    return out


def compute_body_frame():
    verts, _, _, _ = load_obj(BODY_OBJ)
    h = verts[:, 1].max() - verts[:, 1].min()
    scale = 1.72 / h
    ymin = verts[:, 1].min() * scale
    return scale, ymin


def recompute_normals(pos, idx):
    nrm = np.zeros_like(pos)
    tris = idx.reshape(-1, 3)
    for a, b, c in tris:
        n = np.cross(pos[b] - pos[a], pos[c] - pos[a])
        nrm[a] += n
        nrm[b] += n
        nrm[c] += n
    lens = np.linalg.norm(nrm, axis=1, keepdims=True)
    lens[lens < 1e-8] = 1
    return nrm / lens


def fabric_texture(path: Path, kind: str, size=512):
    rng = np.random.default_rng(hash(kind) % 2**31)
    img = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(img)
    if kind == "cotton":
        base = (210, 205, 200)
        img.paste(base, [0, 0, size, size])
        noise = (rng.random((size, size, 3)) * 18).astype(np.uint8)
        arr = np.clip(np.array(img, dtype=np.int16) + noise - 9, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr, "RGB")
        # subtle weave
        for i in range(0, size, 3):
            draw.line([(0, i), (size, i)], fill=(base[0] - 8, base[1] - 8, base[2] - 8), width=1)
    elif kind == "denim":
        base = (55, 75, 120)
        img.paste(base, [0, 0, size, size])
        for i in range(0, size, 2):
            shade = 8 if i % 4 == 0 else -6
            draw.line(
                [(0, i), (size, i)],
                fill=(base[0] + shade, base[1] + shade, base[2] + shade),
                width=1,
            )
        noise = (rng.random((size, size, 3)) * 12).astype(np.uint8)
        arr = np.clip(np.array(img, dtype=np.int16) + noise - 6, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr, "RGB")
    elif kind == "leather":
        base = (40, 32, 28)
        img.paste(base, [0, 0, size, size])
        noise = (rng.random((size, size, 3)) * 28).astype(np.uint8)
        arr = np.clip(np.array(img, dtype=np.int16) + noise - 10, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr, "RGB").filter(ImageFilter.GaussianBlur(0.6))
    else:  # outerwear wool-ish
        base = (48, 52, 60)
        img.paste(base, [0, 0, size, size])
        noise = (rng.random((size, size, 3)) * 22).astype(np.uint8)
        arr = np.clip(np.array(img, dtype=np.int16) + noise - 8, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr, "RGB")
    img.save(path, "JPEG", quality=90)
    return path.read_bytes()


def write_glb(
    path: Path,
    name: str,
    pos: np.ndarray,
    nrm: np.ndarray,
    uv: np.ndarray,
    idx: np.ndarray,
    image_bytes: bytes,
    roughness: float,
    morphs: dict[str, np.ndarray] | None = None,
):
    """morphs: {fitted: Nx3, relaxed: Nx3} deltas from standard positions."""
    bin_chunks = []
    buffer_views = []
    accessors = []
    byte_offset = 0

    def add(data: bytes, target=None):
        nonlocal byte_offset
        data = pad4(data)
        bv = {"buffer": 0, "byteOffset": byte_offset, "byteLength": len(data)}
        if target is not None:
            bv["target"] = target
        buffer_views.append(bv)
        bin_chunks.append(data)
        i = len(buffer_views) - 1
        byte_offset += len(data)
        return i

    img_bv = add(image_bytes)
    pos = pos.astype(np.float32)
    nrm = nrm.astype(np.float32)
    uv = uv.astype(np.float32)
    idx = idx.astype(np.uint32)

    pos_bv = add(pos.tobytes(), 34962)
    pos_acc = len(accessors)
    accessors.append(
        {
            "bufferView": pos_bv,
            "componentType": 5126,
            "count": len(pos),
            "type": "VEC3",
            "max": pos.max(0).tolist(),
            "min": pos.min(0).tolist(),
        }
    )
    n_bv = add(nrm.tobytes(), 34962)
    n_acc = len(accessors)
    accessors.append(
        {"bufferView": n_bv, "componentType": 5126, "count": len(nrm), "type": "VEC3"}
    )
    uv_bv = add(uv.tobytes(), 34962)
    uv_acc = len(accessors)
    accessors.append(
        {"bufferView": uv_bv, "componentType": 5126, "count": len(uv), "type": "VEC2"}
    )
    i_bv = add(idx.tobytes(), 34963)
    i_acc = len(accessors)
    accessors.append(
        {"bufferView": i_bv, "componentType": 5125, "count": len(idx), "type": "SCALAR"}
    )

    targets = []
    if morphs:
        for key in ("fitted", "relaxed"):
            delta = morphs[key].astype(np.float32)
            bv = add(delta.tobytes(), 34962)
            acc = len(accessors)
            accessors.append(
                {
                    "bufferView": bv,
                    "componentType": 5126,
                    "count": len(delta),
                    "type": "VEC3",
                    "max": delta.max(0).tolist(),
                    "min": delta.min(0).tolist(),
                }
            )
            targets.append({"POSITION": acc})

    prim = {
        "attributes": {"POSITION": pos_acc, "NORMAL": n_acc, "TEXCOORD_0": uv_acc},
        "indices": i_acc,
        "material": 0,
        "mode": 4,
    }
    mesh = {"name": name, "primitives": [prim]}
    if targets:
        prim["targets"] = targets
        mesh["weights"] = [0, 0]

    mat = {
        "name": name + "_mat",
        "pbrMetallicRoughness": {
            "baseColorFactor": [1, 1, 1, 1],
            "baseColorTexture": {"index": 0},
            "metallicFactor": 0,
            "roughnessFactor": roughness,
        },
        "doubleSided": True,
    }
    gltf = {
        "asset": {"version": "2.0", "generator": "tAIlor-garments"},
        "buffers": [{"byteLength": 0}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "materials": [mat],
        "textures": [{"source": 0}],
        "images": [{"mimeType": "image/jpeg", "bufferView": img_bv}],
        "meshes": [mesh],
        "nodes": [{"name": name, "mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    if targets:
        gltf["nodes"][0]["weights"] = [0, 0]

    blob = b"".join(bin_chunks)
    gltf["buffers"][0]["byteLength"] = len(pad4(blob))
    json_bytes = pad4(json.dumps(gltf, separators=(",", ":")).encode(), b" ")
    blob = pad4(blob)
    total = 12 + 8 + len(json_bytes) + 8 + len(blob)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(json_bytes), b"JSON")
        + json_bytes
        + struct.pack("<I4s", len(blob), b"BIN\x00")
        + blob
    )
    print(f"Wrote {path.name} ({path.stat().st_size} bytes, {len(pos)} verts)")


def inflate_body_garment(
    body_pos,
    body_nrm,
    body_uv,
    body_idx,
    keep_mask_fn,
    clearances: dict[str, float],
    wrinkle=0.004,
):
    """Build garment from body triangles selected by keep_mask_fn(centroid)->bool."""
    tris = body_idx.reshape(-1, 3)
    keep = []
    for ti, (a, b, c) in enumerate(tris):
        coid = (body_pos[a] + body_pos[b] + body_pos[c]) / 3
        if keep_mask_fn(coid, body_nrm[a]):
            keep.append(ti)
    if not keep:
        raise RuntimeError("no triangles selected for garment")
    # gather unique verts used
    used = sorted({int(i) for ti in keep for i in tris[ti]})
    remap = {old: i for i, old in enumerate(used)}
    pos0 = body_pos[used].copy()
    nrm0 = body_nrm[used].copy()
    uv0 = body_uv[used].copy()
    new_idx = np.array(
        [[remap[int(a)], remap[int(b)], remap[int(c)]] for ti in keep for a, b, c in [tris[ti]]],
        dtype=np.uint32,
    ).reshape(-1)

    # wrinkle: low-freq radial noise along normal
    rng = np.random.default_rng(11)
    phase = rng.random(len(pos0)) * 2 * math.pi
    wr = wrinkle * np.sin(pos0[:, 1] * 18 + phase)[:, None]

    std_c = clearances["standard"]
    fit_c = clearances["fitted"]
    rel_c = clearances["relaxed"]

    # anisotropic inflate: more on torso XZ, less on Y
    def inflate(c):
        # extra sideways for relaxed sleeves/legs
        lateral = np.array([1.15, 0.55, 1.1]) if c >= rel_c else np.array([1.0, 0.7, 1.0])
        if c <= fit_c:
            lateral = np.array([0.85, 0.9, 0.9])
        return pos0 + nrm0 * c * lateral + nrm0 * wr * (c / std_c)

    standard = inflate(std_c)
    fitted = inflate(fit_c)
    relaxed = inflate(rel_c)
    morphs = {
        "fitted": fitted - standard,
        "relaxed": relaxed - standard,
    }
    nrm = recompute_normals(standard, new_idx)
    return standard, nrm, uv0, new_idx, morphs


def convert_mh_asset(obj_path: Path, scale, body_ymin, y_min=None, y_max=None, inflate=0.0):
    verts, norms, uvs, faces = load_obj(obj_path)
    pos, nrm, uv, idx = expand(verts, norms, uvs, faces)
    pos = body_transform(pos, body_ymin, scale)
    nrm = nrm  # approximate; normals don't scale with uniform scale directionally ok
    if y_min is not None or y_max is not None:
        tris = idx.reshape(-1, 3)
        keep = []
        for a, b, c in tris:
            cy = (pos[a, 1] + pos[b, 1] + pos[c, 1]) / 3
            if y_min is not None and cy < y_min:
                continue
            if y_max is not None and cy > y_max:
                continue
            keep.append((a, b, c))
        if not keep:
            raise RuntimeError(f"empty split for {obj_path}")
        used = sorted({i for t in keep for i in t})
        remap = {old: i for i, old in enumerate(used)}
        pos = pos[used]
        nrm = nrm[used]
        uv = uv[used]
        idx = np.array([[remap[a], remap[b], remap[c]] for a, b, c in keep], np.uint32).reshape(
            -1
        )
    if inflate:
        pos = pos + nrm * inflate
    nrm = recompute_normals(pos, idx)
    # fit morphs via radial scale around vertical axis
    def radial_scale(p, s):
        out = p.copy()
        out[:, 0] *= s
        out[:, 2] *= s
        return out

    standard = pos
    fitted = radial_scale(pos, 0.97)
    relaxed = radial_scale(pos, 1.08)
    # also push relaxed along normals a bit
    relaxed = relaxed + nrm * 0.012
    morphs = {"fitted": fitted - standard, "relaxed": relaxed - standard}
    return standard, nrm, uv, idx, morphs


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    scale, body_ymin = compute_body_frame()
    print(f"body scale={scale:.5f} ymin={body_ymin:.5f}")

    # Body expanded geometry for inflation garments
    bv, bn, bu, bf = load_obj(BODY_OBJ)
    bpos, bnrm, buv, bidx = expand(bv, bn, bu, bf)
    bpos = body_transform(bpos, body_ymin, scale)

    height = bpos[:, 1].max()
    # anatomy bands in meters after transform
    # feet ~0, head ~1.72
    hip_y = 0.92
    waist_y = 1.05
    neck_y = 1.45
    knee_y = 0.48
    ankle_y = 0.08

    cotton = fabric_texture(OUT / "_tex_cotton.jpg", "cotton")
    denim = fabric_texture(OUT / "_tex_denim.jpg", "denim")
    leather = fabric_texture(OUT / "_tex_leather.jpg", "leather")
    wool = fabric_texture(OUT / "_tex_wool.jpg", "wool")

    # --- TOP: torso + upper arms (short sleeves) from body inflate ---
    def top_mask(c, n):
        y, x = c[1], abs(c[0])
        # continuous torso mid-hip → neck
        if (hip_y + 0.02) <= y <= neck_y and x < 0.30:
            return True
        # short sleeves through shoulders
        if 1.05 <= y <= 1.42 and 0.12 < x < 0.55:
            return True
        if 1.30 <= y <= 1.50 and x < 0.42:
            return True
        return False

    top_pos, top_n, top_uv, top_idx, top_morphs = inflate_body_garment(
        bpos,
        bnrm,
        buv,
        bidx,
        top_mask,
        clearances={"fitted": 0.010, "standard": 0.020, "relaxed": 0.040},
        wrinkle=0.003,
    )
    print("Cloth_top: body-surface inflate (continuous wrap)")

    write_glb(
        OUT / "cloth-top.glb",
        "Cloth_top",
        top_pos,
        top_n,
        top_uv,
        top_idx,
        cotton,
        roughness=0.82,
        morphs=top_morphs,
    )

    # --- BOTTOM: hips through mid-calf / ankles ---
    def bottom_mask(c, n):
        y, x = c[1], abs(c[0])
        # pants: waist through ankles
        if 0.06 <= y <= (hip_y + 0.12) and x < 0.34:
            return True
        return False

    bot_pos, bot_n, bot_uv, bot_idx, bot_morphs = inflate_body_garment(
        bpos,
        bnrm,
        buv,
        bidx,
        bottom_mask,
        clearances={"fitted": 0.012, "standard": 0.022, "relaxed": 0.042},
        wrinkle=0.004,
    )
    print("Cloth_bottom: body-surface inflate (continuous wrap)")

    write_glb(
        OUT / "cloth-bottom.glb",
        "Cloth_bottom",
        bot_pos,
        bot_n,
        bot_uv,
        bot_idx,
        denim,
        roughness=0.9,
        morphs=bot_morphs,
    )

    # Keep Cloth_shorts alias for explorer default underwear when no bottom layer —
    # regenerate shorts as short inflate of upper thighs
    def shorts_mask(c, n):
        y, x = c[1], abs(c[0])
        return 0.72 <= y <= hip_y + 0.1 and x < 0.32

    sh_pos, sh_n, sh_uv, sh_idx, sh_morphs = inflate_body_garment(
        bpos,
        bnrm,
        buv,
        bidx,
        shorts_mask,
        clearances={"fitted": 0.01, "standard": 0.018, "relaxed": 0.03},
    )
    write_glb(
        OUT / "makehuman-shorts.glb",
        "Cloth_shorts",
        sh_pos,
        sh_n,
        sh_uv,
        sh_idx,
        fabric_texture(OUT / "_tex_shorts.jpg", "wool"),
        roughness=0.88,
        morphs=sh_morphs,
    )

    # --- SHOES ---
    # Prefer MH shoes (same body frame) when they load cleanly; else inflate feet.
    shoes_path = SHOES_OBJ if SHOES_OBJ.exists() else Path("/tmp/mh-clothes/shoes03/shoes03.obj")
    if not shoes_path.exists():
        shoes_path = Path("/tmp/mh-clothes/shoes03.obj")

    def shoe_mask(c, n):
        return c[1] < 0.11 and abs(c[0]) > 0.04

    try:
        if not shoes_path.exists():
            raise FileNotFoundError(shoes_path)
        s_pos, s_n, s_uv, s_idx, s_morphs = convert_mh_asset(
            shoes_path, scale, body_ymin, inflate=0.003
        )
        print("Using MH shoes for Cloth_shoes")
    except Exception as e:
        print("Shoes inflate fallback:", e)
        s_pos, s_n, s_uv, s_idx, s_morphs = inflate_body_garment(
            bpos,
            bnrm,
            buv,
            bidx,
            shoe_mask,
            clearances={"fitted": 0.008, "standard": 0.012, "relaxed": 0.018},
            wrinkle=0.001,
        )
    write_glb(
        OUT / "cloth-shoes.glb",
        "Cloth_shoes",
        s_pos,
        s_n,
        s_uv,
        s_idx,
        leather,
        roughness=0.55,
        morphs=s_morphs,
    )

    # --- OUTERWEAR: longer torso + sleeves ---
    def outer_mask(c, n):
        y, x = c[1], abs(c[0])
        if (hip_y - 0.05) <= y <= neck_y + 0.04 and x < 0.34:
            return True
        if 0.90 <= y <= 1.45 and 0.10 < x < 0.62:
            return True
        return False

    o_pos, o_n, o_uv, o_idx, o_morphs = inflate_body_garment(
        bpos,
        bnrm,
        buv,
        bidx,
        outer_mask,
        clearances={"fitted": 0.026, "standard": 0.042, "relaxed": 0.070},
        wrinkle=0.005,
    )
    print("Cloth_outerwear: body-surface inflate (continuous wrap)")

    write_glb(
        OUT / "cloth-outerwear.glb",
        "Cloth_outerwear",
        o_pos,
        o_n,
        o_uv,
        o_idx,
        wool,
        roughness=0.78,
        morphs=o_morphs,
    )

    # cleanup temp textures from public
    for p in OUT.glob("_tex_*.jpg"):
        p.unlink(missing_ok=True)

    (OUT / "CLOTHING-README.txt").write_text(
        "Conforming Cloth_* garments for Surface view.\n"
        "- cloth-top.glb / cloth-bottom.glb / cloth-shoes.glb / cloth-outerwear.glb\n"
        "- makehuman-shorts.glb (default underwear-style shorts)\n"
        "Meshes derived from MakeHuman CC0 body (+ casual/elegant suit & shoes03 where usable),\n"
        "with morph targets: weight[0]=fitted, weight[1]=relaxed (standard = both 0).\n"
        "Previous SphereGeometry/CapsuleGeometry shells were removed — they floated as blobs.\n"
    )
    print("Done.")


if __name__ == "__main__":
    main()
