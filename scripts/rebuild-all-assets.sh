#!/usr/bin/env bash
# Rebuild VFR public/models binary assets from sources that worked in
# transcript bc-70d915f4-0c96-570e-bdb0-d70550076d08 (upgrade end-state).
set -euo pipefail

ROOT="${ROOT:-/agent/repos/tAIlor}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS="$ROOT/public/models"
MH=/tmp/mh
CLOTHES=/tmp/mh-clothes
GARMENTS=/tmp/mh-garments
GARMENTS2=/tmp/mh-garments2

mkdir -p "$MODELS" "$MH" "$CLOTHES" "$GARMENTS" "$GARMENTS2"
cd "$ROOT"

# Prefer recovered scripts from this directory when repo copies are missing
export PYTHONPATH="$SCRIPT_DIR:${PYTHONPATH:-}"
cp_if_missing() {
  local name="$1"
  if [[ ! -f "$ROOT/scripts/$name" && -f "$SCRIPT_DIR/$name" ]]; then
    mkdir -p "$ROOT/scripts"
    cp "$SCRIPT_DIR/$name" "$ROOT/scripts/$name"
  fi
}
for s in obj-to-glb.py generate-surface-models.py generate-garments.py \
         generate-makehuman-shorts.py generate-cloth-shells-msg418.py \
         fit-mhclo-garments.py bake-body-cloth-stencil.py upgrade-mannequin-hair.py \
         paint-soft-skin-face-accents.py soften-skin-stage2-reexpand.py; do
  cp_if_missing "$s"
done

echo "== deps =="
python3 - <<'PY'
import importlib, subprocess, sys
need = ["numpy", "PIL", "pygltflib"]
missing = []
for m in need:
  try:
    importlib.import_module(m if m != "PIL" else "PIL")
  except Exception:
    missing.append("Pillow" if m == "PIL" else m)
if missing:
  subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", *missing])
print("ok", need)
PY

echo "== 1) Z-Anatomy muscles =="
COMMIT=4120ee68b6604b8f2f69105d6de6166fad4734c4
BASE="https://raw.githubusercontent.com/slfresh/fitmitwith-anatomy-atlas/${COMMIT}"
curl -fsSL -o "$MODELS/z-anatomy-muscles.glb" "${BASE}/models/full-body-male-mobile.glb"
curl -fsSL -o "$MODELS/ATTRIBUTION.txt" "${BASE}/ATTRIBUTION.txt" || true
curl -fsSL -o "$MODELS/LICENSE" "${BASE}/LICENSE" || true
curl -fsSL -o "$MODELS/Z-Anatomy-LICENSE.txt" "${BASE}/upstream/Z-Anatomy-LICENSE.txt" || true
echo "expected sha256 d80bebc4045069b660ca8e7afe599d76d15ccc7d96410b3727c600ef01d24e54"
sha256sum "$MODELS/z-anatomy-muscles.glb"

echo "== 2) MakeHuman base.obj + short04 hair =="
curl -fsSL -o "$MH/base.obj" \
  "https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj"
curl -fsSL -o "$MH/short04.obj" \
  "https://download.tuxfamily.org/makehuman/assets/1.2/base/hair/short04/short04.obj"
curl -fsSL -o "$MH/short04.mhclo" \
  "https://download.tuxfamily.org/makehuman/assets/1.2/base/hair/short04/short04.mhclo"
curl -fsSL -o "$MH/short04_diffuse.png" \
  "https://download.tuxfamily.org/makehuman/assets/1.2/base/hair/short04/short04_diffuse.png" || true

echo "== 3) Body OBJ→GLB (procedural soft-skin JPEG; MH young_caucasian URLs 404'd) =="
python3 "$ROOT/scripts/obj-to-glb.py" "$MH/base.obj" "$MODELS/makehuman-body.glb" Body
# Optional substitute body/hair/shorts (landmark-tuned) — NOT the final MH body path:
# python3 "$ROOT/scripts/generate-surface-models.py"

echo "== 4) Soft-skin upgrade (UV face accents — final working stage msg 2305) =="
# Stage2 soften+reexpand (msg 2283) then face accents (msg 2305)
python3 "$SCRIPT_DIR/soften-skin-stage2-reexpand.py" || true
python3 "$SCRIPT_DIR/paint-soft-skin-face-accents.py"

echo "== 5) Hair (MHCLO short04) =="
python3 "$ROOT/scripts/upgrade-mannequin-hair.py"

