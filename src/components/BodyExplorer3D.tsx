/**
 * Interactive 3D body explorer — Surface (MakeHuman-style) + Muscles (Z-Anatomy).
 * Implements body-explorer-spec.md §§4–11 + fitting-room garment tinting.
 */
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Canvas, useFrame, useThree, invalidate } from "@react-three/fiber"
import {
  Bvh,
  ContactShadows,
  OrbitControls,
  useGLTF,
  useProgress,
} from "@react-three/drei"
import { useReducedMotion } from "motion/react"
import * as THREE from "three"
import {
  REGION_GROUPS,
  assignBodyRegions,
  isRearRegion,
  landmarksFor,
  regionIndex,
  type BodyViewMode,
  type Landmark,
  type RegionId,
} from "../lib/bodyRegions"
import {
  BODY_STENCIL_BOTTOM_FACES,
  BODY_STENCIL_FACE_COUNT,
  BODY_STENCIL_TOP_FACES,
} from "../lib/bodyClothStencil"

export type FitStyle = "fitted" | "standard" | "relaxed"

export interface ExplorerGarment {
  type: string
  name: string
  color: string
}

export interface BodyExplorer3DProps {
  items?: ExplorerGarment[]
  activeLayers?: Record<string, boolean>
  fitStyle?: FitStyle
  avatarLabel?: string
  className?: string
  darkTheme?: boolean
}

const SURFACE_URLS = {
  body: "/models/makehuman-body.glb?v=upgrade1b",
  hair: "/models/makehuman-hair.glb?v=upgrade1b",
  shorts: "/models/makehuman-shorts.glb",
  // MHCLO tee/trousers + existing meter-frame shoes/outerwear (all loaded; layers gate visibility)
  tshirt: "/models/cloth-tshirt.glb?v=upgrade2",
  trousers: "/models/cloth-trousers.glb?v=upgrade2",
  shoes: "/models/cloth-shoes.glb?v=upgrade2",
  outerwear: "/models/cloth-outerwear.glb",
} as const

/**
 * Drop body triangles under active garments.
 * Combines MHCLO delete_verts face lists with a Y-band geometric mask so thighs /
 * seat / torso under cloth cannot punch through even when MHCLO coverage is thin.
 */
function applyBodyClothStencil(
  root: THREE.Object3D,
  topOn: boolean,
  bottomOn: boolean,
) {
  if (!topOn && !bottomOn) return
  const mhclo = new Set<number>()
  if (topOn) for (const i of BODY_STENCIL_TOP_FACES) mhclo.add(i)
  if (bottomOn) for (const i of BODY_STENCIL_BOTTOM_FACES) mhclo.add(i)

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    if (mesh.name.toLowerCase() !== "body") return
    const geo = mesh.geometry.clone()
    const index = geo.getIndex()
    const pos = geo.getAttribute("position")
    if (!index || !pos) return
    if (index.count !== BODY_STENCIL_FACE_COUNT * 3) {
      console.warn(
        `[BodyExplorer] stencil skip: index=${index.count} expected=${BODY_STENCIL_FACE_COUNT * 3}`,
      )
      return
    }

    const drop = new Set(mhclo)
    const faceCount = index.count / 3
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    for (let f = 0; f < faceCount; f++) {
      if (drop.has(f)) continue
      const o = f * 3
      const ia = index.getX(o)
      const ib = index.getX(o + 1)
      const ic = index.getX(o + 2)
      a.fromBufferAttribute(pos, ia)
      b.fromBufferAttribute(pos, ib)
      c.fromBufferAttribute(pos, ic)
      const cy = (a.y + b.y + c.y) / 3
      const cx = (a.x + b.x + c.x) / 3
      const cz = (a.z + b.z + c.z) / 3
      const absX = Math.abs(cx)
      // Nuclear pants Y-band: hide body under trousers (seat/hips/thighs).
      // Arms in T-pose sit at |x|≳0.38; keep absX gate under that.
      if (bottomOn && cy > 0.06 && cy < 1.06 && absX < 0.34) drop.add(f)
      // Midriff under tee×pants overlap — kill residual waist punch-through
      if (bottomOn && topOn && cy > 0.92 && cy < 1.12 && absX < 0.28) drop.add(f)
      // Tee: torso-only (absX tight) so outstretched arms aren't deleted; keep neck hole
      const neckHole = cy > 1.38 && absX < 0.09 && Math.abs(cz) < 0.08
      if (topOn && cy > 0.94 && cy < 1.38 && absX < 0.22 && !neckHole) drop.add(f)
    }

    const src = index.array
    const kept: number[] = []
    for (let f = 0; f < faceCount; f++) {
      if (drop.has(f)) continue
      const o = f * 3
      kept.push(src[o] as number, src[o + 1] as number, src[o + 2] as number)
    }
    geo.setIndex(kept)
    geo.computeVertexNormals()
    mesh.geometry = geo
    console.info(
      `[BodyExplorer] stencil removed ${drop.size} body faces (kept ${kept.length / 3})`,
    )
  })
}

