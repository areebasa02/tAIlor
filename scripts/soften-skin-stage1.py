#!/usr/bin/env python3
from pygltflib import GLTF2, BufferFormat
from pathlib import Path
import numpy as np
from PIL import Image
import io, struct, json

path=Path('public/models/makehuman-body.glb')
# Load image from GLB via trimesh/pygltflib
g=GLTF2().load(str(path))
g.convert_buffers(BufferFormat.BINARYBLOB)
blob=g.binary_blob()
img=g.images[0]
bv=g.bufferViews[img.bufferView]
raw=blob[bv.byteOffset:bv.byteOffset+bv.byteLength]
im=Image.open(io.BytesIO(raw)).convert('RGB')
print('skin tex', im.size, im.mode)
arr=np.asarray(im).astype(np.float32)
h,w,_=arr.shape
yy,xx=np.mgrid[0:h,0:w]
# Mild warmth + microvariation (don't invent fake features that land wrong on UVs)
rng=np.random.default_rng(11)
noise=rng.normal(0, 3.5, arr.shape)
# Slight cheek/lip warmth in upper-central UV band (MH face UVs often mid-upper)
# Soft radial blush near center-top third
cy,cx=h*0.28, w*0.5
r=((yy-cy)**2+(xx-cx)**2)**0.5
blush=np.clip(1.0 - r/(0.22*max(h,w)), 0, 1)[...,None]
arr = arr + noise
arr[...,0] = arr[...,0] + blush[...,0]*6
arr[...,1] = arr[...,1] + blush[...,0]*2
arr = np.clip(arr, 0, 255).astype(np.uint8)
buf=io.BytesIO()
Image.fromarray(arr,'RGB').save(buf,'JPEG',quality=92)
new=buf.getvalue()
print('new jpg', len(new), 'old', len(raw))

# Rebuild GLB with replaced image via obj-to-glb path: easier to re-export from base.obj
# with new texture BUT that can change expand order. Safer: rewrite buffer if same size pad.
# Pad new image to same length if possible, else full rewrite with pygltflib save.

from scripts import obj_to_glb as og
# Actually import path
import importlib.util
spec=importlib.util.spec_from_file_location('og','scripts/obj-to-glb.py')
og=importlib.util.module_from_spec(spec); spec.loader.exec_module(og)
verts,norms,uvs,faces=og.load_obj(Path('/tmp/mh/base.obj'))
pos,nrm,uv,idx=og.expand(verts,norms,uvs,faces)
height=pos[:,1].max()-pos[:,1].min()
scale=1.72/height
pos*=scale
pos[:,1]-=pos[:,1].min()
# Verify face count matches stencil
print('faces', len(idx)//3)
import json as J
st=J.load(open('public/models/body-cloth-stencil.json'))
print('stencil faceCount', st['faceCount'])
# If face count differs, DO NOT replace body mesh — only skip texture remesh
if len(idx)//3 != st['faceCount']:
  print('FACE COUNT MISMATCH — abort body remesh; keep geometry')
else:
  print('face count OK — writing body with improved skin')
  og.write_glb(path, pos, nrm, uv, idx, new, 'image/jpeg', 'Body')
