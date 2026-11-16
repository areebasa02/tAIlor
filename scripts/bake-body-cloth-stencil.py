#!/usr/bin/env python3
"""Bake MHCLO delete_verts into body GLB face indices for cloth stencil.

Uses tee delete_verts + female trousers delete_verts (native), grown by a
1-ring neighborhood. Writes:
  public/models/body-cloth-stencil.json
  src/lib/bodyClothStencil.ts
"""
from __future__ import annotations

import json
import struct
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BODY_GLB = ROOT / "public" / "models" / "makehuman-body.glb"
BODY_OBJ = Path("/tmp/mh/base.obj")
TEE_MHCLO = Path(
    "/tmp/mh-garments/shirts01/clothes/joepal_crude_t-shirt_female/"
    "joepal_crude_t-shirt_female.mhclo"
)
PANTS_MHCLO = Path(
    "/tmp/mh-garments2/clothes/mindfront_female_trousers_1/"
    "mindfront_female_trousers_1.mhclo"
)
OUT_JSON = ROOT / "public" / "models" / "body-cloth-stencil.json"
OUT_TS = ROOT / "src" / "lib" / "bodyClothStencil.ts"


def parse_delete_verts(path: Path) -> set[int]:
    lines = path.read_text().splitlines()
    try:
        i = next(i for i, l in enumerate(lines) if l.strip() == "delete_verts")
    except StopIteration:
        return set()
    tokens: list[str] = []
    for l in lines[i + 1 :]:
        s = l.strip()
        if not s:
            continue
        first = s.split()[0]
        if first.isalpha() and not first[0].isdigit():
            break
        tokens.extend(s.replace(",", " ").split())
    deleted: set[int] = set()
    k = 0
    while k < len(tokens):
        if tokens[k] == "-":
            k += 1
            continue
        try:
            a = int(tokens[k])
        except ValueError:
            break
        if k + 2 < len(tokens) and tokens[k + 1] == "-":
            b = int(tokens[k + 2])
            deleted.update(range(a, b + 1))
            k += 3
        else:
            deleted.add(a)
            k += 1
    return deleted


def parse_bindings(path: Path) -> set[int]:
    lines = path.read_text().splitlines()
    mode = None
    verts: set[int] = set()
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("verts"):
            mode = "verts"
            continue
        if line.startswith("delete_verts"):
            mode = "delete"
            continue
        if mode == "verts":
            parts = line.split()
            if len(parts) >= 9:
                try:
                    verts.update(int(parts[i]) for i in range(3))
                    continue
                except ValueError:
                    mode = None
            else:
                mode = None
    return verts


def load_obj_full(path: Path):
    verts, face_tris = [], []
    with path.open() as f:
        for line in f:
            if line.startswith("v "):
                _, x, y, z = line.split()[:4]
                verts.append((float(x), float(y), float(z)))
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
    return verts, face_tris


def main():
    verts, face_tris = load_obj_full(BODY_OBJ)
    key_to_i = {}
    src_vi = []
    indices = []
    for tri in face_tris:
        for vi, vti, vni in tri:
            key = (vi, vti, vni)
            if key not in key_to_i:
                key_to_i[key] = len(src_vi)
                src_vi.append(vi)
            indices.append(key_to_i[key])
    src_vi = np.array(src_vi, np.int32)
    idx = np.array(indices, np.uint32).reshape(-1, 3)

    data = BODY_GLB.read_bytes()
    off = 12
    chunks = {}
    while off < len(data):
        clen, ctype = struct.unpack_from("<I4s", data, off)
        off += 8
        chunks[ctype] = data[off : off + clen]
        off += clen
    j = json.loads(chunks[b"JSON"].decode().rstrip(" \x00"))
    pos_n = j["accessors"][j["meshes"][0]["primitives"][0]["attributes"]["POSITION"]][
        "count"
    ]
    assert pos_n == len(src_vi), (pos_n, len(src_vi))

    adj: dict[int, set[int]] = defaultdict(set)
    for a, b, c in face_tris:
        for u, v in ((a[0], b[0]), (b[0], c[0]), (c[0], a[0])):
            adj[u].add(v)
            adj[v].add(u)

    tee_del = parse_delete_verts(TEE_MHCLO)
    pants_del = parse_delete_verts(PANTS_MHCLO)
    # Grow 2 rings so stencil covers under fitted female trousers
    frontier = set(pants_del)
    for _ in range(2):
        nxt: set[int] = set()
        for v in frontier:
            nxt |= adj[v]
        pants_del |= nxt
        frontier = nxt

    top_del = set(tee_del)
    for v in list(tee_del):
        top_del |= adj[v]

    def faces_for(deleted: set[int]) -> list[int]:
        mask = np.any(np.isin(src_vi[idx], list(deleted)), axis=1)
        return np.nonzero(mask)[0].astype(np.int32).tolist()

    top_faces = faces_for(top_del)
    pants_faces = faces_for(pants_del)
    union_faces = faces_for(top_del | pants_del)

    payload = {
        "version": 2,
        "baseVertCount": len(verts),
        "expandedVertCount": int(len(src_vi)),
        "faceCount": int(len(idx)),
        "topFaceIndices": top_faces,
        "bottomFaceIndices": pants_faces,
        "unionFaceIndices": union_faces,
        "notes": "MHCLO delete_verts: tee + mindfront_female_trousers_1 (+2-ring).",
    }
    OUT_JSON.write_text(json.dumps(payload, separators=(",", ":")))
    OUT_TS.write_text(
        "/** Auto-generated MHCLO body face stencil — do not edit by hand.\n"
        " *  Regenerated by scripts/bake-body-cloth-stencil.py\n"
        " */\n"
        f"export const BODY_STENCIL_FACE_COUNT = {payload['faceCount']}\n"
        f"export const BODY_STENCIL_TOP_FACES: number[] = {json.dumps(top_faces)}\n"
        f"export const BODY_STENCIL_BOTTOM_FACES: number[] = {json.dumps(pants_faces)}\n"
    )
    print(
        f"OK faces top={len(top_faces)} pants={len(pants_faces)} "
        f"union={len(union_faces)} / {len(idx)}"
    )


if __name__ == "__main__":
    main()