echo "== 6) Procedural makehuman-shorts.glb (lathe; CharacterCreator shorts 404'd) =="
python3 "$SCRIPT_DIR/generate-makehuman-shorts.py"
# Later app used parametric shorts in JS; GLB still produced for Surface fallback.
# High-clearance inflate shorts+shoes+outerwear (final disk verts for shoes=3521):
# python3 "$SCRIPT_DIR/generate-cloth-shells-msg418.py"

echo "== 7) MH shoes03 + suits (for generate-garments.py path) =="
for path in \
  "clothes/shoes03/shoes03.obj" \
  "clothes/male_casualsuit05/male_casualsuit05.obj" \
  "clothes/male_elegantsuit01/male_elegantsuit01.obj"; do
  name=$(basename "$path")
  dir=$(basename $(dirname "$path"))
  mkdir -p "$CLOTHES/$dir"
  curl -fsSL -o "$CLOTHES/$dir/$name" \
    "https://download.tuxfamily.org/makehuman/assets/1.2/base/${path}" || true
done
# Also flat shoes03.obj for older script paths
[[ -f "$CLOTHES/shoes03/shoes03.obj" ]] && cp -n "$CLOTHES/shoes03/shoes03.obj" "$CLOTHES/shoes03.obj" || true

echo "== 8) cloth-shoes.glb + cloth-outerwear.glb =="
# Final matching sizes came from msg418 high-clearance inflate (shoes 3521 verts).
# generate-garments.py can use MH shoes03 when present (2542 verts morph path).
python3 "$SCRIPT_DIR/generate-cloth-shells-msg418.py"
# Optional morph-capable alternative:
# python3 "$ROOT/scripts/generate-garments.py"

echo "== 9) shirts01_cc0 (joepal tee) + mindfront female trousers =="
# Live files*.makehumancommunity.org often fails DNS from cloud VMs.
# Prefer Wayback for shirts01_cc0; trousers mirrored on GitHub (CC BY 4.0).
if [[ ! -f "$GARMENTS/shirts01_cc0.zip" ]]; then
  curl -fL --max-time 300 -o "$GARMENTS/shirts01_cc0.zip" \
    "https://web.archive.org/web/20251201164010id_/https://files2.makehumancommunity.org/asset_packs/shirts01/shirts01_cc0.zip" \
  || curl -fL --max-time 180 -o "$GARMENTS/shirts01_cc0.zip" \
    "https://files2.makehumancommunity.org/asset_packs/shirts01/shirts01_cc0.zip" \
  || curl -fL --max-time 180 -o "$GARMENTS/shirts01_cc0.zip" \
    "https://files.makehumancommunity.org/asset_packs/shirts01/shirts01_cc0.zip"
fi
unzip -qo "$GARMENTS/shirts01_cc0.zip" -d "$GARMENTS/shirts01"

TROUSERS_DIR="$GARMENTS2/clothes/mindfront_female_trousers_1"
mkdir -p "$TROUSERS_DIR"
if [[ ! -f "$TROUSERS_DIR/mindfront_female_trousers_1.mhclo" ]]; then
  GH_TROUSERS="https://raw.githubusercontent.com/RavinMaddHatter/Madhatters-Table-Top-RPG-Mini-Maker/01e848fdb85cd270228027bf7e1bb8eb85ac47d4/src/assets/clothes/mindfront_female_trousers_1"
  curl -fsSL -o "$TROUSERS_DIR/mindfront_female_trousers_1.mhclo" \
    "$GH_TROUSERS/mindfront_female_trousers_1.mhclo"
  curl -fsSL -o "$TROUSERS_DIR/f_trousers_01.obj" \
    "$GH_TROUSERS/f_trousers_01.obj"
fi

echo "joepal tee paths:"
ls -la "$GARMENTS/shirts01/clothes/joepal_crude_t-shirt_female/" | head
echo "mindfront trousers paths:"
ls -la "$TROUSERS_DIR/" | head

echo "== 10) MHCLO fit tee + trousers + stencil bake =="
python3 "$ROOT/scripts/fit-mhclo-garments.py"
python3 "$ROOT/scripts/bake-body-cloth-stencil.py"

echo "== 11) sha256 of public/models/*.glb =="
sha256sum "$MODELS"/*.glb | sort
ls -lh "$MODELS"/*.glb

echo "DONE. Critical pack paths:"
echo "  tee:  $GARMENTS/shirts01/clothes/joepal_crude_t-shirt_female/{joepal_crude_t-shirt_female.mhclo,crudefemaletshirt.obj}"
echo "  pants:$GARMENTS2/clothes/mindfront_female_trousers_1/{mindfront_female_trousers_1.mhclo,f_trousers_01.obj}"
