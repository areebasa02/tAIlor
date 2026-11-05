/**
 * Synapp-inspired anatomical try-on mannequin.
 *
 * Approach: procedural custom LatheGeometry / scaled ellipsoids (NOT a
 * sphere/cylinder toy stack). Continuous anatomical silhouettes with flush
 * joint blends. Pearl MeshPhysicalMaterial. Free GLB skipped — we need
 * per-region materials for garment tinting without multi-material mesh surgery.
 */
import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  Component,
  type ReactNode,
} from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, ContactShadows } from "@react-three/drei"
import * as THREE from "three"

export type FitStyle = "fitted" | "standard" | "relaxed"

export interface MannequinGarment {
  type: string
  name: string
  color: string
}

export interface TryOnMannequin3DProps {
  items: MannequinGarment[]
  activeLayers: Record<string, boolean>
  fitStyle: FitStyle
  avatarLabel?: string
  className?: string
}

/** Synapp pearl-white base */
const PEARL = "#f4f2f0"
const STUDIO_BG = "#e4e2ea"

const FIT_SCALE: Record<
  FitStyle,
  { torsoX: number; torsoZ: number; hipX: number; hipZ: number; limb: number }
> = {
  fitted: { torsoX: 0.9, torsoZ: 0.92, hipX: 0.88, hipZ: 0.9, limb: 0.94 },
  standard: { torsoX: 1, torsoZ: 1, hipX: 1, hipZ: 1, limb: 1 },
  relaxed: { torsoX: 1.12, torsoZ: 1.1, hipX: 1.14, hipZ: 1.12, limb: 1.06 },
}

function findItem(items: MannequinGarment[], type: string) {
  return items.find((i) => i.type === type)
}

function PearlMaterial({
  color = PEARL,
  opacity = 1,
}: {
  color?: string
  opacity?: number
}) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={0.32}
      metalness={0.02}
      clearcoat={0.55}
      clearcoatRoughness={0.28}
      sheen={0.35}
      sheenRoughness={0.45}
      sheenColor="#ffffff"
      reflectivity={0.45}
      envMapIntensity={0.55}
      transparent={opacity < 1}
      opacity={opacity}
    />
  )
}

/** Build a Y-axis lathe from a radius-at-t profile (t: 0 bottom → 1 top). */
function useLatheProfile(
  height: number,
  radiusAt: (t: number) => number,
  segments = 28,
  radial = 24,
) {
  return useMemo(() => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      pts.push(new THREE.Vector2(Math.max(0.004, radiusAt(t)), (t - 0.5) * height))
    }
    const g = new THREE.LatheGeometry(pts, radial)
    g.computeVertexNormals()
    return g
  }, [height, radiusAt, segments, radial])
}

function LatheMesh({
  height,
  radiusAt,
  position,
  rotation,
  scale,
  color,
  opacity = 1,
  segments = 28,
}: {
  height: number
  radiusAt: (t: number) => number
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  color: string
  opacity?: number
  segments?: number
}) {
  const geo = useLatheProfile(height, radiusAt, segments)
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh
      geometry={geo}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
      receiveShadow
    >
      <PearlMaterial color={color} opacity={opacity} />
    </mesh>
  )
}

/** Limb spanning two points — continuous anatomical taper, flush ends */
function AnatomicalLimb({
  from,
  to,
  rNear,
  rMid,
  rFar,
  color,
}: {
  from: [number, number, number]
  to: [number, number, number]
  rNear: number
  rMid: number
  rFar: number
  color: string
}) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const dist = Math.hypot(dx, dy, dz)
  // Slight overshoot so ends fuse into neighboring volumes
  const height = dist * 1.08
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ]
  const dir = new THREE.Vector3(dx, dy, dz).normalize()
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir,
  )
  const e = new THREE.Euler().setFromQuaternion(quat)

  const radiusAt = useMemo(
    () => (t: number) => {
      // t=0 near `from`, t=1 near `to`
      const a = rNear
      const b = rMid
      const c = rFar
      // Smooth blend: near → mid bulge → far
      if (t < 0.45) {
        const u = t / 0.45
        const s = u * u * (3 - 2 * u)
        return a + (b - a) * s
      }
      const u = (t - 0.45) / 0.55
      const s = u * u * (3 - 2 * u)
      return b + (c - b) * s
    },
    [rNear, rMid, rFar],
  )

  return (
    <LatheMesh
      height={height}
      radiusAt={radiusAt}
      position={mid}
      rotation={[e.x, e.y, e.z]}
      color={color}
      segments={32}
    />
  )
}

