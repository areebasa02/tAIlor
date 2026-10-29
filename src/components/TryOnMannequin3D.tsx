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

/**
 * PolyOne-style two-tone matte plastic:
 * LIGHT = limbs / head / main plates
 * DARK  = joints / chest plate / pelvis
 */
const LIGHT = "#9eb0c6"
const DARK = "#4a5d78"
const MATTE = { roughness: 0.82, metalness: 0.04 } as const

const FIT_SCALE: Record<
  FitStyle,
  { torsoX: number; torsoZ: number; hipX: number; hipZ: number; limb: number }
> = {
  fitted: { torsoX: 0.9, torsoZ: 0.92, hipX: 0.88, hipZ: 0.92, limb: 0.94 },
  standard: { torsoX: 1, torsoZ: 1, hipX: 1, hipZ: 1, limb: 1 },
  relaxed: { torsoX: 1.12, torsoZ: 1.08, hipX: 1.14, hipZ: 1.1, limb: 1.05 },
}

function findItem(items: MannequinGarment[], type: string) {
  return items.find((i) => i.type === type)
}

function Plastic({ color }: { color: string }) {
  return <meshStandardMaterial color={color} {...MATTE} />
}

function darken(hex: string, amount: number): string {
  const c = new THREE.Color(hex)
  c.multiplyScalar(1 - amount)
  return `#${c.getHexString()}`
}

/** Mild taper limb — ends stay wide enough to nest into joints (no gaps) */
function TaperLimb({
  length,
  rMid,
  rEnd = 0.88,
  position,
  rotation,
  color,
}: {
  length: number
  rMid: number
  rEnd?: number
  position: [number, number, number]
  rotation?: [number, number, number]
  color: string
}) {
  const geo = useMemo(() => {
    const pts: THREE.Vector2[] = []
    const n = 16
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const flare = Math.sin(t * Math.PI)
      const r = rMid * (rEnd + (1 - rEnd) * flare)
      pts.push(new THREE.Vector2(Math.max(r, 0.01), (t - 0.5) * length))
    }
    const g = new THREE.LatheGeometry(pts, 18)
    g.computeVertexNormals()
    return g
  }, [length, rMid, rEnd])

  return (
    <mesh
      geometry={geo}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
    >
      <Plastic color={color} />
    </mesh>
  )
}

function JointBall({
  radius,
  position,
  color = DARK,
}: {
  radius: number
  position: [number, number, number]
  color?: string
}) {
  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[radius, 20, 18]} />
      <Plastic color={color} />
    </mesh>
  )
}

/** Segment spanning two joints — length overshoots so ends nest into balls */
function LimbBetween({
  from,
  to,
  rMid,
  color,
  rEnd = 0.9,
}: {
  from: [number, number, number]
  to: [number, number, number]
  rMid: number
  color: string
  rEnd?: number
}) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const dist = Math.hypot(dx, dy, dz)
  // Overlap into joints (~12% each end) so no visible gap
  const length = dist + rMid * 1.1
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ]
  // Orient lathe (Y-up) along from→to
  const dir = new THREE.Vector3(dx, dy, dz).normalize()
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir,
  )
  const euler = new THREE.Euler().setFromQuaternion(quat)

  return (
    <TaperLimb
      length={length}
      rMid={rMid}
      rEnd={rEnd}
      position={mid}
      rotation={[euler.x, euler.y, euler.z]}
      color={color}
    />
  )
}

