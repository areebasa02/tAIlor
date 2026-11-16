#!/usr/bin/env python3
"""High-clearance inflate garments WITHOUT morph targets (fit applied in JS via radial scale)."""
import json, struct, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path('public/models')
BODY_OBJ = Path('/tmp/mh/base.obj')

def pad4(b, pad=b'\x00'):
    return b + pad * ((4 - len(b) % 4) % 4)

def load_obj(path):
    verts, norms, uvs, face_tris = [], [], [], []
    with path.open() as f:
        for line in f:
            if line.startswith('v '):
                _,x,y,z=line.split()[:4]; verts.append((float(x),float(y),float(z)))
            elif line.startswith('vn '):
                _,x,y,z=line.split()[:4]; norms.append((float(x),float(y),float(z)))
            elif line.startswith('vt '):
                p=line.split(); uvs.append((float(p[1]), float(p[2])))
            elif line.startswith('f '):
                corners=[]
                for tok in line.split()[1:]:
                    bits=tok.split('/')
                    vi=int(bits[0])-1
                    vti=int(bits[1])-1 if len(bits)>1 and bits[1] else None
                    vni=int(bits[2])-1 if len(bits)>2 and bits[2] else None
                    corners.append((vi,vti,vni))
                for i in range(1,len(corners)-1):
                    face_tris.append((corners[0],corners[i],corners[i+1]))
    return np.array(verts,float), norms, uvs, face_tris

def expand(verts, norms, uvs, face_tris):
    key_to_i={}; positions=[]; normals_o=[]; uvs_o=[]; indices=[]
    for tri in face_tris:
        for vi,vti,vni in tri:
            key=(vi,vti,vni)
            if key not in key_to_i:
                key_to_i[key]=len(positions)
                positions.append(verts[vi])
                normals_o.append(norms[vni] if (vni is not None and norms) else (0.,1.,0.))
                if vti is not None and uvs:
                    u,v=uvs[vti]; uvs_o.append((u,1-v))
                else:
                    uvs_o.append((0.5,0.5))
            indices.append(key_to_i[key])
    pos=np.array(positions,float); nrm=np.array(normals_o,float)
    lens=np.linalg.norm(nrm,axis=1,keepdims=True); lens[lens<1e-8]=1; nrm/=lens
    return pos,nrm,np.array(uvs_o,float),np.array(indices,np.uint32)

def recompute_normals(pos, idx):
    nrm=np.zeros_like(pos)
    for a,b,c in idx.reshape(-1,3):
        n=np.cross(pos[b]-pos[a], pos[c]-pos[a]); nrm[a]+=n; nrm[b]+=n; nrm[c]+=n
    lens=np.linalg.norm(nrm,axis=1,keepdims=True); lens[lens<1e-8]=1
    return nrm/lens

def fabric(kind, size=512):
    rng=np.random.default_rng(abs(hash(kind))%2**31)
    if kind=='cotton':
        base=np.array([0.92,0.90,0.88])
    elif kind=='denim':
        base=np.array([0.55,0.62,0.75])  # lighter so outfit tint reads
    elif kind=='leather':
        base=np.array([0.55,0.48,0.42])
    else:
        base=np.array([0.7,0.72,0.75])
    noise=rng.random((size,size,3))*0.08
    arr=(np.clip(base+noise,0,1)*255).astype(np.uint8)
    Image.fromarray(arr,'RGB').save(f'/tmp/{kind}.jpg','JPEG',quality=90)
    return Path(f'/tmp/{kind}.jpg').read_bytes()

