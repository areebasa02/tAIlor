#!/usr/bin/env python3
"""
Fit CC0 MakeHuman MHCLO clothes onto makehuman-body.glb's source mesh
(/tmp/mh/base.obj → same 1.72m frame), write Cloth_tshirt / Cloth_trousers GLBs
with fitted/relaxed morphs (offset scale).

MHCLO formula (MakeClothes / MakeHuman hm08):
  p = w1*v1 + w2*v2 + w3*v3 + (dx*sx, dy*sy, dz*sz)
where sx/sy/sz = current axis pair distance / reference distance from header.
"""
from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "models"
BODY_OBJ = Path("/tmp/mh/base.obj")

TSHIRT_MHCLO = Path(
    "/tmp/mh-garments/shirts01/clothes/joepal_crude_t-shirt_female/joepal_crude_t-shirt_female.mhclo"
)
TSHIRT_OBJ = Path(
    "/tmp/mh-garments/shirts01/clothes/joepal_crude_t-shirt_female/crudefemaletshirt.obj"
)
# Female trousers — closed crotch + native delete_verts (CC BY 4.0 Mindfront)
# punkduck tight jeans still punched waist/seat on this body; prefer this asset.
PANTS_MHCLO = Path(
    "/tmp/mh-garments2/clothes/mindfront_female_trousers_1/mindfront_female_trousers_1.mhclo"
)
PANTS_OBJ = Path(
    "/tmp/mh-garments2/clothes/mindfront_female_trousers_1/f_trousers_01.obj"
)


def pad4(b: bytes, pad: bytes = b"\x00") -> bytes:
    return b + pad * ((4 - len(b) % 4) % 4)


def load_obj_mesh(path: Path):
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


def expand_indexed(verts, norms, uvs, face_tris):
    """Expand to unique (vi,vti,vni) corners so UVs/normals survive; keep vi map."""
    key_to_i = {}
    positions, normals_o, uvs_o, indices, src_vi = [], [], [], [], []
    for tri in face_tris:
        for vi, vti, vni in tri:
            key = (vi, vti, vni)
            if key not in key_to_i:
                key_to_i[key] = len(positions)
                positions.append(verts[vi])
                src_vi.append(vi)
                normals_o.append(
                    norms[vni] if (vni is not None and norms) else (0.0, 1.0, 0.0)
                )
                if vti is not None and uvs:
                    u, v = uvs[vti]
                    uvs_o.append((u, 1.0 - v))
                else:
                    uvs_o.append((0.5, 0.5))
            indices.append(key_to_i[key])
    return (
        np.array(positions, float),
        np.array(normals_o, float),
        np.array(uvs_o, float),
        np.array(indices, np.uint32),
        np.array(src_vi, np.int32),
    )


def parse_mhclo(path: Path):
    lines = path.read_text().splitlines()
    meta: dict[str, str] = {}
    bindings = []
    mode = None
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("verts"):
            mode = "verts"
            continue
        if mode == "verts":
            parts = line.split()
            # Hair MHCLO puts material/obj after verts header; keep scanning
            if parts and parts[0] in (
                "material",
                "obj_file",
                "name",
                "uuid",
                "basemesh",
                "tag",
                "x_scale",
                "y_scale",
                "z_scale",
                "z_depth",
                "max_pole",
            ):
                if len(parts) >= 2:
                    meta[parts[0]] = parts[1]
                continue
            if len(parts) >= 9:
                try:
                    i1, i2, i3 = int(parts[0]), int(parts[1]), int(parts[2])
                    w1, w2, w3 = float(parts[3]), float(parts[4]), float(parts[5])
                    dx, dy, dz = float(parts[6]), float(parts[7]), float(parts[8])
                    bindings.append((i1, i2, i3, w1, w2, w3, dx, dy, dz))
                    continue
                except ValueError:
                    mode = None
            else:
                mode = None
        bits = line.split(None, 1)
        if len(bits) == 2:
            meta[bits[0]] = bits[1]
        else:
            meta[bits[0]] = ""
    return meta, bindings


def axis_scale(body: np.ndarray, spec: str, axis: int) -> float:
    """mhclo 'x_scale i j ref' → |coord[axis] diff| / ref (MakeHuman Y-up)."""
    a, b, ref = spec.split()
    i, j, r = int(a), int(b), float(ref)
    d = abs(float(body[i, axis] - body[j, axis]))
    return d / r if r > 1e-8 else 1.0


