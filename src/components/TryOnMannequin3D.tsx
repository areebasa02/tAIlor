/**
 * Synapp-inspired anatomical try-on mannequin.
 *
 * Approach: procedural LatheGeometry with continuous anatomical profiles
 * (not a toy sphere/cylinder stack). Pearl MeshPhysicalMaterial.
 * Skipped free GLB — need per-region materials for garment tinting without
 * multi-material mesh surgery or large downloaded assets.
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

const PEARL = "#f7f5f3"
const STUDIO_BG = "#e6e4ec"

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
      roughness={0.28}
      metalness={0.015}
      clearcoat={0.65}
      clearcoatRoughness={0.22}
      sheen={0.4}
      sheenRoughness={0.4}
      sheenColor="#ffffff"
      reflectivity={0.5}
      envMapIntensity={0.6}
      transparent={opacity < 1}
      opacity={opacity}
    />
  )
}

function useLathe(
  height: number,
  radiusAt: (t: number) => number,
  segments = 36,
  radial = 32,
) {
  return useMemo(() => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      pts.push(
        new THREE.Vector2(Math.max(0.003, radiusAt(t)), (t - 0.5) * height),
      )
    }
    const g = new THREE.LatheGeometry(pts, radial)
    g.computeVertexNormals()
    return g
  }, [height, radiusAt, segments, radial])
}

function LathePart({
  height,
  radiusAt,
  position,
  rotation,
  scale,
  color,
  opacity = 1,
  segments = 36,
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
  const geo = useLathe(height, radiusAt, segments)
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

/** Continuous limb between two joints — slight overshoot for seamless blend */
function Limb({
  from,
  to,
  r0,
  r1,
  r2,
  color,
}: {
  from: [number, number, number]
  to: [number, number, number]
  r0: number
  r1: number
  r2: number
  color: string
}) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const dist = Math.hypot(dx, dy, dz)
  const height = dist * 1.12
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ]
  const dir = new THREE.Vector3(dx, dy, dz).normalize()
  const e = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
  )
  const radiusAt = useMemo(
    () => (t: number) => {
      // smooth anatomical taper: near → mid muscle → far
      const hermite = (a: number, b: number, u: number) => {
        const s = u * u * (3 - 2 * u)
        return a + (b - a) * s
      }
      if (t < 0.4) return hermite(r0, r1, t / 0.4)
      return hermite(r1, r2, (t - 0.4) / 0.6)
    },
    [r0, r1, r2],
  )
  return (
    <LathePart
      height={height}
      radiusAt={radiusAt}
      position={mid}
      rotation={[e.x, e.y, e.z]}
      color={color}
      segments={40}
    />
  )
}

function Blend({
  position,
  radius,
  color,
  scale,
}: {
  position: [number, number, number]
  radius: number
  color: string
  scale?: [number, number, number]
}) {
  // Tiny flush blend — same color as neighboring limb, not a visible ball joint
  return (
    <mesh position={position} scale={scale ?? [1, 1, 1]} castShadow>
      <sphereGeometry args={[radius, 24, 20]} />
      <PearlMaterial color={color} />
    </mesh>
  )
}

function Hand({
  position,
  side,
  s = 1,
  color,
}: {
  position: [number, number, number]
  side: 1 | -1
  s?: number
  color: string
}) {
  return (
    <group position={position} scale={s}>
      <mesh castShadow position={[0, -0.015, 0.012]} scale={[1, 1.2, 0.65]}>
        <sphereGeometry args={[0.034, 18, 14]} />
        <PearlMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0, -0.048, 0.016]} scale={[0.8, 1.05, 0.6]}>
        <sphereGeometry args={[0.028, 14, 12]} />
        <PearlMaterial color={color} />
      </mesh>
      <mesh
        castShadow
        position={[side * 0.026, -0.02, 0.018]}
        rotation={[0.15, 0, side * 0.5]}
        scale={[0.5, 0.85, 0.5]}
      >
        <sphereGeometry args={[0.02, 12, 10]} />
        <PearlMaterial color={color} />
      </mesh>
    </group>
  )
}

