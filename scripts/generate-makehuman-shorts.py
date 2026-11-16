#!/usr/bin/env python3
import json, struct, math
from pathlib import Path
import numpy as np

def pad4(b, pad=b'\x00'):
    return b + pad * ((4 - len(b) % 4) % 4)

def load_obj(path):
    verts=[]
    with open(path) as f:
        for line in f:
            if line.startswith('v '):
                _,x,y,z=line.split()[:4]; verts.append((float(x),float(y),float(z)))
    return np.array(verts,float)

body=load_obj('/tmp/mh/base.obj')
h=body[:,1].max()-body[:,1].min(); scale=1.72/h; ymin=body[:,1].min()*scale
bv=body*scale; bv[:,1]-=ymin
# torso only: small |x| and mid z
torso=bv[(bv[:,1]>0.9)&(bv[:,1]<1.1)&(np.abs(bv[:,0])<0.25)]
hip_r=np.percentile(np.sqrt(torso[:,0]**2+torso[:,2]**2), 95) if len(torso) else 0.16
print('torso hip_r', hip_r, 'n', len(torso))

def lathe(profile, segs=28):
    rings=[]
    for r,y in profile:
        ring=[]
        for i in range(segs):
            a=2*math.pi*i/segs
            # elliptical: wider X
            ring.append((r*1.15*math.cos(a), y, r*0.75*math.sin(a)))
        rings.append(ring)
    verts=[p for ring in rings for p in ring]
    faces=[]
    for ri in range(len(rings)-1):
        for i in range(segs):
            a=ri*segs+i; b=ri*segs+(i+1)%segs; c=(ri+1)*segs+i; d=(ri+1)*segs+(i+1)%segs
            faces.append((a,c,b)); faces.append((b,c,d))
    return np.array(verts,float), faces

r=hip_r*1.06  # clearance
sv,sf=lathe([(r*0.92,0.88),(r*1.05,0.96),(r*1.02,1.05),(r*0.9,1.12)])
# leg tubes
parts=[(sv,sf)]
for sx in (1,-1):
    # simple ring skirt for thighs
    tv,tf=lathe([(r*0.55,0.78),(r*0.58,0.88)], 16)
    tv[:,0]+=0.08*sx
    # remap faces offset later via merge
    parts.append((tv,tf))

# merge
verts=[]; faces=[]; off=0
for v,f in parts:
    verts.append(v); faces.extend([(a+off,b+off,c+off) for a,b,c in f]); off+=len(v)
sv=np.vstack(verts); sf=faces
nrm=np.zeros_like(sv)
for a,b,c in sf:
    n=np.cross(sv[b]-sv[a], sv[c]-sv[a]); nrm[a]+=n; nrm[b]+=n; nrm[c]+=n
lens=np.linalg.norm(nrm,axis=1,keepdims=True); lens[lens<1e-8]=1; nrm/=lens
uv=np.zeros((len(sv),2)); uv[:,1]=(sv[:,1]-sv[:,1].min())/(sv[:,1].max()-sv[:,1].min()+1e-6)
idx=np.array(sf,np.uint32).reshape(-1)

def write_glb(path, pos, nrm, uv, idx, name):
    bin_chunks=[]; buffer_views=[]; accessors=[]; byte_offset=0
    def add(data, target=None):
        nonlocal byte_offset
        data=pad4(data); bv={'buffer':0,'byteOffset':byte_offset,'byteLength':len(data)}
        if target is not None: bv['target']=target
        buffer_views.append(bv); bin_chunks.append(data); i=len(buffer_views)-1; byte_offset+=len(data); return i
    pos=pos.astype(np.float32); nrm=nrm.astype(np.float32); uv=uv.astype(np.float32); idx=idx.astype(np.uint32)
    pos_bv=add(pos.tobytes(),34962); pos_acc=len(accessors)
    accessors.append({'bufferView':pos_bv,'componentType':5126,'count':len(pos),'type':'VEC3','max':pos.max(0).tolist(),'min':pos.min(0).tolist()})
    n_bv=add(nrm.tobytes(),34962); n_acc=len(accessors)
    accessors.append({'bufferView':n_bv,'componentType':5126,'count':len(nrm),'type':'VEC3'})
    uv_bv=add(uv.tobytes(),34962); uv_acc=len(accessors)
    accessors.append({'bufferView':uv_bv,'componentType':5126,'count':len(uv),'type':'VEC2'})
    i_bv=add(idx.tobytes(),34963); i_acc=len(accessors)
    accessors.append({'bufferView':i_bv,'componentType':5125,'count':len(idx),'type':'SCALAR'})
    mat={'name':name+'_mat','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':0.88},'doubleSided':True}
    gltf={'asset':{'version':'2.0'},'buffers':[{'byteLength':0}],'bufferViews':buffer_views,'accessors':accessors,'materials':[mat],
          'meshes':[{'name':name,'primitives':[{'attributes':{'POSITION':pos_acc,'NORMAL':n_acc,'TEXCOORD_0':uv_acc},'indices':i_acc,'material':0,'mode':4}]}],
          'nodes':[{'name':name,'mesh':0}],'scenes':[{'nodes':[0]}],'scene':0}
    blob=b''.join(bin_chunks); gltf['buffers'][0]['byteLength']=len(pad4(blob))
    json_bytes=pad4(json.dumps(gltf,separators=(',',':')).encode(), b' '); blob=pad4(blob)
    total=12+8+len(json_bytes)+8+len(blob)
    Path(path).write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(json_bytes),b'JSON')+json_bytes+struct.pack('<I4s',len(blob),b'BIN\x00')+blob)
    print('Wrote', path, Path(path).stat().st_size)

write_glb('public/models/makehuman-shorts.glb', sv, nrm, uv, idx, 'Cloth_shorts')