Conforming clothing for Surface body explorer
==============================================

Failure mode (fixed)
--------------------
Earlier Cloth_* overlays used SphereGeometry / CapsuleGeometry shells placed
near the torso. They read as flat disconnected colored blobs and did not wrap
arms/legs. Body-surface inflate + Y-split MakeHuman suits also failed
(shattered shards / z-fighting).

Current approach
----------------
Parametric garments built in `src/lib/garmentMeshes.ts` from SURFACE landmark
space after figure normalize:
  Cloth_top       — lathed torso + short sleeve tubes (cotton PBR)
  Cloth_bottom    — hip lathe + full pant-leg tubes (denim PBR)
  Cloth_shoes     — foot capsules + soles (leather PBR)
  Cloth_outerwear — longer torso + long sleeves (wool PBR)
  Cloth_shorts    — GLB underwear shorts when Bottom layer off

Fit (Standard / Fitted / Relaxed) rebuilds geometry with different torso /
sleeve / leg radii and clearance — silhouette change, not whole-scene scale.

Garments are Surface-only; Muscles view stays anatomy-only.
MakeHuman CC0 assets remain for body/hair/shorts base meshes.
