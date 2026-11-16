#!/usr/bin/env python3
from pathlib import Path
import importlib.util, json, io
import numpy as np
from PIL import Image
from pygltflib import GLTF2, BufferFormat

spec=importlib.util.spec_from_file_location('og','scripts/obj-to-glb.py')
og=importlib.util.module_from_spec(spec); spec.loader.exec_module(og)

# Current GLB face count
g=GLTF2().load('public/models/makehuman-body.glb')
acc=g.accessors[g.meshes[0].primitives[0].indices]
print('current index count', acc.count, 'faces', acc.count//3)
st=json.load(open('public/models/body-cloth-stencil.json'))
print('stencil', st['faceCount'])

verts,norms,uvs,faces=og.load_obj(Path('/tmp/mh/base.obj'))
pos,nrm,uv,idx=og.expand(verts,norms,uvs,faces)
print('reexpand faces', len(idx)//3, 'verts', len(pos))

# Build improved skin jpeg
g.convert_buffers(BufferFormat.BINARYBLOB)
blob=g.binary_blob()
img=g.images[0]
bv=g.bufferViews[img.bufferView]
raw=blob[bv.byteOffset:bv.byteOffset+bv.byteLength]
im=Image.open(io.BytesIO(raw)).convert('RGB')
arr=np.asarray(im).astype(np.float32)
h,w,_=arr.shape
yy,xx=np.mgrid[0:h,0:w]
rng=np.random.default_rng(11)
noise=rng.normal(0, 3.5, arr.shape)
cy,cx=h*0.28, w*0.5
r=((yy-cy)**2+(xx-cx)**2)**0.5
blush=np.clip(1.0 - r/(0.22*max(h,w)), 0, 1)[...,None]
arr = np.clip(arr + noise + blush*np.array([6,2,1]), 0, 255).astype(np.uint8)
buf=io.BytesIO(); Image.fromarray(arr,'RGB').save(buf,'JPEG',quality=92)
new=buf.getvalue()

if len(idx)//3 == st['faceCount']:
  height=pos[:,1].max()-pos[:,1].min(); scale=1.72/height
  pos=pos*scale; pos[:,1]-=pos[:,1].min()
  og.write_glb(Path('public/models/makehuman-body.glb'), pos, nrm, uv, idx, new, 'image/jpeg', 'Body')
  print('rewrote body')
else:
  print('SKIP remesh — face mismatch; leaving body geometry')
  # Still try to patch texture only via full glb rewrite keeping same accessors hard —
  # skip if mismatch