const MUSCLES_URL = "/models/z-anatomy-muscles.glb"

/** Body-aware ease morphs on Cloth_* (fitted=w0, relaxed=w1). Cap relaxed. */
function applyGarmentFitMorphs(root: THREE.Object3D, fit: FitStyle) {
  const w0 = fit === "fitted" ? 1 : 0
  const w1 = fit === "relaxed" ? 0.68 : 0
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.name.startsWith("Cloth_")) return
    const infl = mesh.morphTargetInfluences
    if (!infl || infl.length < 2) return
    infl[0] = w0
    infl[1] = w1
  })
}

type UniformBag = {
  selected: { value: number }
  hovered: { value: number }
  strength: { value: number }
}

function patchHighlightMaterial(
  mat: THREE.MeshStandardMaterial,
  uniforms: UniformBag,
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.bodySelected = uniforms.selected
    shader.uniforms.bodyHovered = uniforms.hovered
    shader.uniforms.bodyStrength = uniforms.strength
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float bodyRegion;
varying float vBodyRegion;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vBodyRegion = bodyRegion;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vBodyRegion;
uniform float bodySelected;
uniform float bodyHovered;
uniform float bodyStrength;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float bodyIsSelected = 1.0 - step(0.1, abs(vBodyRegion - bodySelected));
float bodyIsHovered = 1.0 - step(0.1, abs(vBodyRegion - bodyHovered));
float bodyTint = max(bodyIsSelected * 0.70, bodyIsHovered * 0.40);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.44, 0.25, 0.86), bodyTint);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.30, 0.13, 0.62) * max(bodyIsSelected * 0.36, bodyIsHovered * 0.18) * bodyStrength;`,
      )
  }
  mat.customProgramCacheKey = () => "body-regions-v1"
}

function normalizeFigure(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const height = size.y || 1
  const scale = 3.3 / height
  root.scale.setScalar(scale)
  root.position.set(
    -center.x * scale,
    -box.min.y * scale - 1.7,
    -center.z * scale,
  )
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry?.dispose()
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const m of mats) m?.dispose?.()
    }
  })
}

function findItem(items: ExplorerGarment[], type: string) {
  return items.find((i) => i.type === type)
}

/** Keep shoe/pant colors readable against skin (avoids "missing" look). */
function contrastAwayFromSkin(hex: string, minDist = 0.28): string {
  const c = new THREE.Color(hex)
  const skin = new THREE.Color("#e8c4a8")
  const dist = Math.hypot(c.r - skin.r, c.g - skin.g, c.b - skin.b)
  if (dist >= minDist) return hex
  c.offsetHSL(0, 0.05, -0.28)
  return `#${c.getHexString()}`
}