function SoftJoint({
  position,
  radius,
  color,
}: {
  position: [number, number, number]
  radius: number
  color: string
}) {
  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[radius, 20, 18]} />
      <PearlMaterial color={color} />
    </mesh>
  )
}

function MittenHand({
  position,
  side,
  scale = 1,
  color,
}: {
  position: [number, number, number]
  side: 1 | -1
  scale?: number
  color: string
}) {
  return (
    <group position={position} scale={scale}>
      {/* Palm — soft rounded volume */}
      <mesh castShadow position={[0, -0.02, 0.01]} scale={[1, 1.15, 0.7]}>
        <sphereGeometry args={[0.038, 16, 14]} />
        <PearlMaterial color={color} />
      </mesh>
      {/* Fingers as one soft mitten lobe */}
      <mesh castShadow position={[0, -0.055, 0.015]} scale={[0.85, 1.1, 0.65]}>
        <sphereGeometry args={[0.032, 14, 12]} />
        <PearlMaterial color={color} />
      </mesh>
      {/* Thumb */}
      <mesh
        castShadow
        position={[side * 0.03, -0.025, 0.02]}
        scale={[0.55, 0.9, 0.55]}
        rotation={[0.2, 0, side * 0.55]}
      >
        <sphereGeometry args={[0.022, 12, 10]} />
        <PearlMaterial color={color} />
      </mesh>
    </group>
  )
}

function AnatomicalFoot({
  position,
  color,
}: {
  position: [number, number, number]
  color: string
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.02, 0.05]} scale={[0.9, 0.55, 1.35]}>
        <sphereGeometry args={[0.05, 16, 12]} />
        <PearlMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.028, -0.02]} scale={[0.85, 0.7, 0.9]}>
        <sphereGeometry args={[0.038, 14, 12]} />
        <PearlMaterial color={color} />
      </mesh>
    </group>
  )
}