function Foot({
  position,
  color,
}: {
  position: [number, number, number]
  color: string
}) {
  return (
    <group position={position}>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.018, 0.055]}
        scale={[0.85, 0.5, 1.4]}
      >
        <sphereGeometry args={[0.048, 18, 14]} />
        <PearlMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.025, -0.015]} scale={[0.8, 0.65, 0.85]}>
        <sphereGeometry args={[0.035, 14, 12]} />
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

  // Full-body continuous torso profile (bottom→top): hips flare → waist → chest → shoulders → neck
  // ~8 heads; head unit ≈ 0.21 → total height ≈ 1.68 after lift
  const bodyRadius = useMemo(
    () => (t: number) => {
      // t=0 bottom of abdomen, t=1 top at neck base
      const pts: [number, number][] = [
        [0.0, 0.118], // into pelvis
        [0.12, 0.1], // waist
        [0.28, 0.108],
        [0.45, 0.145], // lower chest
        [0.62, 0.168], // chest
        [0.78, 0.182], // upper chest / deltoid
        [0.9, 0.155], // shoulder slope
        [1.0, 0.055], // neck base
      ]
      for (let i = 0; i < pts.length - 1; i++) {
        const [t0, r0] = pts[i]
        const [t1, r1] = pts[i + 1]
        if (t >= t0 && t <= t1) {
          const u = (t - t0) / (t1 - t0)
          const s = u * u * (3 - 2 * u)
          return r0 + (r1 - r0) * s
        }
      }
      return pts[pts.length - 1][1]
    },
    [],
  )

  const pelvisRadius = useMemo(
    () => (t: number) => {
      // bottom→top
      const pts: [number, number][] = [
        [0, 0.07],
        [0.35, 0.13],
        [0.7, 0.135],
        [1, 0.112],
      ]
      for (let i = 0; i < pts.length - 1; i++) {
        const [t0, r0] = pts[i]
        const [t1, r1] = pts[i + 1]
        if (t >= t0 && t <= t1) {
          const u = (t - t0) / (t1 - t0)
          const s = u * u * (3 - 2 * u)
          return r0 + (r1 - r0) * s
        }
      }
      return 0.11
    },
    [],
  )

  const neckRadius = useMemo(
    () => (t: number) => 0.038 + 0.01 * Math.sin(t * Math.PI),
    [],
  )

  const outerRadius = useMemo(
    () => (t: number) => bodyRadius(t) * 1.1 + 0.012,
    [bodyRadius],
  )

  return (
    <group position={[0, 0.14, 0]}>
      {/* Head — elongated oval, featureless (~1/8 height) */}
      <mesh position={[0, 1.58, 0.01]} scale={[0.88, 1.32, 0.9]} castShadow>
        <sphereGeometry args={[0.1, 40, 32]} />
        <PearlMaterial />
      </mesh>

      <LathePart
        height={0.11}
        radiusAt={neckRadius}
        position={[0, 1.42, 0]}
        color={PEARL}
        segments={24}
      />

      {/* Single continuous V-torso (shoulders → waist) */}
      <group scale={[fit.torsoX, 1, fit.torsoZ * 0.78]}>
        <LathePart
          height={0.62}
          radiusAt={bodyRadius}
          position={[0, 1.05, 0]}
          color={torsoColor}
          segments={48}
        />
        {/* Subtle chest volume — flattened, not oversized spheres */}
        <mesh
          position={[0, 1.18, 0.04]}
          scale={[1.05, 0.75, 0.55]}
          castShadow
        >
          <sphereGeometry args={[0.12, 24, 18]} />
          <PearlMaterial color={torsoColor} />
        </mesh>
      </group>

      {showOuter && (
        <group scale={[fit.torsoX * 1.1, 1.02, fit.torsoZ * 0.88]}>
          <LathePart
            height={0.68}
            radiusAt={outerRadius}
            position={[0, 1.02, 0]}
            color={outer!.color}
            opacity={0.9}
            segments={40}
          />
        </group>
      )}

      {/* Pelvis — continuous with waist */}
      <group scale={[fit.hipX * 1.08, 1, fit.hipZ * 0.92]}>
        <LathePart
          height={0.22}
          radiusAt={pelvisRadius}
          position={[0, 0.7, 0]}
          color={pelvisColor}
          segments={36}
        />
      </group>

      {/* Arms — A-pose, flush blends */}
      {([-1, 1] as const).map((side) => {
        const sh: [number, number, number] = [
          side * 0.195 * fit.torsoX,
          1.3,
          0.01,
        ]
        const el: [number, number, number] = [
          side * 0.4 * ls,
          0.98,
          0.04,
        ]
        const wr: [number, number, number] = [
          side * 0.48 * ls,
          0.66,
          0.05,
        ]
        const hd: [number, number, number] = [
          side * 0.5 * ls,
          0.56,
          0.06,
        ]
        return (
          <group key={`arm-${side}`}>
            <Blend
              position={sh}
              radius={0.048 * ls}
              color={sleeveColor}
              scale={[1.15, 0.95, 1.05]}
            />
            <Limb
              from={sh}
              to={el}
              r0={0.048 * ls}
              r1={0.042 * ls}
              r2={0.034 * ls}
              color={sleeveColor}
            />
            <Blend position={el} radius={0.032 * ls} color={sleeveColor} />
            <Limb
              from={el}
              to={wr}
              r0={0.033 * ls}
              r1={0.03 * ls}
              r2={0.025 * ls}
              color={PEARL}
            />
            <Blend position={wr} radius={0.024 * ls} color={PEARL} />
            <Hand position={hd} side={side} s={ls} color={PEARL} />
          </group>
        )
      })}

      {/* Legs */}
      {([-1, 1] as const).map((side) => {
        const hip: [number, number, number] = [
          side * 0.085 * fit.hipX,
          0.64,
          0,
        ]
        const knee: [number, number, number] = [
          side * 0.09 * fit.hipX,
          0.3,
          0.01,
        ]
        const ankle: [number, number, number] = [
          side * 0.085 * fit.hipX,
          -0.04,
          0.015,
        ]
        return (
          <group key={`leg-${side}`}>
            <Blend
              position={hip}
              radius={0.055 * ls}
              color={legColor}
              scale={[1.1, 0.95, 1.05]}
            />
            <Limb
              from={hip}
              to={knee}
              r0={0.068 * ls}
              r1={0.06 * ls}
              r2={0.045 * ls}
              color={legColor}
            />
            <Blend position={knee} radius={0.04 * ls} color={legColor} />
            <Limb
              from={knee}
              to={ankle}
              r0={0.042 * ls}
              r1={0.038 * ls}
              r2={0.028 * ls}
              color={legColor}
            />
            <Blend position={ankle} radius={0.026 * ls} color={shoeColor} />
            <Foot
              position={[side * 0.085 * fit.hipX, -0.12, 0.025]}
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[5.5, 64]} />
        <meshStandardMaterial color="#ddd9e6" roughness={0.9} metalness={0} />
      </mesh>
      {[1.4, 2.2, 3.0, 3.8].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <ringGeometry args={[r - 0.006, r + 0.006, 72]} />
          <meshBasicMaterial color="#c5c0d0" transparent opacity={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, -4.2]}>
        <planeGeometry args={[16, 11]} />
        <meshStandardMaterial color={STUDIO_BG} roughness={1} />
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
      <fog attach="fog" args={[STUDIO_BG, 9, 18]} />

      <ambientLight intensity={0.62} />
      <hemisphereLight args={["#ffffff", "#c9c4d6", 0.5]} />
      <directionalLight
        position={[2.2, 5.5, 3.2]}
        intensity={0.85}
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
      <directionalLight position={[-2.8, 2.5, 1.2]} intensity={0.32} color="#efeaf8" />
      <directionalLight position={[0.2, 2.8, -3]} intensity={0.45} />

      <Studio />
      <MannequinFigure {...props} />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.22}
        scale={5}
        blur={3.2}
        far={3.5}
        color="#5c5870"
      />

      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.075}
        minDistance={2.5}
        maxDistance={6.5}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0.8, 0]}
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