function prepareMeshes(
  root: THREE.Object3D,
  mode: BodyViewMode,
  landmarks: Landmark[],
  uniforms: UniformBag,
  items: ExplorerGarment[],
  activeLayers: Record<string, boolean>,
  fitStyle: FitStyle,
) {
  const prepared: THREE.Object3D[] = []
  root.updateMatrixWorld(true)

  const bottom = findItem(items, "Bottom")
  const top = findItem(items, "Top")
  const shoes = findItem(items, "Shoes")
  const outer = findItem(items, "Outerwear")
  const bottomOn = Boolean(bottom) && activeLayers.Bottom !== false
  const shoesOn = Boolean(shoes) && activeLayers.Shoes !== false
  const outerOn = Boolean(outer) && activeLayers.Outerwear !== false
  // Top hides under active outerwear so layers match what you see
  const topOn =
    Boolean(top) && activeLayers.Top !== false && !outerOn

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    const srcMat = mesh.material
    const base =
      (Array.isArray(srcMat) ? srcMat[0] : srcMat) ||
      new THREE.MeshStandardMaterial()
    const mat =
      base instanceof THREE.MeshStandardMaterial
        ? base.clone()
        : new THREE.MeshStandardMaterial({ color: 0xffffff })

    if (mode === "muscles") {
      const ctx = (mesh.userData?.contextType as string) || ""
      if (ctx === "bone") mat.color.set("#e8dcc4")
      else if (ctx === "connective") mat.color.set("#d4b9ac")
      else mat.color.set("#b35e59")
      mat.roughness = 0.7
      mat.map = null
    } else if (mesh.name.startsWith("Cloth_")) {
      const n = mesh.name.toLowerCase()
      mat.metalness = 0
      mat.side = THREE.DoubleSide
      mat.transparent = false
      mat.opacity = 1
      mat.polygonOffset = true
      mat.polygonOffsetFactor = -2
      mat.polygonOffsetUnits = -2
      mat.depthWrite = true
      // Ease morphs: garment-local only (never whole-figure scale).
      if (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length >= 2) {
        mesh.morphTargetInfluences[0] = fitStyle === "fitted" ? 1 : 0
        mesh.morphTargetInfluences[1] = fitStyle === "relaxed" ? 0.68 : 0
      }

      if (n.includes("shorts")) {
        mesh.visible = !bottomOn
        mat.color.set("#625482")
        mat.roughness = 0.9
        mat.metalness = 0
        mesh.renderOrder = 1
      } else if (
        n.includes("tshirt") ||
        n.includes("top") ||
        (n.includes("shirt") && !n.includes("short"))
      ) {
        mesh.visible = topOn
        if (top) mat.color.set(top.color)
        else mat.color.set("#f0f0f4")
        // Cotton tee — soft diffuse
        mat.roughness = 0.87
        mat.metalness = 0
        mat.envMapIntensity = 0.3
        // Tee hem wins the thin waist overlap (must sit over pants, not under)
        mat.polygonOffsetFactor = -4
        mat.polygonOffsetUnits = -4
        mesh.renderOrder = 4
      } else if (
        n.includes("trouser") ||
        n.includes("pant") ||
        n.includes("bottom")
      ) {
        mesh.visible = bottomOn
        if (bottom) mat.color.set(contrastAwayFromSkin(bottom.color, 0.4))
        else mat.color.set("#4a5a78")
        // DoubleSide: MHCLO pants are thin open shells; FrontSide punches white
        // holes through seat/crotch where normals face inward.
        mat.side = THREE.DoubleSide
        // Woven fabric
        mat.roughness = 0.91
        mat.metalness = 0
        mat.envMapIntensity = 0.22
        // Weaker bias than tee so waistband stays under shirt hem
        mat.polygonOffsetFactor = -1
        mat.polygonOffsetUnits = -1
        mesh.renderOrder = 2
      } else if (n.includes("shoe")) {
        mesh.visible = shoesOn
        // Foot-wrap shoe meshes read as bare feet when tint ≈ skin — force leather contrast
        if (shoes) mat.color.set(contrastAwayFromSkin(shoes.color, 0.4))
        else mat.color.set("#3a2a22")
        mat.color.offsetHSL(0.02, 0.12, -0.12)
        mat.roughness = 0.52
        mat.metalness = 0.05
        mat.envMapIntensity = 0.35
        mesh.renderOrder = 5
      } else if (n.includes("outer") || n.includes("coat")) {
        mesh.visible = outerOn
        if (outer) mat.color.set(outer.color)
        else mat.color.set("#2a4a4a")
        mat.roughness = 0.8
        mat.metalness = 0
        mesh.renderOrder = 5
      } else {
        // Unknown Cloth_* — hide rather than silent wrong layer
        mesh.visible = false
        console.warn(`[BodyExplorer] Unmapped cloth mesh hidden: ${mesh.name}`)
      }
    } else {
      mat.transparent = false
      mat.opacity = 1
      mat.side = THREE.FrontSide
      mat.depthWrite = true
      if (mesh.name.toLowerCase().includes("hair")) {
        // Fitted short04 + diffuse — soft fiber, MASK fringe
        mat.transparent = false
        mat.alphaTest = 0.35
        mat.color.set("#2c2420")
        mat.roughness = 0.95
        mat.metalness = 0
        mesh.renderOrder = 1
      } else {
        // Skin — keep albedo map if present; soft matte (hands/face/shoulders)
        if (!mat.map) mat.color.set("#e8c4a8")
        else mat.color.set("#ffffff")
        mat.roughness = 0.76
        mat.metalness = 0
        mat.envMapIntensity = 0.35
      }
    }

    if (mat.metalness == null) mat.metalness = 0
    if (mat.roughness == null) mat.roughness = 0.68
    // Region highlight is body-only — keep cloth materials simple (morph + DoubleSide).
    if (!mesh.name.startsWith("Cloth_")) {
      patchHighlightMaterial(mat, uniforms)
      assignBodyRegions(mesh, landmarks)
    }
    mesh.material = mat
    prepared.push(mesh)
  })

  return prepared
}