function MannequinFigure({
  items,
  activeLayers,
  fitStyle,
}: {
  items: MannequinGarment[]
  activeLayers: Record<string, boolean>
  fitStyle: FitStyle
}) {
  const fit = FIT_SCALE[fitStyle]
  const top = findItem(items, "Top")
  const bottom = findItem(items, "Bottom")
  const shoes = findItem(items, "Shoes")
  const outer = findItem(items, "Outerwear")

  const showTop = Boolean(activeLayers.Top && top)
  const showBottom = Boolean(activeLayers.Bottom && bottom)
  const showShoes = Boolean(activeLayers.Shoes && shoes)
  const showOuter = Boolean(activeLayers.Outerwear && outer)

  // Body stays pearl; garments tint clothing regions only
  const torsoColor = showOuter
    ? outer!.color
    : showTop
      ? top!.color
      : PEARL
  const sleeveColor = showOuter
    ? outer!.color
    : showTop
      ? top!.color
      : PEARL
  const legColor = showBottom ? bottom!.color : PEARL
  const shoeColor = showShoes ? shoes!.color : PEARL
  const pelvisColor = showBottom ? bottom!.color : PEARL

  const ls = fit.limb

  // ~8 heads tall: head unit ≈ 0.215m → total ≈ 1.72m
  // Feet near y=0 after group lift

  const torsoRadius = useMemo(
    () => (t: number) => {
      // t=0 waist/bottom of chest, t=1 shoulders/neck base — V-taper
      // Built bottom→top in lathe: we'll place mesh so top is shoulders
      // Profile bottom (waist) → top (shoulders)
      const waist = 0.105
      const mid = 0.145
      const chest = 0.175
      const shoulder = 0.195
      const neck = 0.07
      if (t < 0.15) {
        const u = t / 0.15
        return waist + (mid - waist) * u
      }
      if (t < 0.55) {
        const u = (t - 0.15) / 0.4
        const s = u * u * (3 - 2 * u)
        return mid + (chest - mid) * s
      }
      if (t < 0.85) {
        const u = (t - 0.55) / 0.3
        return chest + (shoulder - chest) * u
      }
      const u = (t - 0.85) / 0.15
      return shoulder + (neck - shoulder) * u
    },
    [],
  )

  const abdomenRadius = useMemo(
    () => (t: number) => {
      // bottom (into pelvis) → top (under chest) — narrow waist
      const hip = 0.12
      const waist = 0.095
      const underChest = 0.12
      if (t < 0.4) {
        const u = t / 0.4
        return hip + (waist - hip) * u
      }
      const u = (t - 0.4) / 0.6
      const s = u * u * (3 - 2 * u)
      return waist + (underChest - waist) * s
    },
    [],
  )

  const pelvisRadius = useMemo(
    () => (t: number) => {
      const bottom = 0.08
      const mid = 0.135
      const top = 0.115
      if (t < 0.5) {
        const u = t / 0.5
        return bottom + (mid - bottom) * Math.sin(u * Math.PI * 0.5)
      }
      const u = (t - 0.5) / 0.5
      return mid + (top - mid) * u
    },
    [],
  )

  const neckRadius = useMemo(
    () => (t: number) => 0.04 + 0.012 * Math.sin(t * Math.PI),
    [],
  )

  const outerRadius = useMemo(
    () => (t: number) => torsoRadius(t) * 1.08 + 0.01,
    [torsoRadius],
  )

  return (
    // Sole contact ≈ y=0
    <group position={[0, 0.12, 0]}>
      {/* —— HEAD: smooth elongated oval, featureless —— */}
      <mesh position={[0, 1.55, 0]} scale={[0.92, 1.28, 0.88]} castShadow>
        <sphereGeometry args={[0.105, 32, 28]} />
        <PearlMaterial />
      </mesh>

      {/* Neck — continuous column into torso */}
      <LatheMesh
        height={0.1}
        radiusAt={neckRadius}
        position={[0, 1.4, 0]}
        color={PEARL}
        segments={20}
      />

      {/* —— TORSO: V-taper chest + waist (scaled for fit) —— */}
      <group scale={[fit.torsoX, 1, fit.torsoZ * 0.85]}>
        {/* Upper torso / chest */}
        <LatheMesh
          height={0.38}
          radiusAt={torsoRadius}
          position={[0, 1.18, 0]}
          color={torsoColor}
          segments={36}
        />
        {/* Soft pectoral definition (subtle, not oversized balls) */}
        <mesh
          position={[-0.055, 1.22, 0.055]}
          scale={[0.85, 0.7, 0.55]}
          castShadow
        >
          <sphereGeometry args={[0.07, 18, 14]} />
          <PearlMaterial color={torsoColor} />
        </mesh>
        <mesh
          position={[0.055, 1.22, 0.055]}
          scale={[0.85, 0.7, 0.55]}
          castShadow
        >
          <sphereGeometry args={[0.07, 18, 14]} />
          <PearlMaterial color={torsoColor} />
        </mesh>
        {/* Abdomen / waist */}
        <LatheMesh
          height={0.26}
          radiusAt={abdomenRadius}
          position={[0, 0.9, 0]}
          color={torsoColor}
          segments={32}
        />
      </group>

      {/* Outerwear shell — follows torso anatomy when layer on */}
      {showOuter && (
        <group scale={[fit.torsoX * 1.12, 1.02, fit.torsoZ * 0.95]}>
          <LatheMesh
            height={0.55}
            radiusAt={outerRadius}
            position={[0, 1.05, 0]}
            color={outer!.color}
            opacity={0.92}
            segments={36}
          />
        </group>
      )}

      {/* —— PELVIS —— */}
      <group scale={[fit.hipX, 1, fit.hipZ * 0.9]}>
        <LatheMesh
          height={0.2}
          radiusAt={pelvisRadius}
          position={[0, 0.72, 0]}
          scale={[1.15, 1, 1]}
          color={pelvisColor}
          segments={28}
        />
      </group>

      {/* —— ARMS —— */}
      {([-1, 1] as const).map((side) => {
        const shoulder: [number, number, number] = [
          side * 0.22 * fit.torsoX,
          1.32,
          0,
        ]
        const elbow: [number, number, number] = [
          side * 0.38 * ls,
          1.0,
          0.02,
        ]
        const wrist: [number, number, number] = [
          side * 0.42 * ls,
          0.68,
          0.03,
        ]
        const hand: [number, number, number] = [
          side * 0.43 * ls,
          0.58,
          0.04,
        ]
        return (
          <group key={`arm-${side}`}>
            {/* Shoulder blend into torso */}
            <SoftJoint
              position={shoulder}
              radius={0.055 * ls}
              color={sleeveColor}
            />
            <AnatomicalLimb
              from={shoulder}
              to={elbow}
              rNear={0.05 * ls}
              rMid={0.048 * ls}
              rFar={0.038 * ls}
              color={sleeveColor}
            />
            <SoftJoint position={elbow} radius={0.036 * ls} color={PEARL} />
            <AnatomicalLimb
              from={elbow}
              to={wrist}
              rNear={0.036 * ls}
              rMid={0.034 * ls}
              rFar={0.028 * ls}
              color={PEARL}
            />
            <SoftJoint position={wrist} radius={0.028 * ls} color={PEARL} />
            <MittenHand
              position={hand}
              side={side}
              scale={ls}
              color={PEARL}
            />
          </group>
        )
      })}

      {/* —— LEGS —— */}
      {([-1, 1] as const).map((side) => {
        const hip: [number, number, number] = [
          side * 0.09 * fit.hipX,
          0.66,
          0,
        ]
        const knee: [number, number, number] = [
          side * 0.095 * fit.hipX,
          0.32,
          0,
        ]
        const ankle: [number, number, number] = [
          side * 0.09 * fit.hipX,
          -0.02,
          0.01,
        ]
        return (
          <group key={`leg-${side}`}>
            <SoftJoint position={hip} radius={0.058 * ls} color={legColor} />
            <AnatomicalLimb
              from={hip}
              to={knee}
              rNear={0.07 * ls}
              rMid={0.065 * ls}
              rFar={0.048 * ls}
              color={legColor}
            />
            <SoftJoint position={knee} radius={0.042 * ls} color={legColor} />
            <AnatomicalLimb
              from={knee}
              to={ankle}
              rNear={0.045 * ls}
              rMid={0.042 * ls}
              rFar={0.032 * ls}
              color={legColor}
            />
            <SoftJoint position={ankle} radius={0.03 * ls} color={shoeColor} />
            <AnatomicalFoot
              position={[side * 0.09 * fit.hipX, -0.1, 0.02]}
              color={shoeColor}
            />
          </group>
        )
      })}
    </group>
  )
}

