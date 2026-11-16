#!/usr/bin/env python3
"""
Generate CC0-style MakeHuman substitute GLBs tuned to the SURFACE landmark table
in body-explorer-spec.md. Exact MakeHuman 1.2/1.3 export is not available in this
VM; these meshes preserve orientation (face +Z, Y-up, left=+X), A-pose arms, and
Cloth_shorts naming so the 37-region explorer works.
"""
from __future__ import annotations

import json
import math
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "public" / "models"
OUT.mkdir(parents=True, exist_ok=True)


def lathe(profile, segs=24, y_off=0.0):
    """profile: list of (radius, y) bottom→top. Returns verts, faces, normals."""
    rings = []
    for r, y in profile:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append((r * math.cos(a), y + y_off, r * math.sin(a)))
        rings.append(ring)
    verts = [p for ring in rings for p in ring]
    faces = []
    for ri in range(len(rings) - 1):
        for i in range(segs):
            a = ri * segs + i
            b = ri * segs + (i + 1) % segs
            c = (ri + 1) * segs + i
            d = (ri + 1) * segs + (i + 1) % segs
            faces.append((a, c, b))
            faces.append((b, c, d))
    return np.array(verts, dtype=np.float32), faces


def tube(p0, p1, r0, r1, segs=12, rings=8):
    """Tapered tube from p0→p1."""
    p0 = np.array(p0, dtype=np.float64)
    p1 = np.array(p1, dtype=np.float64)
    axis = p1 - p0
    length = np.linalg.norm(axis)
    if length < 1e-8:
        return np.zeros((0, 3), np.float32), []
    axis = axis / length
    # orthonormal basis
    tmp = np.array([0, 1, 0]) if abs(axis[1]) < 0.9 else np.array([1, 0, 0])
    u = np.cross(axis, tmp)
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    verts = []
    for j in range(rings + 1):
        t = j / rings
        center = p0 + axis * (length * t)
        r = r0 * (1 - t) + r1 * t
        for i in range(segs):
            a = 2 * math.pi * i / segs
            offset = (math.cos(a) * u + math.sin(a) * v) * r
            verts.append(center + offset)
    faces = []
    for j in range(rings):
        for i in range(segs):
            a = j * segs + i
            b = j * segs + (i + 1) % segs
            c = (j + 1) * segs + i
            d = (j + 1) * segs + (i + 1) % segs
            faces.append((a, c, b))
            faces.append((b, c, d))
    return np.array(verts, dtype=np.float32), faces


def sphere(center, radius, segs=16, stacks=12):
    cx, cy, cz = center
    verts = []
    for j in range(stacks + 1):
        v = j / stacks
        phi = v * math.pi
        for i in range(segs):
            u = i / segs
            theta = u * 2 * math.pi
            x = cx + radius * math.sin(phi) * math.cos(theta)
            y = cy + radius * math.cos(phi)
            z = cz + radius * math.sin(phi) * math.sin(theta)
            verts.append((x, y, z))
    faces = []
    for j in range(stacks):
        for i in range(segs):
            a = j * segs + i
            b = j * segs + (i + 1) % segs
            c = (j + 1) * segs + i
            d = (j + 1) * segs + (i + 1) % segs
            faces.append((a, c, b))
            faces.append((b, c, d))
    return np.array(verts, dtype=np.float32), faces


def merge(parts):
    verts = []
    faces = []
    offset = 0
    for v, f in parts:
        if len(v) == 0:
            continue
        verts.append(v)
        faces.extend([(a + offset, b + offset, c + offset) for a, b, c in f])
        offset += len(v)
    if not verts:
        return np.zeros((0, 3), np.float32), []
    return np.vstack(verts).astype(np.float32), faces


def compute_normals(verts, faces):
    normals = np.zeros_like(verts)
    for a, b, c in faces:
        n = np.cross(verts[b] - verts[a], verts[c] - verts[a])
        normals[a] += n
        normals[b] += n
        normals[c] += n
    lens = np.linalg.norm(normals, axis=1, keepdims=True)
    lens[lens < 1e-8] = 1
    return (normals / lens).astype(np.float32)


def ellipsoid_uv(verts):
    # simple cylindrical-ish UVs
    x, y, z = verts[:, 0], verts[:, 1], verts[:, 2]
    u = 0.5 + np.arctan2(x, z) / (2 * math.pi)
    ymin, ymax = y.min(), y.max()
    v = (y - ymin) / max(ymax - ymin, 1e-6)
    return np.stack([u, v], axis=1).astype(np.float32)