def write_glb(path, name, pos, nrm, uv, idx, image_bytes, roughness):
    bin_chunks=[]; buffer_views=[]; accessors=[]; byte_offset=0
    def add(data, target=None):
        nonlocal byte_offset
        data=pad4(data); bv={'buffer':0,'byteOffset':byte_offset,'byteLength':len(data)}
        if target is not None: bv['target']=target
        buffer_views.append(bv); bin_chunks.append(data); i=len(buffer_views)-1; byte_offset+=len(data); return i
    img_bv=add(image_bytes)
    pos=pos.astype(np.float32); nrm=nrm.astype(np.float32); uv=uv.astype(np.float32); idx=idx.astype(np.uint32)
    pos_bv=add(pos.tobytes(),34962); pos_acc=len(accessors)
    accessors.append({'bufferView':pos_bv,'componentType':5126,'count':len(pos),'type':'VEC3','max':pos.max(0).tolist(),'min':pos.min(0).tolist()})
    n_bv=add(nrm.tobytes(),34962); n_acc=len(accessors)
    accessors.append({'bufferView':n_bv,'componentType':5126,'count':len(nrm),'type':'VEC3'})
    uv_bv=add(uv.tobytes(),34962); uv_acc=len(accessors)
    accessors.append({'bufferView':uv_bv,'componentType':5126,'count':len(uv),'type':'VEC2'})
    i_bv=add(idx.tobytes(),34963); i_acc=len(accessors)
    accessors.append({'bufferView':i_bv,'componentType':5125,'count':len(idx),'type':'SCALAR'})
    mat={'name':name+'_mat','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':roughness},'doubleSided':True}
    gltf={'asset':{'version':'2.0','generator':'tAIlor-garments-v2'},'buffers':[{'byteLength':0}],'bufferViews':buffer_views,'accessors':accessors,'materials':[mat],'textures':[{'source':0}],'images':[{'mimeType':'image/jpeg','bufferView':img_bv}],
          'meshes':[{'name':name,'primitives':[{'attributes':{'POSITION':pos_acc,'NORMAL':n_acc,'TEXCOORD_0':uv_acc},'indices':i_acc,'material':0,'mode':4}]}],
          'nodes':[{'name':name,'mesh':0}],'scenes':[{'nodes':[0]}],'scene':0}
    blob=b''.join(bin_chunks); gltf['buffers'][0]['byteLength']=len(pad4(blob))
    json_bytes=pad4(json.dumps(gltf,separators=(',',':')).encode(), b' '); blob=pad4(blob)
    total=12+8+len(json_bytes)+8+len(blob)
    Path(path).write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(json_bytes),b'JSON')+json_bytes+struct.pack('<I4s',len(blob),b'BIN\x00')+blob)
    print('Wrote', path, 'verts', len(pos), 'tris', len(idx)//3)

def inflate(bpos, bnrm, buv, bidx, mask, clearance):
    tris=bidx.reshape(-1,3)
    keep=[]
    for ti,(a,b,c) in enumerate(tris):
        coid=(bpos[a]+bpos[b]+bpos[c])/3
        if mask(coid, bnrm[a]): keep.append(ti)
    used=sorted({int(i) for ti in keep for i in tris[ti]})
    remap={old:i for i,old in enumerate(used)}
    pos0=bpos[used].copy(); nrm0=bnrm[used].copy(); uv0=buv[used].copy()
    idx=np.array([[remap[int(a)],remap[int(b)],remap[int(c)]] for ti in keep for a,b,c in [tris[ti]]],np.uint32).reshape(-1)
    # inflate + slight thickness shell (outward only)
    pos = pos0 + nrm0 * clearance
    # micro wrinkle
    wr = 0.002 * np.sin(pos0[:,1]*22 + pos0[:,0]*9)[:,None]
    pos = pos + nrm0 * wr
    nrm = recompute_normals(pos, idx)
    return pos, nrm, uv0, idx

bv,bn,bu,bf=load_obj(BODY_OBJ)
bpos,bnrm,buv,bidx=expand(bv,bn,bu,bf)
h=bpos[:,1].max()-bpos[:,1].min(); scale=1.72/h; ymin=bpos[:,1].min()*scale
bpos=bpos*scale; bpos[:,1]-=ymin
hip_y, neck_y = 0.92, 1.48

def top_mask(c,n):
    y,x=c[1],abs(c[0])
    if 0.95<=y<=neck_y and x<0.30: return True
    if 1.08<=y<=1.42 and 0.10<x<0.55: return True
    if 1.28<=y<=1.50 and x<0.45: return True
    return False
def bottom_mask(c,n):
    y,x=c[1],abs(c[0])
    return 0.05<=y<=1.02 and x<0.33
def shorts_mask(c,n):
    y,x=c[1],abs(c[0])
    return 0.72<=y<=1.02 and x<0.30
def shoe_mask(c,n):
    return c[1]<0.10 and abs(c[0])>0.05
def outer_mask(c,n):
    y,x=c[1],abs(c[0])
    if 0.88<=y<=neck_y+0.02 and x<0.34: return True
    if 0.95<=y<=1.45 and 0.08<x<0.62: return True
    return False

# Standard clearance — larger to avoid z-fight after normalize (~1.9x)
write_glb(OUT/'cloth-top.glb','Cloth_top', *inflate(bpos,bnrm,buv,bidx,top_mask,0.028), fabric('cotton'), 0.82)
write_glb(OUT/'cloth-bottom.glb','Cloth_bottom', *inflate(bpos,bnrm,buv,bidx,bottom_mask,0.030), fabric('denim'), 0.88)
write_glb(OUT/'makehuman-shorts.glb','Cloth_shorts', *inflate(bpos,bnrm,buv,bidx,shorts_mask,0.024), fabric('wool'), 0.88)
write_glb(OUT/'cloth-shoes.glb','Cloth_shoes', *inflate(bpos,bnrm,buv,bidx,shoe_mask,0.016), fabric('leather'), 0.55)
write_glb(OUT/'cloth-outerwear.glb','Cloth_outerwear', *inflate(bpos,bnrm,buv,bidx,outer_mask,0.055), fabric('wool'), 0.78)
print('done no-morph high-clearance')