function Studio() {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[5, 64]} />
        <meshStandardMaterial
          color="#dcd8e4"
          roughness={0.85}
          metalness={0}
        />
      </mesh>
      {/* Soft concentric depth rings (Synapp-like) */}
      {[1.2, 2.0, 2.8, 3.6].map((r) => (
        <mesh
          key={r}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002, 0]}
        >
          <ringGeometry args={[r - 0.008, r + 0.008, 64]} />
          <meshBasicMaterial color="#c8c4d2" transparent opacity={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 1.8, -4]}>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial color={STUDIO_BG} roughness={1} metalness={0} />
      </mesh>
    </group>
  )
}

function SceneContent(props: {
  items: MannequinGarment[]
  activeLayers: Record<string, boolean>
  fitStyle: FitStyle
}) {
  return (
    <>
      <color attach="background" args={[STUDIO_BG]} />
      <fog attach="fog" args={[STUDIO_BG, 8, 18]} />

      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#ffffff", "#c8c4d4", 0.55]} />
      <directionalLight
        position={[2.5, 5, 3]}
        intensity={0.95}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={14}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={4}
        shadow-camera-bottom={-2}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-2.5, 2, 1]} intensity={0.35} color="#e8e4f5" />
      <directionalLight position={[0, 3, -2.5]} intensity={0.4} color="#ffffff" />

      <Studio />
      <MannequinFigure {...props} />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.28}
        scale={5}
        blur={2.8}
        far={3.5}
        color="#6a6578"
      />

      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.6}
        maxDistance={6.5}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0.78, 0]}
        makeDefault
      />
    </>
  )
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; onError: (msg: string) => void },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || "WebGL rendering failed")
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

function LoadingOverlay() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 pointer-events-none"
      style={{ background: `${STUDIO_BG}cc` }}
    >
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--sky)", borderTopColor: "transparent" }}
      />
      <p className="text-[11px] text-neutral-500 font-medium">
        Loading 3D mannequin…
      </p>
    </div>
  )
}