function FigureRoot({
  mode,
  landmarks,
  uniforms,
  items,
  activeLayers,
  fitStyle,
  facing,
  reducedMotion,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  mode: BodyViewMode
  landmarks: Landmark[]
  uniforms: UniformBag
  items: ExplorerGarment[]
  activeLayers: Record<string, boolean>
  fitStyle: FitStyle
  facing: "front" | "back"
  reducedMotion: boolean
  selected: RegionId | null
  hovered: RegionId | null
  onHover: (id: RegionId | null) => void
  onSelect: (id: RegionId) => void
}) {
  const parentRef = useRef<THREE.Group>(null)
  const pointerDown = useRef<{ id: number; x: number; y: number } | null>(null)

  const surfaceBody = useGLTF(SURFACE_URLS.body)
  const surfaceHair = useGLTF(SURFACE_URLS.hair)
  const surfaceShorts = useGLTF(SURFACE_URLS.shorts)
  const clothTshirt = useGLTF(SURFACE_URLS.tshirt)
  const clothTrousers = useGLTF(SURFACE_URLS.trousers)
  const clothShoes = useGLTF(SURFACE_URLS.shoes)
  const clothOuterwear = useGLTF(SURFACE_URLS.outerwear)
  const muscles = useGLTF(MUSCLES_URL)

  const figure = useMemo(() => {
    const root = new THREE.Group()
    if (mode === "surface") {
      // Body + hair + Cloth_* share one meter frame, then normalize together.
      // Punch-through under cloth is handled by MHCLO face stencil (not XZ body squash).
      root.add(surfaceBody.scene.clone(true))
      // Hair is MHCLO-fitted to base.obj (same meter frame) — do not XZ-scale
      // (that stretched into a neck slab and floated strands).
      const hair = surfaceHair.scene.clone(true)
      root.add(hair)
      root.add(surfaceShorts.scene.clone(true))
      root.add(clothTshirt.scene.clone(true))
      root.add(clothTrousers.scene.clone(true))
      // Foot-wrap shoes: slight scale/lift so they read as footwear vs bare feet.
      const shoesRoot = clothShoes.scene.clone(true)
      shoesRoot.scale.set(1.12, 1.1, 1.18)
      shoesRoot.position.y += 0.012
      root.add(shoesRoot)
      root.add(clothOuterwear.scene.clone(true))
    } else {
      root.add(muscles.scene.clone(true))
    }
    normalizeFigure(root)
    const wrap = new THREE.Group()
    wrap.add(root)
    wrap.updateMatrixWorld(true)

    const bottom = findItem(items, "Bottom")
    const top = findItem(items, "Top")
    const outer = findItem(items, "Outerwear")
    const bottomOn = Boolean(bottom) && activeLayers.Bottom !== false
    const outerOn = Boolean(outer) && activeLayers.Outerwear !== false
    const topOn =
      Boolean(top) && activeLayers.Top !== false && !outerOn
    if (mode === "surface") {
      applyBodyClothStencil(wrap, topOn, bottomOn)
    }

    prepareMeshes(
      wrap,
      mode,
      landmarks,
      uniforms,
      items,
      activeLayers,
      fitStyle,
    )
    applyGarmentFitMorphs(wrap, fitStyle)
    return wrap
  }, [
    mode,
    landmarks,
    uniforms,
    items,
    activeLayers,
    fitStyle,
    surfaceBody,
    surfaceHair,
    surfaceShorts,
    clothTshirt,
    clothTrousers,
    clothShoes,
    clothOuterwear,
    muscles,
  ])

  useEffect(() => {
    return () => disposeObject(figure)
  }, [figure])

  useEffect(() => {
    applyGarmentFitMorphs(figure, fitStyle)
    invalidate()
  }, [figure, fitStyle])

  useEffect(() => {
    uniforms.selected.value = regionIndex(landmarks, selected)
    uniforms.hovered.value = regionIndex(landmarks, hovered)
    invalidate()
  }, [selected, hovered, landmarks, uniforms])

  useFrame((_, delta) => {
    const g = parentRef.current
    if (!g) return
    const target = facing === "back" ? Math.PI : 0
    if (reducedMotion) {
      if (g.rotation.y !== target) {
        g.rotation.y = target
        invalidate()
      }
      return
    }
    const remaining = target - g.rotation.y
    if (Math.abs(remaining) < 0.001) {
      if (g.rotation.y !== target) {
        g.rotation.y = target
        invalidate()
      }
      return
    }
    g.rotation.y += remaining * (1 - Math.exp(-Math.min(delta, 0.05) * 7))
    invalidate()
  })

  const regionFromEvent = (e: {
    faceIndex?: number | null
    face?: { a: number; b: number; c: number } | null
    object: THREE.Object3D
  }): RegionId | null => {
    const mesh = e.object as THREE.Mesh
    const geo = mesh.geometry
    const attr = geo?.getAttribute("bodyRegion") as
      | THREE.BufferAttribute
      | undefined
    if (!attr || e.faceIndex == null) return null
    // Indexed: bodyRegion is per-vertex — read via face vertex index
    let vert = e.face?.a
    if (vert == null && geo.index) {
      vert = geo.index.getX(e.faceIndex * 3)
    }
    if (vert == null) vert = e.faceIndex * 3
    const idx = attr.getX(vert)
    const lm = landmarks[Math.round(idx)]
    return lm?.id ?? null
  }

  return (
    <group ref={parentRef}>
      <Bvh firstHitOnly indirect>
        <primitive
          object={figure}
          onPointerMove={(e: THREE.Event & {
            stopPropagation: () => void
            faceIndex?: number
            object: THREE.Object3D
          }) => {
            e.stopPropagation()
            onHover(regionFromEvent(e))
            invalidate()
          }}
          onPointerOut={(e: { stopPropagation: () => void }) => {
            e.stopPropagation()
            onHover(null)
            invalidate()
          }}
          onPointerDown={(e: {
            stopPropagation: () => void
            pointerId: number
            clientX: number
            clientY: number
          }) => {
            e.stopPropagation()
            pointerDown.current = {
              id: e.pointerId,
              x: e.clientX,
              y: e.clientY,
            }
          }}
          onPointerUp={(e: THREE.Event & {
            stopPropagation: () => void
            pointerId: number
            clientX: number
            clientY: number
            faceIndex?: number
            object: THREE.Object3D
          }) => {
            e.stopPropagation()
            const down = pointerDown.current
            pointerDown.current = null
            if (!down || down.id !== e.pointerId) return
            const dx = e.clientX - down.x
            const dy = e.clientY - down.y
            if (dx * dx + dy * dy >= 25) return
            const id = regionFromEvent(e)
            if (id) onSelect(id)
          }}
        />
      </Bvh>
    </group>
  )
}

