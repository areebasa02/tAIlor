#!/usr/bin/env python3
"""MHCLO-fit short04 hair to base.obj and write makehuman-hair.glb (same 1.72m frame).

Does not touch body mesh topology (stencil-safe). CC0 short04 + diffuse.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "models" / "makehuman-hair.glb"
BODY_OBJ = Path("/tmp/mh/base.obj")
HAIR_OBJ = Path("/tmp/mh/short04.obj")
HAIR_MHCLO = Path("/tmp/mh/short04.mhclo")
HAIR_TEX = Path("/tmp/mh/short04_diffuse.png")

spec = importlib.util.spec_from_file_location(
    "fit", ROOT / "scripts" / "fit-mhclo-garments.py"
)
fit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fit)

obj_glb = importlib.util.spec_from_file_location(
    "objglb", ROOT / "scripts" / "obj-to-glb.py"
)
objglb = importlib.util.module_from_spec(obj_glb)
obj_glb.loader.exec_module(objglb)


def main():
    body_raw, _, _, _ = fit.load_obj_mesh(BODY_OBJ)
    meta, bindings = fit.parse_mhclo(HAIR_MHCLO)
    ov, on, ou, ofaces = fit.load_obj_mesh(HAIR_OBJ)
    assert len(ov) == len(bindings), (len(ov), len(bindings))

    # Slight positive offset so hair sits on scalp, not in skull
    fitted = fit.fit_positions(body_raw, bindings, meta, offset_scale=1.08)
    _, scale = fit.body_frame(body_raw)
    y0 = (body_raw * scale)[:, 1].min()
    pos_unique = fitted * scale
    pos_unique[:, 1] -= y0

    # Expand with UVs/normals from OBJ
    pos, nrm, uv, idx, src_vi = fit.expand_indexed(pos_unique, on, ou, ofaces)
    # Flip winding if needed
    right = pos[:, 0] > 0.02
    if right.any() and float(nrm[right, 0].mean()) < 0:
        idx = idx.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
        nrm = -nrm
    nrm = fit.recompute_normals(pos, idx)

    # Darken diffuse so runtime tint isn't fighting a white albedo
    img = Image.open(HAIR_TEX).convert("RGBA")
    arr = np.asarray(img).astype(np.float32)
    rgb = arr[..., :3] * 0.35  # dark brown base
    rgb[..., 0] *= 0.85
    rgb[..., 2] *= 0.7
    arr[..., :3] = np.clip(rgb, 0, 255)
    # Keep alpha for MASK
    out_png = Path("/tmp/mh/short04_dark.png")
    Image.fromarray(arr.astype(np.uint8), "RGBA").save(out_png)
    image_bytes = out_png.read_bytes()

    objglb.write_glb(
        OUT,
        pos,
        nrm,
        uv,
        idx.astype(np.uint32),
        image_bytes,
        "image/png",
        "Hair",
    )
    print("hair bounds", pos.min(0), pos.max(0), "verts", len(pos))


if __name__ == "__main__":
    main()