function ErrorOverlay({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 px-6 text-center"
      style={{ background: STUDIO_BG }}
    >
      <p className="text-sm font-bold text-neutral-800">3D preview unavailable</p>
      <p className="text-[11px] text-neutral-500 max-w-xs leading-relaxed">
        {message}. Your browser may lack WebGL, or the GPU context was lost.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 rounded-xl text-xs font-bold"
        style={{ background: "var(--sky)", color: "#0D0F18" }}
      >
        Retry 3D View
      </button>
    </div>
  )
}

function GarmentLegend({
  items,
  activeLayers,
}: {
  items: MannequinGarment[]
  activeLayers: Record<string, boolean>
}) {
  const visible = items.filter((i) => activeLayers[i.type])
  if (visible.length === 0) return null
  return (
    <div className="absolute top-10 right-3 z-20 flex flex-col gap-1.5 max-w-[42%] pointer-events-none">
      {visible.map((item) => (
        <div
          key={`${item.type}-${item.name}`}
          className="px-2 py-1 rounded-lg text-[10px] font-semibold leading-snug shadow-md"
          style={{
            background: "rgba(255,255,255,0.92)",
            color: "#1a1a1a",
            border: `1.5px solid ${item.color}`,
          }}
        >
          <span
            className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle shrink-0"
            style={{ background: item.color }}
          />
          <span className="align-middle">{item.name}</span>
        </div>
      ))}
    </div>
  )
}

export default function TryOnMannequin3D({
  items,
  activeLayers,
  fitStyle,
  avatarLabel,
  className,
}: TryOnMannequin3DProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("Could not initialize 3D canvas")
  const [canvasKey, setCanvasKey] = useState(0)

  const anyLayerVisible = useMemo(
    () => items.some((item) => activeLayers[item.type]),
    [items, activeLayers],
  )

  useEffect(() => {
    if (status !== "loading") return
    const t = window.setTimeout(() => {
      setStatus((s) => (s === "loading" ? "ready" : s))
    }, 4000)
    return () => window.clearTimeout(t)
  }, [status, canvasKey])

  const retry = () => {
    setErrorMsg("Could not initialize 3D canvas")
    setStatus("loading")
    setCanvasKey((k) => k + 1)
  }

  return (
    <div className={`relative w-full h-full min-h-[360px] ${className ?? ""}`}>
      {status === "loading" && <LoadingOverlay />}
      {status === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 px-6 text-center"
          style={{ background: STUDIO_BG }}
        >
          <ErrorOverlay message={errorMsg} onRetry={retry} />
        </div>
      )}
      {status !== "error" && items.length > 0 && !anyLayerVisible && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-xl text-[10px] font-semibold shadow-sm"
          style={{ background: "rgba(255,255,255,0.92)", color: "#555" }}
        >
          All layers hidden — toggle a garment layer to show
        </div>
      )}

      {avatarLabel && status !== "error" && (
        <div
          className="absolute top-3 left-3 z-10 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider shadow-sm"
          style={{ background: "var(--magenta)", color: "#fff" }}
        >
          {avatarLabel}
        </div>
      )}

      {status !== "error" && (
        <GarmentLegend items={items} activeLayers={activeLayers} />
      )}

      {status !== "error" && (
        <CanvasErrorBoundary
          key={canvasKey}
          onError={(msg) => {
            setErrorMsg(msg)
            setStatus("error")
          }}
        >
          <Canvas
            shadows
            dpr={[1, 1.75]}
            frameloop="always"
            camera={{
              position: [1.4, 1.1, 3.7],
              fov: 32,
              near: 0.1,
              far: 40,
            }}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: "high-performance",
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(STUDIO_BG)
              gl.toneMapping = THREE.ACESFilmicToneMapping
              gl.toneMappingExposure = 1.05
              setStatus("ready")
            }}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 360,
              touchAction: "none",
              background: STUDIO_BG,
            }}
            fallback={<LoadingOverlay />}
          >
            <Suspense fallback={null}>
              <SceneContent
                items={items}
                activeLayers={activeLayers}
                fitStyle={fitStyle}
              />
            </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      )}

      <p className="absolute bottom-12 left-0 right-0 text-center text-[9px] text-neutral-400 pointer-events-none">
        Drag to orbit · Pinch/scroll to zoom
      </p>
    </div>
  )
}