function Lights({ mode }: { mode: BodyViewMode }) {
  const s = mode === "surface"
  // Soft studio fill — enough to read drape without plastic hotspots
  return (
    <>
      <ambientLight intensity={s ? 0.52 : 1.25} />
      <hemisphereLight
        args={["#f4efe6", "#7a8494", s ? 0.68 : 1.4]}
      />
      <directionalLight
        position={[2.5, 3.5, 4.2]}
        intensity={s ? 1.2 : 2.0}
        color="#fff7f0"
      />
      <directionalLight
        position={[-3.2, 1.8, 1.2]}
        intensity={s ? 0.42 : 0.8}
        color="#d8e2f0"
      />
      <directionalLight
        position={[0.5, 2.0, -3.4]}
        intensity={s ? 0.38 : 1.2}
        color="#eef2ff"
      />
    </>
  )
}

function ControlsSync({
  zoom,
  facing,
  controlsRef,
}: {
  zoom: number
  facing: "front" | "back"
  controlsRef: React.MutableRefObject<any>
}) {
  const { camera } = useThree()
  useEffect(() => {
    const dist = 5 / zoom
    camera.position.set(0, 0.1, dist)
    camera.updateProjectionMatrix()
    controlsRef.current?.reset?.()
    invalidate()
  }, [zoom, facing, camera, controlsRef])
  return null
}