function GarmentLegend({
  items,
  activeLayers,
}: {
  items: MannequinGarment[]
  activeLayers: Record<string, boolean>
}) {
  const visible = items.filter((i) => activeLayers[i.type])
  if (!visible.length) return null
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
            className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle"
            style={{ background: item.color }}
          />
          {item.name}
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
    const t = window.setTimeout(
      () => setStatus((s) => (s === "loading" ? "ready" : s)),
      4000,
    )
    return () => window.clearTimeout(t)
  }, [status, canvasKey])

  return (
    <div className={`relative w-full h-full min-h-[360px] ${className ?? ""}`}>
      {status === "loading" && <LoadingOverlay />}
      {status === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 px-6 text-center"
          style={{ background: STUDIO_BG }}
        >
          <p className="text-sm font-bold text-neutral-800">
            3D preview unavailable
          </p>
          <p className="text-[11px] text-neutral-500 max-w-xs">{errorMsg}</p>
          <button
            type="button"
            onClick={() => {
              setErrorMsg("Could not initialize 3D canvas")
              setStatus("loading")
              setCanvasKey((k) => k + 1)
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: "var(--sky)", color: "#0D0F18" }}
          >
            Retry 3D View
          </button>
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
              position: [1.25, 1.05, 3.55],
              fov: 30,
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
              gl.toneMappingExposure = 1.08
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