def pad4(b: bytes, pad: bytes = b"\x00") -> bytes:
    n = (4 - len(b) % 4) % 4
    return b + pad * n


def write_glb(
    path: Path,
    meshes: list[dict],
    images: list[tuple[str, bytes]] | None = None,
):
    """
    meshes: [{name, verts(Nx3), faces, normals, uvs?, color(rgba), metallic, roughness,
              doubleSided, alphaMode?, alphaCutoff?, textureIndex?}]
    images: [(mime, bytes)]
    """
    images = images or []
    bin_chunks = []
    accessors = []
    buffer_views = []
    materials = []
    gltf_meshes = []
    nodes = []
    textures = []
    gltf_images = []
    byte_offset = 0

    def add_buffer(data: bytes, target=None):
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

    for mime, img_bytes in images:
        bv = add_buffer(img_bytes)
        gltf_images.append({"mimeType": mime, "bufferView": bv})
        textures.append({"source": len(gltf_images) - 1})

    for m in meshes:
        verts = m["verts"].astype(np.float32)
        faces = np.array(m["faces"], dtype=np.uint32)
        normals = m.get("normals")
        if normals is None:
            normals = compute_normals(verts, m["faces"])
        uvs = m.get("uvs")
        if uvs is None:
            uvs = ellipsoid_uv(verts)

        # indexed geometry
        pos_bv = add_buffer(verts.tobytes(), 34962)
        amin = verts.min(0).tolist()
        amax = verts.max(0).tolist()
        pos_acc = len(accessors)
        accessors.append(
            {
                "bufferView": pos_bv,
                "componentType": 5126,
                "count": len(verts),
                "type": "VEC3",
                "max": amax,
                "min": amin,
            }
        )
        n_bv = add_buffer(normals.tobytes(), 34962)
        n_acc = len(accessors)
        accessors.append(
            {
                "bufferView": n_bv,
                "componentType": 5126,
                "count": len(normals),
                "type": "VEC3",
            }
        )
        uv_bv = add_buffer(uvs.tobytes(), 34962)
        uv_acc = len(accessors)
        accessors.append(
            {
                "bufferView": uv_bv,
                "componentType": 5126,
                "count": len(uvs),
                "type": "VEC2",
            }
        )
        idx_flat = faces.reshape(-1).astype(np.uint32)
        idx_bv = add_buffer(idx_flat.tobytes(), 34963)
        idx_acc = len(accessors)
        accessors.append(
            {
                "bufferView": idx_bv,
                "componentType": 5125,
                "count": len(idx_flat),
                "type": "SCALAR",
            }
        )

        mat = {
            "name": m["name"] + "_mat",
            "pbrMetallicRoughness": {
                "baseColorFactor": m.get("color", [1, 1, 1, 1]),
                "metallicFactor": m.get("metallic", 0),
                "roughnessFactor": m.get("roughness", 0.68),
            },
            "doubleSided": m.get("doubleSided", True),
        }
        if "textureIndex" in m:
            mat["pbrMetallicRoughness"]["baseColorTexture"] = {
                "index": m["textureIndex"]
            }
        if m.get("alphaMode"):
            mat["alphaMode"] = m["alphaMode"]
            if "alphaCutoff" in m:
                mat["alphaCutoff"] = m["alphaCutoff"]
        mat_idx = len(materials)
        materials.append(mat)

        prim = {
            "attributes": {"POSITION": pos_acc, "NORMAL": n_acc, "TEXCOORD_0": uv_acc},
            "indices": idx_acc,
            "material": mat_idx,
            "mode": 4,
        }
        mesh_idx = len(gltf_meshes)
        gltf_meshes.append({"name": m["name"], "primitives": [prim]})
        nodes.append({"name": m["name"], "mesh": mesh_idx})

    blob = b"".join(bin_chunks)
    gltf = {
        "asset": {"version": "2.0", "generator": "tAIlor-surface-gen"},
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "materials": materials,
        "meshes": gltf_meshes,
        "nodes": nodes,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "scene": 0,
    }
    if textures:
        gltf["textures"] = textures
        gltf["images"] = gltf_images

    # glTF: JSON chunk padded with spaces (0x20); BIN with nulls (0x00)
    json_bytes = pad4(
        json.dumps(gltf, separators=(",", ":")).encode("utf-8"), pad=b" "
    )
    blob = pad4(blob, pad=b"\x00")
    total = 12 + 8 + len(json_bytes) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        f.write(json_bytes)
        f.write(struct.pack("<I4s", len(blob), b"BIN\x00"))
        f.write(blob)
    print(f"Wrote {path} ({path.stat().st_size} bytes, {len(nodes)} meshes)")