def fit_positions(body: np.ndarray, bindings, meta, offset_scale=1.0) -> np.ndarray:
    # MakeHuman native (Y-up): sx from X, sy from Y, sz from Z component distances
    sx = axis_scale(body, meta["x_scale"], 0)
    sy = axis_scale(body, meta["y_scale"], 1)
    sz = axis_scale(body, meta["z_scale"], 2)
    out = np.zeros((len(bindings), 3), float)
    for i, (i1, i2, i3, w1, w2, w3, dx, dy, dz) in enumerate(bindings):
        p = w1 * body[i1] + w2 * body[i2] + w3 * body[i3]
        p = p + offset_scale * np.array([dx * sx, dy * sy, dz * sz])
        out[i] = p
    return out


def recompute_normals(pos, idx):
    nrm = np.zeros_like(pos)
    for a, b, c in idx.reshape(-1, 3):
        n = np.cross(pos[b] - pos[a], pos[c] - pos[a])
        nrm[a] += n
        nrm[b] += n
        nrm[c] += n
    lens = np.linalg.norm(nrm, axis=1, keepdims=True)
    lens[lens < 1e-8] = 1.0
    return nrm / lens


def body_frame(pos: np.ndarray):
    h = pos[:, 1].max() - pos[:, 1].min()
    scale = 1.72 / h
    out = pos * scale
    out[:, 1] -= out[:, 1].min()
    return out, scale


def write_glb(path: Path, name: str, pos, nrm, uv, idx, morphs, color, roughness):
    bin_chunks, buffer_views, accessors = [], [], []
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

    pos = np.asarray(pos, np.float32)
    nrm = np.asarray(nrm, np.float32)
    uv = np.asarray(uv, np.float32)
    idx = np.asarray(idx, np.uint32)

    def acc_vec3(arr):
        bv = add(arr.tobytes(), 34962)
        i = len(accessors)
        accessors.append(
            {
                "bufferView": bv,
                "componentType": 5126,
                "count": len(arr),
                "type": "VEC3",
                "max": arr.max(0).tolist(),
                "min": arr.min(0).tolist(),
            }
        )
        return i

    pos_acc = acc_vec3(pos)
    n_acc = acc_vec3(nrm)
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

    gltf = {
        "asset": {"version": "2.0", "generator": "tAIlor-mhclo-fit-v1"},
        "buffers": [{"byteLength": 0}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "materials": [
            {
                "name": name + "_mat",
                "pbrMetallicRoughness": {
                    "baseColorFactor": list(color),
                    "metallicFactor": 0,
                    "roughnessFactor": roughness,
                },
                "doubleSided": True,
            }
        ],
        "meshes": [
            {
                "name": name,
                "weights": [0, 0],
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": pos_acc,
                            "NORMAL": n_acc,
                            "TEXCOORD_0": uv_acc,
                        },
                        "indices": i_acc,
                        "material": 0,
                        "mode": 4,
                        "targets": targets,
                    }
                ],
            }
        ],
        "nodes": [{"name": name, "mesh": 0, "weights": [0, 0]}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    blob = b"".join(bin_chunks)
    gltf["buffers"][0]["byteLength"] = len(pad4(blob))
    jb = pad4(json.dumps(gltf, separators=(",", ":")).encode(), b" ")
    blob = pad4(blob)
    total = 12 + 8 + len(jb) + 8 + len(blob)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(jb), b"JSON")
        + jb
        + struct.pack("<I4s", len(blob), b"BIN\x00")
        + blob
    )
    print(f"Wrote {path.name}: verts={len(pos)} tris={len(idx)//3}")


