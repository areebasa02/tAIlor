import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  Component,
  type ReactNode,
} from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, ContactShadows, Html } from "@react-three/drei"
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

/** Tapered lathe limb — action-figure / PolyOne segment, not a plain capsule */
function TaperLimb({
  length,
  rMid,
  rEnd = 0.72,
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
    const n = 18
    for (let i = 0; i <= n; i++) {
      const t = i / n
      // Fat mid, tapered ends (toy limb silhouette)
      const flare = Math.sin(t * Math.PI)
      const r = rMid * (rEnd + (1 - rEnd) * flare)
      pts.push(new THREE.Vector2(Math.max(r, 0.008), (t - 0.5) * length))
    }
    const g = new THREE.LatheGeometry(pts, 20)
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

/** Simplified hand with finger stubs */
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
  const s = scale
  return (
    <group position={position} scale={[s, s, s]}>
      <mesh castShadow position={[0, 0, 0.01]}>
        <boxGeometry args={[0.07, 0.09, 0.045]} />
        <Plastic color={color} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          castShadow
          position={[(i - 1.5) * 0.018, -0.065, 0.01]}
        >
          <capsuleGeometry args={[0.008, 0.028, 3, 6]} />
          <Plastic color={color} />
        </mesh>
      ))}
      {/* Thumb */}
      <mesh
        castShadow
        position={[side * 0.04, -0.02, 0.02]}
        rotation={[0, 0, side * 0.7]}
      >
        <capsuleGeometry args={[0.009, 0.022, 3, 6]} />
        <Plastic color={color} />
      </mesh>
    </group>
  )
}