def make_skin_texture(path: Path, size=512):
    """Soft procedural skin albedo (JPEG)."""
    rng = np.random.default_rng(7)
    base = np.array([0.87, 0.70, 0.58])
    yy, xx = np.mgrid[0:size, 0:size]
    noise = rng.random((size, size, 3)) * 0.06
    # subtle cheek/limb variation
    radial = np.sqrt(((xx - size / 2) / size) ** 2 + ((yy - size / 2) / size) ** 2)
    tone = base + noise - radial[..., None] * 0.04
    tone = np.clip(tone, 0, 1)
    img = Image.fromarray((tone * 255).astype(np.uint8), "RGB")
    img.save(path, "JPEG", quality=93)
    return path.read_bytes()


def make_hair_texture(path: Path, size=256):
    rng = np.random.default_rng(3)
    base = np.array([0.18, 0.12, 0.08])
    noise = rng.random((size, size, 3)) * 0.08
    tone = np.clip(base + noise, 0, 1)
    alpha = (np.linspace(1, 0.2, size)[None, :] * np.ones((size, size))).T
    # keep mostly opaque with soft fringe
    a = (np.clip(alpha + rng.random((size, size)) * 0.1, 0, 1) * 255).astype(np.uint8)
    rgb = (tone * 255).astype(np.uint8)
    rgba = np.dstack([rgb, a])
    Image.fromarray(rgba, "RGBA").save(path, "PNG")
    return path.read_bytes()


def build_body():
    # Coordinates match SURFACE landmarks after viewer normalize (approx before).
    # Build in a space where feet≈0 and head≈1.72 (typical meters), A-pose.
    parts = []

    # Head
    parts.append(sphere((0, 1.62, 0.02), 0.105, 20, 14))
    # Neck
    parts.append(tube((0, 1.48, -0.02), (0, 1.52, 0.0), 0.055, 0.05, 14, 4))
    # Torso (lathe-ish via stacked tubes / profile)
    torso_prof = [
        (0.14, 0.95),
        (0.18, 1.05),
        (0.22, 1.18),
        (0.24, 1.30),
        (0.23, 1.40),
        (0.20, 1.48),
    ]
    # Use ellipse by scaling X/Z later — approximate with lathe then scale
    tv, tf = lathe([(r, y) for r, y in torso_prof], segs=28)
    tv[:, 0] *= 1.15
    tv[:, 2] *= 0.72
    parts.append((tv, tf))

    # Hips / pelvis
    hips_v, hips_f = lathe([(0.16, 0.88), (0.19, 0.95), (0.17, 1.02)], segs=24)
    hips_v[:, 0] *= 1.2
    hips_v[:, 2] *= 0.75
    parts.append((hips_v, hips_f))

    # Legs — left (+X) and right (-X)
    for sx in (1, -1):
        hip = (0.10 * sx, 0.92, -0.02)
        knee = (0.12 * sx, 0.48, -0.02)
        ankle = (0.11 * sx, 0.08, -0.02)
        foot_end = (0.11 * sx, 0.02, 0.12)
        parts.append(tube(hip, knee, 0.09, 0.07, 14, 10))
        parts.append(tube(knee, ankle, 0.065, 0.05, 12, 10))
        parts.append(tube(ankle, foot_end, 0.045, 0.04, 10, 4))
        # foot pad
        parts.append(sphere((0.11 * sx, 0.03, 0.06), 0.045, 10, 8))

    # Arms A-pose — match landmark reach (~hand x~1.0 after normalize)
    for sx in (1, -1):
        shoulder = (0.22 * sx, 1.40, -0.04)
        elbow = (0.48 * sx, 1.15, -0.02)
        wrist = (0.70 * sx, 0.95, 0.08)
        hand = (0.82 * sx, 0.82, 0.16)
        parts.append(sphere(shoulder, 0.07, 12, 10))
        parts.append(tube(shoulder, elbow, 0.055, 0.048, 12, 8))
        parts.append(tube(elbow, wrist, 0.045, 0.038, 10, 8))
        parts.append(tube(wrist, hand, 0.035, 0.04, 10, 4))
        parts.append(sphere(hand, 0.05, 10, 8))

    # Eyes
    for sx in (1, -1):
        parts.append(sphere((0.035 * sx, 1.64, 0.09), 0.018, 10, 8))
    # Eyebrows as thin tubes
    for sx in (1, -1):
        parts.append(
            tube(
                (0.015 * sx, 1.675, 0.095),
                (0.055 * sx, 1.678, 0.09),
                0.006,
                0.005,
                6,
                2,
            )
        )

    return merge(parts)