def build_garment(mhclo_path, obj_path, body_raw, name, color, roughness, std_off=1.0, fit_off=0.72, rel_off=1.35):
    meta, bindings = parse_mhclo(mhclo_path)
    assert len(bindings) > 0
    ov, on, ou, ofaces = load_obj_mesh(obj_path)
    assert len(ov) == len(bindings), (len(ov), len(bindings))

    # Fit unique cloth verts in raw MH space, then frame with body
    std_raw = fit_positions(body_raw, bindings, meta, offset_scale=std_off)
    fit_raw = fit_positions(body_raw, bindings, meta, offset_scale=fit_off)
    rel_raw = fit_positions(body_raw, bindings, meta, offset_scale=rel_off)

    body_framed, scale = body_frame(body_raw)
    y0 = (body_raw * scale)[:, 1].min()

    def frame(p):
        out = p * scale
        out[:, 1] -= y0
        return out

    std_v = frame(std_raw)
    fit_v = frame(fit_raw)
    rel_v = frame(rel_raw)

    # Expand using OBJ topology; positions looked up by src vi
    _, _, uv, idx, src_vi = expand_indexed(std_v, on, ou, ofaces)
    pos = std_v[src_vi]
    fit_pos = fit_v[src_vi]
    rel_pos = rel_v[src_vi]
    nrm = recompute_normals(pos, idx)
    morphs = {"fitted": fit_pos - pos, "relaxed": rel_pos - pos}
    write_glb(OUT / f"{name}.glb", name.replace("cloth-", "Cloth_").replace("-", "_") if False else name, pos, nrm, uv, idx, morphs, color, roughness)
    # fix name: Cloth_tshirt style
    return pos, nrm, uv, idx, morphs


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    body_raw, _, _, _ = load_obj_mesh(BODY_OBJ)
    print("body verts", len(body_raw))

    # --- T-shirt ---
    meta, bindings = parse_mhclo(TSHIRT_MHCLO)
    ov, on, ou, ofaces = load_obj_mesh(TSHIRT_OBJ)
    assert len(ov) == len(bindings)

    _, scale = body_frame(body_raw)
    y0 = (body_raw * scale)[:, 1].min()

    def frame(p):
        out = p * scale
        out[:, 1] -= y0
        return out

    def shell(unique_std, unique_fit, unique_rel, on, ou, ofaces, clear=0.014):
        """Normal-only clearance. No global XZ scale (that opened crotch/waist)."""
        _, _, uv, idx, src_vi = expand_indexed(unique_std, on, ou, ofaces)
        pos = unique_std[src_vi].copy()
        nrm = recompute_normals(pos, idx)
        right = pos[:, 0] > 0.05
        if right.any() and float(nrm[right, 0].mean()) < 0:
            idx = idx.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
            nrm = -nrm
        pos = pos + nrm * clear
        nrm = recompute_normals(pos, idx)
        right = pos[:, 0] > 0.05
        if right.any() and float(nrm[right, 0].mean()) < 0:
            idx = idx.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
            nrm = -nrm
        fit_pos = unique_fit[src_vi].copy() + nrm * (clear * 0.55)
        # Mild relaxed ease via normal offset only — not whole-mesh XZ inflate
        rel_pos = unique_rel[src_vi].copy() + nrm * (clear * 1.15)
        morphs = {"fitted": fit_pos - pos, "relaxed": rel_pos - pos}
        return pos, nrm, uv, idx, morphs, fit_pos, rel_pos

    # MHCLO offsets already include garment ease; keep std near 1.0
    std_raw = fit_positions(body_raw, bindings, meta, 1.05)
    fit_raw = fit_positions(body_raw, bindings, meta, 0.88)
    rel_raw = fit_positions(body_raw, bindings, meta, 1.22)
    std_v, fit_v, rel_v = frame(std_raw), frame(fit_raw), frame(rel_raw)
    pos, nrm, uv, idx, morphs, fit_pos, rel_pos = shell(
        std_v, fit_v, rel_v, on, ou, ofaces, 0.020
    )
    # Shoulder / sleeve join: slight outward ease (reduces armpit pinch)
    shoulder = (
        (pos[:, 1] > 1.24)
        & (pos[:, 1] < 1.40)
        & (np.abs(pos[:, 0]) > 0.12)
        & (np.abs(pos[:, 0]) < 0.32)
    )
    if shoulder.any():
        bump = nrm[shoulder] * 0.010
        pos[shoulder] += bump
        fit_pos[shoulder] += bump * 0.5
        rel_pos[shoulder] += bump * 1.3
    # Hem overlaps pants waistband (~4 cm) without diving under hips
    hem = pos[:, 1] < (pos[:, 1].min() + 0.08)
    pos[hem, 1] -= 0.014
    fit_pos[hem, 1] -= 0.010
    rel_pos[hem, 1] -= 0.018
    nrm = recompute_normals(pos, idx)
    morphs = {"fitted": fit_pos - pos, "relaxed": rel_pos - pos}
    write_glb(
        OUT / "cloth-tshirt.glb",
        "Cloth_tshirt",
        pos,
        nrm,
        uv,
        idx,
        morphs,
        (0.93, 0.93, 0.95, 1),
        0.84,
    )
    print("tee bounds", pos.min(0), pos.max(0))

    # --- Trousers ---
    meta, bindings = parse_mhclo(PANTS_MHCLO)
    ov, on, ou, ofaces = load_obj_mesh(PANTS_OBJ)
    assert len(ov) == len(bindings)

    std_raw = fit_positions(body_raw, bindings, meta, 1.05)
    fit_raw = fit_positions(body_raw, bindings, meta, 0.88)
    rel_raw = fit_positions(body_raw, bindings, meta, 1.22)
    std_v, fit_v, rel_v = frame(std_raw), frame(fit_raw), frame(rel_raw)
    # Clearance for female trousers crotch panel (keep closed; no XZ inflate)
    pos, nrm, uv, idx, morphs, fit_pos, rel_pos = shell(
        std_v, fit_v, rel_v, on, ou, ofaces, 0.032
    )
    # Waistband under tee hem
    waist = pos[:, 1] > 0.972
    if waist.any():
        drop = (pos[waist, 1] - 0.972) * 0.92
        pos[waist, 1] -= drop
        fit_pos[waist, 1] -= drop
        rel_pos[waist, 1] -= drop
    # Crotch panel: normal ease only
    crotch = (
        (pos[:, 1] > 0.70)
        & (pos[:, 1] < 0.94)
        & (np.abs(pos[:, 0]) < 0.10)
        & (pos[:, 2] > 0.0)
    )
    if crotch.any():
        bump = nrm[crotch] * 0.012
        pos[crotch] += bump
        fit_pos[crotch] += bump * 0.55
        rel_pos[crotch] += bump * 1.35
    # Hips + seat
    hips = (pos[:, 1] > 0.78) & (pos[:, 1] < 0.96) & (np.abs(pos[:, 0]) < 0.24)
    if hips.any():
        bump = nrm[hips] * 0.009
        pos[hips] += bump
        fit_pos[hips] += bump * 0.5
        rel_pos[hips] += bump * 1.35
    seat = (pos[:, 1] > 0.72) & (pos[:, 1] < 0.96) & (pos[:, 2] < 0.0)
    if seat.any():
        bump = nrm[seat] * 0.013
        pos[seat] += bump
        fit_pos[seat] += bump * 0.55
        rel_pos[seat] += bump * 1.3
    nrm = recompute_normals(pos, idx)
    morphs = {"fitted": fit_pos - pos, "relaxed": rel_pos - pos}
    write_glb(
        OUT / "cloth-trousers.glb",
        "Cloth_trousers",
        pos,
        nrm,
        uv,
        idx,
        morphs,
        (0.18, 0.24, 0.36, 1),
        0.88,
    )
    print("pants bounds", pos.min(0), pos.max(0))

    (OUT / "GARMENT-FIT-README.txt").write_text(
        "cloth-tshirt.glb — CC0 MakeHuman joepal_crude_t-shirt_female, MHCLO-fitted to base.obj.\n"
        "cloth-trousers.glb — mindfront_female_trousers_1, MHCLO-fitted to base.obj.\n"
        "Same 1.72m meter frame as makehuman-body.glb. Morphs: [0]=fitted, [1]=relaxed\n"
        "(normal-offset ease only — no global XZ scale). Load WITH body before normalizeFigure.\n"
        "Licenses: tee CC0 (shirts01); trousers CC BY 4.0 Mindfront (pants02 pack).\n"
        "See ATTRIBUTION-CLOTHES.txt.\n"
    )
    (OUT / "ATTRIBUTION-CLOTHES.txt").write_text(
        "Garment attributions\n"
        "====================\n"
        "cloth-tshirt.glb — joepal_crude_t-shirt_female — CC0 — MakeHuman Community shirts01.\n"
        "cloth-trousers.glb — mindfront_female_trousers_1 / F_Trousers_01 — CC BY 4.0 —\n"
        "  Author: Mindfront (Sweden). Source: MakeHuman Community asset pack pants02.\n"
        "  https://www.makehumancommunity.org/\n"
    )
    print("OK")


if __name__ == "__main__":
    main()
