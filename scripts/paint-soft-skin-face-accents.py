#!/usr/bin/env python3
"""Paint subtle facial features onto body skin using mesh UVs (topology preserved)."""
from pathlib import Path
import importlib.util, io, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

spec=importlib.util.spec_from_file_location('og','scripts/obj-to-glb.py')
og=importlib.util.module_from_spec(spec); spec.loader.exec_module(og)

verts,norms,uvs,faces=og.load_obj(Path('/tmp/mh/base.obj'))
pos,nrm,uv,idx=og.expand(verts,norms,uvs,faces)
height=pos[:,1].max()-pos[:,1].min(); scale=1.72/height
pos=pos*scale; pos[:,1]-=pos[:,1].min()
stencil_path = Path('public/models/body-cloth-stencil.json')
if stencil_path.exists():
    assert len(idx)//3 == json.load(open(stencil_path))['faceCount']

# Face verts: high Y, forward Z
face=(pos[:,1]>1.48)&(pos[:,2]>0.02)&(np.abs(pos[:,0])<0.12)
print('face verts', face.sum())
fu=uv[face]
print('face UV u', fu[:,0].min(), fu[:,0].max(), 'v', fu[:,1].min(), fu[:,1].max())
# Also mouth/eyes bands by Y
eyes=(pos[:,1]>1.58)&(pos[:,1]<1.64)&(pos[:,2]>0.05)&(np.abs(pos[:,0])>0.02)&(np.abs(pos[:,0])<0.08)
mouth=(pos[:,1]>1.52)&(pos[:,1]<1.56)&(pos[:,2]>0.08)&(np.abs(pos[:,0])<0.04)
print('eye uv samples', uv[eyes][:5] if eyes.any() else None)
print('mouth uv', uv[mouth].mean(0) if mouth.any() else None)

# Build skin
size=1024
rng=np.random.default_rng(7)
base=np.array([222, 180, 150], float)
arr=np.clip(base + rng.normal(0, 4, (size,size,3)), 0, 255).astype(np.uint8)
im=Image.fromarray(arr,'RGB')
draw=ImageDraw.Draw(im, 'RGBA')

def uv_to_px(u,v):
  return int(np.clip(u,0,1)*(size-1)), int(np.clip(1.0-v,0,1)*(size-1))  # if v already flipped in expand, use v directly

# Our expand already flipped V for glTF. In texture image, v=0 is bottom in GL typically
# PIL y=0 is top. For glTF TEXCOORD, after flip v' = 1-v_obj, image row = (1-v')*h = v_obj*h
# Actually write_glb uses uv as stored; sampling in three.js uses standard.
# Paint using mean UV of feature verts:
def paint_soft_ellipse(uvs, color, rx=8, ry=5, alpha=90):
  if len(uvs)==0: return
  u,v=uvs.mean(0)
  # glTF UV: v=0 bottom. PIL: y=0 top → y = (1-v)*size
  x=int(u*(size-1)); y=int((1.0-v)*(size-1))
  overlay=Image.new('RGBA',(size,size),(0,0,0,0))
  d=ImageDraw.Draw(overlay)
  d.ellipse([x-rx,y-ry,x+rx,y+ry], fill=(*color, alpha))
  overlay=overlay.filter(ImageFilter.GaussianBlur(radius=3))
  return overlay

layers=[]
# left/right eyes
for sign in (-1,1):
  m=(pos[:,1]>1.58)&(pos[:,1]<1.64)&(pos[:,2]>0.05)&(pos[:,0]*sign>0.02)&(np.abs(pos[:,0])<0.085)
  if m.any():
    ov=paint_soft_ellipse(uv[m], (40,30,28), rx=10, ry=6, alpha=110)
    if ov: layers.append(ov)
# brows
for sign in (-1,1):
  m=(pos[:,1]>1.63)&(pos[:,1]<1.67)&(pos[:,2]>0.04)&(pos[:,0]*sign>0.02)&(np.abs(pos[:,0])<0.09)
  if m.any():
    ov=paint_soft_ellipse(uv[m], (55,40,30), rx=14, ry=4, alpha=80)
    if ov: layers.append(ov)
# lips
m=(pos[:,1]>1.52)&(pos[:,1]<1.56)&(pos[:,2]>0.09)&(np.abs(pos[:,0])<0.045)
if m.any():
  ov=paint_soft_ellipse(uv[m], (180,90,90), rx=16, ry=6, alpha=70)
  if ov: layers.append(ov)
# soft cheek warmth
for sign in (-1,1):
  m=(pos[:,1]>1.54)&(pos[:,1]<1.60)&(pos[:,2]>0.06)&(pos[:,0]*sign>0.04)&(np.abs(pos[:,0])<0.10)
  if m.any():
    ov=paint_soft_ellipse(uv[m], (210,120,110), rx=18, ry=14, alpha=40)
    if ov: layers.append(ov)

im=im.convert('RGBA')
for ov in layers:
  im=Image.alpha_composite(im, ov)
im=im.convert('RGB')
buf=io.BytesIO(); im.save(buf,'JPEG',quality=93)
og.write_glb(Path('public/models/makehuman-body.glb'), pos, nrm, uv, idx, buf.getvalue(), 'image/jpeg', 'Body')
print('wrote body with face accents, layers', len(layers))
# bump cache
