#!/usr/bin/env python3
"""Convert MakeHuman CC0 OBJ (+optional texture) to a simple GLB."""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def pad4(b: bytes, pad: bytes = b"\x00") -> bytes:
    return b + pad * ((4 - len(b) % 4) % 4)


def load_obj(path: Path):
    verts = []
    norms = []
    uvs = []
    faces = []  # list of (v_idx, vt_idx|None, vn_idx|None) triples → expand later
    face_tris = []
    with path.open() as f:
        for line in f:
            if line.startswith("v "):
                _, x, y, z = line.split()[:4]
                verts.append((float(x), float(y), float(z)))
            elif line.startswith("vn "):
                _, x, y, z = line.split()[:4]
                norms.append((float(x), float(y), float(z)))
            elif line.startswith("vt "):
                parts = line.split()
                uvs.append((float(parts[1]), float(parts[2])))
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
    return np.array(verts, np.float64), norms, uvs, face_tris


def write_glb(path: Path, positions, normals, uvs, indices, image_bytes=None, mime="image/jpeg", name="Body"):
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
        idx = len(buffer_views) - 1
        byte_offset += len(data)
        return idx

    images = []
    textures = []
    if image_bytes:
        bv = add(image_bytes)
        images.append({"mimeType": mime, "bufferView": bv})
        textures.append({"source": 0})

    pos = positions.astype(np.float32)
    nrm = normals.astype(np.float32)
    uv = uvs.astype(np.float32)
    idx = indices.astype(np.uint32)

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

    mat = {
        "name": name + "_mat",
        "pbrMetallicRoughness": {
            "baseColorFactor": [1, 1, 1, 1],
            "metallicFactor": 0,
            "roughnessFactor": 0.68,
        },
        "doubleSided": True,
    }
    if textures:
        mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}

    gltf = {
        "asset": {"version": "2.0", "generator": "tAIlor-obj-to-glb"},
        "buffers": [{"byteLength": 0}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "materials": [mat],
        "meshes": [
            {
                "name": name,
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
                    }
                ],
            }
        ],
        "nodes": [{"name": name, "mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    if textures:
        gltf["textures"] = textures
        gltf["images"] = images

    blob = b"".join(bin_chunks)
    gltf["buffers"][0]["byteLength"] = len(pad4(blob))
    json_bytes = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    blob = pad4(blob)
    total = 12 + 8 + len(json_bytes) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        f.write(json_bytes)
        f.write(struct.pack("<I4s", len(blob), b"BIN\x00"))
        f.write(blob)
    print(f"Wrote {path} ({path.stat().st_size} bytes)")


def expand(verts, norms, uvs, face_tris):
    """Expand to non-indexed-like unique verts per corner, then re-index uniquely."""
    # Build unique key map
    key_to_i = {}
    positions = []
    normals_o = []
    uvs_o = []
    indices = []
    for tri in face_tris:
        for vi, vti, vni in tri:
            key = (vi, vti, vni)
            if key not in key_to_i:
                key_to_i[key] = len(positions)
                positions.append(verts[vi])
                if vni is not None and norms:
                    normals_o.append(norms[vni])
                else:
                    normals_o.append((0, 1, 0))
                if vti is not None and uvs:
                    u, v = uvs[vti]
                    uvs_o.append((u, 1.0 - v))  # glTF V flip
                else:
                    uvs_o.append((0.5, 0.5))
            indices.append(key_to_i[key])
    pos = np.array(positions, np.float64)
    nrm = np.array(normals_o, np.float64)
    # renormalize
    lens = np.linalg.norm(nrm, axis=1, keepdims=True)
    lens[lens < 1e-8] = 1
    nrm = nrm / lens
    return pos, nrm, np.array(uvs_o, np.float64), np.array(indices, np.uint32)


def main():
    obj_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    name = sys.argv[3] if len(sys.argv) > 3 else "Body"
    tex_path = Path(sys.argv[4]) if len(sys.argv) > 4 else None

    verts, norms, uvs, face_tris = load_obj(obj_path)
    pos, nrm, uv, idx = expand(verts, norms, uvs, face_tris)

    # MakeHuman uses Y-up already; scale from dm-ish (~17 units) to meters (~1.7)
    height = pos[:, 1].max() - pos[:, 1].min()
    scale = 1.72 / height if height > 0 else 1.0
    pos *= scale
    # feet on ground
    pos[:, 1] -= pos[:, 1].min()
    # MakeHuman faces +Z typically; ensure left=+X (already)

    image_bytes = None
    mime = "image/jpeg"
    if tex_path and tex_path.exists():
        img = Image.open(tex_path).convert("RGBA" if tex_path.suffix.lower() == ".png" else "RGB")
        if max(img.size) > 2048:
            img.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        buf = Path("/tmp/_tex_out")
        if img.mode == "RGBA":
            img.save(str(buf) + ".png", "PNG")
            image_bytes = Path(str(buf) + ".png").read_bytes()
            mime = "image/png"
        else:
            img.save(str(buf) + ".jpg", "JPEG", quality=93)
            image_bytes = Path(str(buf) + ".jpg").read_bytes()
            mime = "image/jpeg"
    else:
        # procedural skin
        size = 512
        rng = np.random.default_rng(7)
        base = np.array([0.87, 0.70, 0.58])
        tone = np.clip(base + rng.random((size, size, 3)) * 0.05, 0, 1)
        Image.fromarray((tone * 255).astype(np.uint8), "RGB").save("/tmp/_skin.jpg", "JPEG", quality=93)
        image_bytes = Path("/tmp/_skin.jpg").read_bytes()
        mime = "image/jpeg"

    write_glb(out_path, pos, nrm, uv, idx, image_bytes, mime, name)


if __name__ == "__main__":
    main()