function LoadingOverlay() {
  const { progress, active } = useProgress()
  if (!active) return null
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#ebe8f0]/90">
      <p className="text-[11px] font-semibold text-neutral-600">
        Loading body models… {Math.round(progress)}%
      </p>
    </div>
  )
}

class ViewErrorBoundary extends Component<
  { children: ReactNode; resetKey: string; onRetry: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-xs text-neutral-700">
            WebGL preview failed to load.
          </p>
          <button
            type="button"
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-[11px] font-bold text-white"
            onClick={this.props.onRetry}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-black/10 bg-white/80 p-0.5 shadow-sm backdrop-blur">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-colors ${
            value === o.id
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function BodyExplorer3D({
  items = [],
  activeLayers = { Top: true, Bottom: true, Shoes: true, Outerwear: true },
  fitStyle = "standard",
  className = "",
  darkTheme = false,
}: BodyExplorer3DProps) {
  const [mode, setMode] = useState<BodyViewMode>("surface")
  const [facing, setFacing] = useState<"front" | "back">("front")
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState<RegionId | null>(null)
  const [hovered, setHovered] = useState<RegionId | null>(null)
  const [boundaryKey, setBoundaryKey] = useState(0)
  const [licensesOpen, setLicensesOpen] = useState(false)
  const reducedMotion = useReducedMotion() ?? false
  const controlsRef = useRef<any>(null)

  const landmarks = useMemo(() => landmarksFor(mode), [mode])
  const uniforms = useMemo<UniformBag>(
    () => ({
      selected: { value: -1 },
      hovered: { value: -1 },
      strength: { value: darkTheme ? 1.35 : 1 },
    }),
    [darkTheme],
  )

  useEffect(() => {
    uniforms.strength.value = darkTheme ? 1.35 : 1
    invalidate()
  }, [darkTheme, uniforms])

  const selectedLm = landmarks.find((l) => l.id === selected)
  const hoveredLm = landmarks.find((l) => l.id === hovered)
  const display = selectedLm ?? hoveredLm
  const displayKind = selectedLm ? "SELECTED" : hoveredLm ? "PREVIEWING" : null

  const onSelect = (id: RegionId) => {
    setSelected(id)
    // Choosing a rear region from list switches to back; click on model does not —
    // list/select handled separately below.
  }

  const onSelectFromList = (id: RegionId) => {
    setSelected(id)
    if (isRearRegion(id, landmarks)) setFacing("back")
    else setFacing("front")
  }

  return (
    <div className={`relative h-full w-full ${className}`}>
      <LoadingOverlay />

      {/* Top overlay */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <Segmented
            value={mode}
            onChange={(v) => {
              setMode(v)
              setSelected(null)
              setHovered(null)
              setFacing("front")
              setBoundaryKey((k) => k + 1)
            }}
            options={[
              { id: "surface" as const, label: "Surface" },
              { id: "muscles" as const, label: "Muscles" },
            ]}
          />
          <Segmented
            value={facing}
            onChange={setFacing}
            options={[
              { id: "front" as const, label: "Front" },
              { id: "back" as const, label: "Back" },
            ]}
          />
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            className="rounded-lg border border-black/10 bg-white/85 px-2 py-1 text-xs font-bold text-neutral-700 shadow-sm"
            onClick={() => setZoom((z) => Math.max(0.85, +(z - 0.1).toFixed(2)))}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Reset view"
            className="rounded-lg border border-black/10 bg-white/85 px-2 py-1 text-[10px] font-bold text-neutral-700 shadow-sm"
            onClick={() => {
              setZoom(1)
              setFacing("front")
              controlsRef.current?.reset?.()
              invalidate()
            }}
          >
            Reset
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            className="rounded-lg border border-black/10 bg-white/85 px-2 py-1 text-xs font-bold text-neutral-700 shadow-sm"
            onClick={() => setZoom((z) => Math.min(1.25, +(z + 0.1).toFixed(2)))}
          >
            +
          </button>
        </div>
      </div>

      {/* Selection badge */}
      <div className="pointer-events-none absolute left-3 top-[4.5rem] z-20">
        {displayKind && display ? (
          <div className="rounded-xl border border-violet-300/60 bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur">
            <p className="text-[9px] font-bold uppercase tracking-wider text-violet-700">
              {displayKind}
            </p>
            <p className="text-xs font-bold text-neutral-900">{display.label}</p>
          </div>
        ) : (
          <p className="max-w-[14rem] text-[10px] text-neutral-600">
            37 areas. Hover to preview. Click or tap to select.
          </p>
        )}
      </div>

      <ViewErrorBoundary
        resetKey={`${mode}-${boundaryKey}`}
        onRetry={() => setBoundaryKey((k) => k + 1)}
      >
        <Canvas
          className="h-full w-full touch-none"
          style={{ background: "transparent" }}
          frameloop="demand"
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
          camera={{ position: [0, 0.1, 5], fov: 43 }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
          }}
          fallback={
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-neutral-600">
              WebGL is unavailable in this browser.
            </div>
          }
        >
          <Suspense fallback={null}>
            <Lights mode={mode} />
            <FigureRoot
              key={`${mode}-${boundaryKey}`}
              mode={mode}
              landmarks={landmarks}
              uniforms={uniforms}
              items={items}
              activeLayers={activeLayers}
              fitStyle={fitStyle}
              facing={facing}
              reducedMotion={reducedMotion}
              selected={selected}
              hovered={hovered}
              onHover={setHovered}
              onSelect={onSelect}
            />
            <ContactShadows
              position={[0, -1.73, 0]}
              opacity={0.3}
              scale={6}
              blur={3.2}
              far={4.2}
              resolution={384}
              color="#5a5568"
              frames={1}
            />
            <OrbitControls
              ref={controlsRef}
              makeDefault
              enablePan={false}
              enableZoom={false}
              minPolarAngle={Math.PI / 2 - 0.35}
              maxPolarAngle={Math.PI / 2 + 0.35}
              target={[0, -0.05, 0]}
              minDistance={5 / zoom}
              maxDistance={5 / zoom}
            />
            <ControlsSync zoom={zoom} facing={facing} controlsRef={controlsRef} />
          </Suspense>
        </Canvas>
      </ViewErrorBoundary>

      {/* Bottom UI */}
      <div className="absolute bottom-10 left-3 right-3 z-20 flex flex-col gap-1.5 sm:bottom-11">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            Region
          </span>
          <select
            className="rounded-xl border border-black/10 bg-white/90 px-2 py-1.5 text-[11px] font-medium text-neutral-800 shadow-sm"
            value={selected ?? ""}
            onChange={(e) => {
              const v = e.target.value as RegionId
              if (v) onSelectFromList(v)
              else setSelected(null)
            }}
          >
            <option value="">None selected</option>
            {REGION_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {landmarks
                  .filter((l) => l.group === g)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="text-[9px] leading-snug text-neutral-500">
          Left/right = person&apos;s own body. Illustrative, not clinical.
          Garments use body-conforming meshes; fit = {fitStyle}.
        </p>
        <button
          type="button"
          className="self-start text-[9px] font-semibold text-violet-700 underline-offset-2 hover:underline"
          onClick={() => setLicensesOpen((o) => !o)}
        >
          {licensesOpen ? "Hide" : "Model sources & licenses"}
        </button>
        {licensesOpen && (
          <div className="max-h-28 overflow-y-auto rounded-xl border border-black/10 bg-white/95 p-2 text-[9px] leading-relaxed text-neutral-600 shadow-sm">
            <p>
              Z-Anatomy, the libre 3D atlas of anatomy, CC BY-SA 4.0; BodyParts3D,
              The Database Center for Life Science, CC BY-SA 2.1 Japan; mobile
              adaptation by Fit Mit With, CC BY-SA 4.0.
            </p>
            <p className="mt-1">
              Surface figure: CC0-style MakeHuman substitute (exact MakeHuman
              1.2/1.3 export unavailable in build VM). See{" "}
              <code className="text-[8px]">/models/MAKEHUMAN-SUBSTITUTE-README.txt</code>{" "}
              and <code className="text-[8px]">/models/ATTRIBUTION.txt</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

useGLTF.preload(SURFACE_URLS.body)
useGLTF.preload(SURFACE_URLS.hair)
useGLTF.preload(SURFACE_URLS.shorts)
useGLTF.preload(SURFACE_URLS.tshirt)
useGLTF.preload(SURFACE_URLS.trousers)
useGLTF.preload(SURFACE_URLS.shoes)
useGLTF.preload(SURFACE_URLS.outerwear)
useGLTF.preload(MUSCLES_URL)