/** Contoured foot / shoe */
function Foot({
  position,
  color,
}: {
  position: [number, number, number]
  color: string
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.02, 0.04]}>
        <boxGeometry args={[0.09, 0.055, 0.2]} />
        <Plastic color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.035, -0.05]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <Plastic color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.025, 0.12]} scale={[1, 0.7, 1.1]}>
        <sphereGeometry args={[0.04, 12, 10]} />
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

  // Clothing segments tint with garment color; joints stay DARK two-tone
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
  // Chest plate / pelvis stay darker accent unless outerwear covers
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

  const labelItems = useMemo(() => {
    const labels: {
      name: string
      position: [number, number, number]
      color: string
    }[] = []
    if (showOuter && outer) {
      labels.push({
        name: outer.name,
        position: [1.15, 1.25, 0],
        color: outer.color,
      })
    } else if (showTop && top) {
      labels.push({
        name: top.name,
        position: [1.1, 1.15, 0],
        color: top.color,
      })
    }
    if (showBottom && bottom) {
      labels.push({
        name: bottom.name,
        position: [1.0, 0.25, 0],
        color: bottom.color,
      })
    }
    if (showShoes && shoes) {
      labels.push({
        name: shoes.name,
        position: [0.9, -0.75, 0],
        color: shoes.color,
      })
    }
    return labels
  }, [showOuter, showTop, showBottom, showShoes, outer, top, bottom, shoes])

  const ls = fit.limb

  return (
    <group position={[0, 0, 0]}>
      {/* —— HEAD (featureless ovoid, toy proportion) —— */}
      <mesh position={[0, 1.62, 0]} scale={[1, 1.15, 0.92]} castShadow>
        <sphereGeometry args={[0.145, 28, 24]} />
        <Plastic color={LIGHT} />
      </mesh>
      {/* Neck */}
      <TaperLimb
        length={0.08}
        rMid={0.042}
        rEnd={0.85}
        position={[0, 1.45, 0]}
        color={LIGHT}
      />
      <JointBall radius={0.048} position={[0, 1.4, 0]} />

      {/* —— TORSO —— */}
      <group scale={[fit.torsoX, 1, fit.torsoZ]}>
        {/* Upper chest shell */}
        <mesh position={[0, 1.22, 0]} castShadow receiveShadow>
          <sphereGeometry args={[0.2, 24, 18]} />
          <Plastic color={chestColor} />
        </mesh>
        {/* Flatten / widen chest */}
        <mesh
          position={[0, 1.2, 0.02]}
          scale={[1.25, 0.95, 0.85]}
          castShadow
        >
          <sphereGeometry args={[0.175, 20, 16]} />
          <Plastic color={chestColor} />
        </mesh>
        {/* Dark chest plate (PolyOne two-tone) */}
        <mesh position={[0, 1.18, 0.09]} scale={[0.95, 0.7, 0.35]} castShadow>
          <sphereGeometry args={[0.14, 16, 12]} />
          <Plastic color={chestPlateColor} />
        </mesh>
        {/* Mid torso / abdomen */}
        <TaperLimb
          length={0.22}
          rMid={0.13}
          rEnd={0.78}
          position={[0, 0.95, 0]}
          color={abdomenColor}
        />
      </group>

      {/* Outerwear volume */}
      {showOuter && (
        <group scale={[fit.torsoX * 1.18, 1.05, fit.torsoZ * 1.22]}>
          <mesh position={[0, 1.1, 0]} castShadow>
            <sphereGeometry args={[0.24, 24, 18]} />
            <meshStandardMaterial
              color={outer!.color}
              roughness={0.78}
              metalness={0.05}
              transparent
              opacity={0.9}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0.95, 0]} scale={[1, 1.1, 1]} castShadow>
            <sphereGeometry args={[0.2, 20, 16]} />
            <meshStandardMaterial
              color={outer!.color}
              roughness={0.78}
              metalness={0.05}
              transparent
              opacity={0.85}
            />
          </mesh>
        </group>
      )}

      {/* —— PELVIS (dark accent) —— */}
      <group scale={[fit.hipX, 1, fit.hipZ]}>
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <sphereGeometry args={[0.15, 22, 16]} />
          <Plastic color={pelvisColor} />
        </mesh>
        <mesh
          position={[0, 0.7, 0]}
          scale={[1.15, 0.65, 0.95]}
          castShadow
        >
          <sphereGeometry args={[0.14, 18, 14]} />
          <Plastic color={pelvisColor} />
        </mesh>
      </group>

      {/* —— ARMS —— */}
      {([-1, 1] as const).map((side) => {
        const sh: [number, number, number] = [
          side * 0.28 * fit.torsoX,
          1.3,
          0,
        ]
        const upper: [number, number, number] = [
          side * 0.4 * ls,
          1.05,
          0.02,
        ]
        const el: [number, number, number] = [side * 0.46 * ls, 0.82, 0.04]
        const fore: [number, number, number] = [side * 0.5 * ls, 0.58, 0.05]
        const wr: [number, number, number] = [side * 0.52 * ls, 0.38, 0.05]
        const z = side * 0.18
        return (
          <group key={`arm-${side}`}>
            <JointBall radius={0.062 * ls} position={sh} />
            <TaperLimb
              length={0.28}
              rMid={0.055 * ls}
              rEnd={0.7}
              position={upper}
              rotation={[0.08, 0, z]}
              color={sleeveColor}
            />
            <JointBall radius={0.05 * ls} position={el} />
            <TaperLimb
              length={0.24}
              rMid={0.045 * ls}
              rEnd={0.72}
              position={fore}
              rotation={[0.1, 0, z * 0.4]}
              color={LIGHT}
            />
            <JointBall radius={0.04 * ls} position={wr} />
            <Hand
              position={[side * 0.52 * ls, 0.28, 0.06]}
              side={side}
              scale={ls}
              color={LIGHT}
            />
          </group>
        )
      })}

      {/* —— LEGS —— */}
      {([-1, 1] as const).map((side) => {
        const hip: [number, number, number] = [
          side * 0.105 * fit.hipX,
          0.62,
          0,
        ]
        const thigh: [number, number, number] = [
          side * 0.11 * fit.hipX,
          0.38,
          0,
        ]
        const knee: [number, number, number] = [
          side * 0.11 * fit.hipX,
          0.14,
          0,
        ]
        const shin: [number, number, number] = [
          side * 0.11 * fit.hipX,
          -0.1,
          0,
        ]
        const ankle: [number, number, number] = [
          side * 0.11 * fit.hipX,
          -0.32,
          0.01,
        ]
        return (
          <group key={`leg-${side}`}>
            <JointBall radius={0.068 * ls} position={hip} />
            <TaperLimb
              length={0.34}
              rMid={0.078 * ls}
              rEnd={0.68}
              position={thigh}
              color={thighColor}
            />
            <JointBall radius={0.055 * ls} position={knee} />
            <TaperLimb
              length={0.3}
              rMid={0.058 * ls}
              rEnd={0.7}
              position={shin}
              color={shinColor}
            />
            <JointBall radius={0.045 * ls} position={ankle} />
            <Foot
              position={[side * 0.11 * fit.hipX, -0.42, 0]}
              color={shoeColor}
            />
          </group>
        )
      })}

      {labelItems.map((label) => (
        <Html
          key={label.name}
          position={label.position}
          distanceFactor={6}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            className="px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap shadow-lg"
            style={{
              background: "rgba(13,15,24,0.9)",
              color: "#fff",
              border: `1.5px solid ${label.color}`,
            }}
          >
            <span
              className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle"
              style={{ background: label.color }}
            />
            {label.name}
          </div>
        </Html>
      ))}
    </group>
  )
}

function darken(hex: string, amount: number): string {
  const c = new THREE.Color(hex)
  c.multiplyScalar(1 - amount)
  return `#${c.getHexString()}`
}

function Studio() {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        receiveShadow
      >
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial
          color="#12151c"
          roughness={0.55}
          metalness={0.15}
        />
      </mesh>
      {/* Curved dark backdrop */}
      <mesh position={[0, 1.6, -3.2]}>
        <planeGeometry args={[14, 8]} />
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
      <fog attach="fog" args={["#0e1118", 7, 16]} />

      <ambientLight intensity={0.28} />
      <hemisphereLight args={["#6a7a98", "#0a0c12", 0.35]} />

      {/* Key */}
      <directionalLight
        position={[2.8, 5.2, 3]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={14}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={4}
        shadow-camera-bottom={-2}
        shadow-bias={-0.00025}
      />
      {/* Fill */}
      <directionalLight position={[-3, 2.2, 1.5]} intensity={0.35} />
      {/* Soft rim — PolyOne hallmark */}
      <directionalLight position={[-1.2, 2.5, -3.5]} intensity={1.6} color="#c8d4ee" />
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
        minDistance={2.5}
        maxDistance={6}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0.75, 0]}
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
        <CanvasErrorBoundary key={canvasKey} onError={handleError}>
          <Canvas
            shadows
            dpr={[1, 1.75]}
            camera={{ position: [1.35, 1.2, 3.0], fov: 35, near: 0.1, far: 40 }}
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