def build_hair():
    # Short cap over head
    parts = []
    parts.append(sphere((0, 1.64, -0.01), 0.112, 20, 12))
    # trim bottom by not adding lower hemisphere much — add fringe rings
    fringe_v, fringe_f = lathe(
        [(0.10, 1.55), (0.11, 1.58), (0.105, 1.62)], segs=20
    )
    fringe_v[:, 2] *= 0.9
    fringe_v[:, 2] -= 0.02
    parts.append((fringe_v, fringe_f))
    return merge(parts)


def build_shorts():
    # Fitted shorts around hips/upper thighs
    parts = []
    shell_v, shell_f = lathe(
        [(0.15, 0.88), (0.195, 0.95), (0.18, 1.05), (0.16, 1.12)], segs=28
    )
    shell_v[:, 0] *= 1.25
    shell_v[:, 2] *= 0.78
    # slight clearance outward
    shell_v[:, 0] *= 1.04
    shell_v[:, 2] *= 1.04
    parts.append((shell_v, shell_f))
    for sx in (1, -1):
        # leg openings
        parts.append(
            tube(
                (0.09 * sx, 0.88, -0.01),
                (0.10 * sx, 0.78, -0.01),
                0.105,
                0.10,
                14,
                4,
            )
        )
    return merge(parts)


def build_extra_clothes():
    """Optional Cloth_* meshes packed into shorts file? Keep separate overlays in React.
    Here only Cloth_shorts is required in makehuman-shorts.glb."""
    return build_shorts()


def main():
    skin_jpg = OUT / "_gen_skin.jpg"
    hair_png = OUT / "_gen_hair.png"
    skin_bytes = make_skin_texture(skin_jpg)
    hair_bytes = make_hair_texture(hair_png)

    body_v, body_f = build_body()
    # Shift so feet sit near y=0
    ymin = body_v[:, 1].min()
    body_v[:, 1] -= ymin
    write_glb(
        OUT / "makehuman-body.glb",
        [
            {
                "name": "Body",
                "verts": body_v,
                "faces": body_f,
                "color": [1, 1, 1, 1],
                "roughness": 0.68,
                "metallic": 0,
                "textureIndex": 0,
            }
        ],
        images=[("image/jpeg", skin_bytes)],
    )

    hair_v, hair_f = build_hair()
    hair_v[:, 1] -= ymin
    write_glb(
        OUT / "makehuman-hair.glb",
        [
            {
                "name": "Hair",
                "verts": hair_v,
                "faces": hair_f,
                "color": [1, 1, 1, 1],
                "roughness": 0.85,
                "metallic": 0,
                "textureIndex": 0,
                "alphaMode": "MASK",
                "alphaCutoff": 0.35,
            }
        ],
        images=[("image/png", hair_bytes)],
    )

    shorts_v, shorts_f = build_shorts()
    shorts_v[:, 1] -= ymin
    write_glb(
        OUT / "makehuman-shorts.glb",
        [
            {
                "name": "Cloth_shorts",
                "verts": shorts_v,
                "faces": shorts_f,
                "color": [1, 1, 1, 1],
                "roughness": 0.88,
                "metallic": 0,
            }
        ],
    )

    # Attribution note
    (OUT / "MAKEHUMAN-SUBSTITUTE-README.txt").write_text(
        "Surface figure GLBs (makehuman-body.glb, makehuman-hair.glb, "
        "makehuman-shorts.glb) are CC0-style procedural substitutes generated "
        "for tAIlor because MakeHuman 1.2/1.3 could not be run in the build VM. "
        "They follow the body-explorer-spec orientation, A-pose, material "
        "defaults, and Cloth_shorts naming. Landmark table from the original "
        "MakeHuman export is used; verify highlights and nudge landmarks if needed.\n"
        "Z-Anatomy muscle model is separate (CC BY-SA 4.0) — see ATTRIBUTION.txt.\n"
    )
    # cleanup temp textures from public if desired — keep for debugging, remove gens
    skin_jpg.unlink(missing_ok=True)
    hair_png.unlink(missing_ok=True)
    print("Done.")


if __name__ == "__main__":
    main()