function Hand({
  position,
  side,
  scale = 1,
  color = LIGHT,
}: {
  position: [number, number, number]
  side: 1 | -1
  scale?: number
  color?: string
}) {
  const s = scale * 0.92
  return (
    <group position={position} scale={[s, s, s]}>
      <mesh castShadow position={[0, -0.01, 0.01]}>
        <boxGeometry args={[0.055, 0.075, 0.032]} />
        <Plastic color={color} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          castShadow
          position={[(i - 1.5) * 0.014, -0.055, 0.01]}
        >
          <capsuleGeometry args={[0.006, 0.022, 3, 6]} />
          <Plastic color={color} />
        </mesh>
      ))}
      <mesh
        castShadow
        position={[side * 0.032, -0.015, 0.015]}
        rotation={[0, 0, side * 0.65]}
      >
        <capsuleGeometry args={[0.007, 0.018, 3, 6]} />
        <Plastic color={color} />
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
      <mesh castShadow receiveShadow position={[0, 0.018, 0.045]}>
        <boxGeometry args={[0.075, 0.042, 0.18]} />
        <Plastic color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.028, -0.04]}>
        <sphereGeometry args={[0.036, 12, 10]} />
        <Plastic color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.02, 0.11]} scale={[1, 0.65, 1]}>
        <sphereGeometry args={[0.032, 12, 10]} />
        <Plastic color={color} />
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

  const chestColor = showOuter
    ? outer!.color
    : showTop
      ? top!.color
      : LIGHT
  const abdomenColor = showOuter
    ? outer!.color
    : showTop
      ? top!.color
      : LIGHT
  const chestPlateColor = showOuter
    ? outer!.color
    : showTop
      ? darken(top!.color, 0.22)
      : DARK
  const pelvisColor = showBottom ? darken(bottom!.color, 0.18) : DARK
  const sleeveColor = showOuter
    ? outer!.color
    : showTop
      ? top!.color
      : LIGHT
  const thighColor = showBottom ? bottom!.color : LIGHT
  const shinColor = showBottom ? bottom!.color : LIGHT
  const shoeColor = showShoes ? shoes!.color : DARK

  const ls = fit.limb

  // Human-ish proportions (~1.72m figure, feet near y=0)
  // Head smaller; shoulders wider; limbs longer/thinner; snug nesting

  return (
    {/* Lift so soles sit on y=0 studio floor */}
    <group position={[0, 0.18, 0]}>
      {/* —— HEAD (human scale ~1/7.5) —— */}
      <mesh position={[0, 1.58, 0]} scale={[1, 1.18, 0.95]} castShadow>
        <sphereGeometry args={[0.105, 28, 24]} />
        <Plastic color={LIGHT} />
      </mesh>
      <JointBall radius={0.038} position={[0, 1.445, 0]} />
      <LimbBetween
        from={[0, 1.445, 0]}
        to={[0, 1.36, 0]}
        rMid={0.034}
        color={LIGHT}
        rEnd={0.92}
      />

      {/* —— TORSO —— */}
      <group scale={[fit.torsoX, 1, fit.torsoZ]}>
        {/* Broader shoulders / upper chest */}
        <mesh
          position={[0, 1.28, 0]}
          scale={[1.35, 0.85, 0.72]}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[0.175, 24, 18]} />
          <Plastic color={chestColor} />
        </mesh>
        {/* Ribcage volume */}
        <mesh
          position={[0, 1.14, 0.01]}
          scale={[1.05, 1.15, 0.78]}
          castShadow
        >
          <sphereGeometry args={[0.155, 22, 16]} />
          <Plastic color={chestColor} />
        </mesh>
        {/* Dark chest plate */}
        <mesh position={[0, 1.2, 0.08]} scale={[0.9, 0.75, 0.32]} castShadow>
          <sphereGeometry args={[0.12, 16, 12]} />
          <Plastic color={chestPlateColor} />
        </mesh>
        {/* Abdomen — elongated, meets pelvis */}
        <mesh
          position={[0, 0.92, 0]}
          scale={[0.95, 1.2, 0.75]}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[0.125, 20, 16]} />
          <Plastic color={abdomenColor} />
        </mesh>
        {/* Waist bridge into pelvis (closes gap) */}
        <mesh position={[0, 0.8, 0]} scale={[1.05, 0.55, 0.85]} castShadow>
          <sphereGeometry args={[0.12, 16, 12]} />
          <Plastic color={abdomenColor} />
        </mesh>
      </group>

      {showOuter && (
        <group scale={[fit.torsoX * 1.16, 1.04, fit.torsoZ * 1.2]}>
          <mesh position={[0, 1.12, 0]} castShadow>
            <sphereGeometry args={[0.22, 24, 18]} />
            <meshStandardMaterial
              color={outer!.color}
              roughness={0.78}
              metalness={0.05}
              transparent
              opacity={0.88}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0.92, 0]} scale={[1, 1.15, 1]} castShadow>
            <sphereGeometry args={[0.18, 20, 16]} />
            <meshStandardMaterial
              color={outer!.color}
              roughness={0.78}
              metalness={0.05}
              transparent
              opacity={0.82}
            />
          </mesh>
        </group>
      )}

      {/* —— PELVIS —— */}
      <group scale={[fit.hipX, 1, fit.hipZ]}>
        <mesh
          position={[0, 0.7, 0]}
          scale={[1.2, 0.72, 0.95]}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[0.135, 22, 16]} />
          <Plastic color={pelvisColor} />
        </mesh>
      </group>

      {/* —— ARMS (snug joint nesting) —— */}
      {([-1, 1] as const).map((side) => {
        const sh: [number, number, number] = [
          side * 0.3 * fit.torsoX,
          1.3,
          0,
        ]
        const el: [number, number, number] = [
          side * 0.42 * ls,
          0.95,
          0.02,
        ]
        const wr: [number, number, number] = [
          side * 0.46 * ls,
          0.62,
          0.03,
        ]
        const handPos: [number, number, number] = [
          side * 0.47 * ls,
          0.52,
          0.04,
        ]
        return (
          <group key={`arm-${side}`}>
            <JointBall radius={0.052 * ls} position={sh} />
            <LimbBetween
              from={sh}
              to={el}
              rMid={0.042 * ls}
              color={sleeveColor}
            />
            <JointBall radius={0.042 * ls} position={el} />
            <LimbBetween
              from={el}
              to={wr}
              rMid={0.034 * ls}
              color={LIGHT}
            />
            <JointBall radius={0.034 * ls} position={wr} />
            <Hand position={handPos} side={side} scale={ls} color={LIGHT} />
          </group>
        )
      })}

      {/* —— LEGS —— */}
      {([-1, 1] as const).map((side) => {
        const hip: [number, number, number] = [
          side * 0.1 * fit.hipX,
          0.62,
          0,
        ]
        const knee: [number, number, number] = [
          side * 0.105 * fit.hipX,
          0.28,
          0,
        ]
        const ankle: [number, number, number] = [
          side * 0.105 * fit.hipX,
          -0.08,
          0.01,
        ]
        return (
          <group key={`leg-${side}`}>
            <JointBall radius={0.058 * ls} position={hip} />
            <LimbBetween
              from={hip}
              to={knee}
              rMid={0.058 * ls}
              color={thighColor}
            />
            <JointBall radius={0.048 * ls} position={knee} />
            <LimbBetween
              from={knee}
              to={ankle}
              rMid={0.045 * ls}
              color={shinColor}
            />
            <JointBall radius={0.038 * ls} position={ankle} />
            <Foot
              position={[side * 0.105 * fit.hipX, -0.16, 0.02]}
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
        position={[0, -0.001, 0]}
        receiveShadow
      >
        <circleGeometry args={[7, 64]} />
        <meshStandardMaterial
          color="#12151c"
          roughness={0.55}
          metalness={0.15}
        />
      </mesh>
      <mesh position={[0, 1.6, -3.5]}>
        <planeGeometry args={[16, 9]} />
        <meshStandardMaterial color="#0c0e14" roughness={1} metalness={0} />
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
      <color attach="background" args={["#0e1118"]} />
      <fog attach="fog" args={["#0e1118", 8, 18]} />

      <ambientLight intensity={0.28} />
      <hemisphereLight args={["#6a7a98", "#0a0c12", 0.35]} />

      <directionalLight
        position={[2.8, 5.2, 3]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={14}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={4}
        shadow-camera-bottom={-2}
        shadow-bias={-0.00025}
      />
      <directionalLight position={[-3, 2.2, 1.5]} intensity={0.35} />
      <directionalLight
        position={[-1.2, 2.5, -3.5]}
        intensity={1.6}
        color="#c8d4ee"
      />
      <pointLight position={[0.5, 1.8, -2.2]} intensity={0.55} color="#a8b8d8" />

      <Studio />
      <MannequinFigure {...props} />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.55}
        scale={5}
        blur={2.4}
        far={4}
        color="#000000"
      />

      <OrbitControls
        enablePan={false}
        minDistance={2.8}
        maxDistance={7}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0.72, 0]}
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 pointer-events-none bg-[#0e1118]/85">
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--sky)", borderTopColor: "transparent" }}
      />
      <p className="text-[11px] text-neutral-400 font-medium">
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 px-6 text-center bg-[#0e1118]">
      <p className="text-sm font-bold text-white">3D preview unavailable</p>
      <p className="text-[11px] text-neutral-400 max-w-xs leading-relaxed">
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

function EmptyOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 px-6 text-center bg-[#0e1118]">
      <p className="text-sm font-bold text-white">No garments to display</p>
      <p className="text-[11px] text-neutral-400">
        Select an outfit or enable at least one layer.
      </p>
    </div>
  )
}

/** DOM garment legend — never clipped by canvas overflow */
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
            background: "rgba(13,15,24,0.92)",
            color: "#fff",
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

  const anyLayerVisible = useMemo(() => {
    return items.some((item) => activeLayers[item.type])
  }, [items, activeLayers])

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

  const handleError = (msg: string) => {
    setErrorMsg(msg)
    setStatus("error")
  }

  return (
    <div className={`relative w-full h-full min-h-[360px] ${className ?? ""}`}>
      {status === "loading" && <LoadingOverlay />}
      {status === "error" && (
        <ErrorOverlay message={errorMsg} onRetry={retry} />
      )}
      {status !== "error" && !anyLayerVisible && items.length === 0 && (
        <EmptyOverlay />
      )}
      {status !== "error" && items.length > 0 && !anyLayerVisible && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-xl text-[10px] font-semibold"
          style={{
            background: "rgba(13,15,24,0.9)",
            color: "var(--muted-foreground)",
          }}
        >
          All layers hidden — toggle a garment layer to show
        </div>
      )}

      {avatarLabel && status !== "error" && (
        <div
          className="absolute top-3 left-3 z-10 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider"
          style={{ background: "var(--magenta)", color: "#fff" }}
        >
          {avatarLabel}
        </div>
      )}

      {status !== "error" && (
        <GarmentLegend items={items} activeLayers={activeLayers} />
      )}

      {status !== "error" && (
        <CanvasErrorBoundary key={canvasKey} onError={handleError}>
          <Canvas
            shadows
            dpr={[1, 1.75]}
            camera={{
              position: [1.55, 1.15, 3.85],
              fov: 34,
              near: 0.1,
              far: 40,
            }}
            gl={{ antialias: true, alpha: false, powerPreference: "default" }}
            onCreated={({ gl }) => {
              gl.setClearColor("#0e1118")
              setStatus("ready")
            }}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 360,
              touchAction: "none",
              background: "#0e1118",
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

      <p className="absolute bottom-12 left-0 right-0 text-center text-[9px] text-neutral-500 pointer-events-none">
        Drag to orbit · Pinch/scroll to zoom
      </p>
    </div>
  )
}
