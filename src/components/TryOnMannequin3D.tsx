import { Suspense, useEffect, useMemo, useState, Component, type ReactNode } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, ContactShadows, Environment, Html } from "@react-three/drei"
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

const SKIN = "#9aa3b8"
const UNDER = "#5c6478"

const FIT_SCALE: Record<
  FitStyle,
  { torsoX: number; torsoZ: number; hipX: number; hipZ: number; limb: number }
> = {
  fitted: { torsoX: 0.88, torsoZ: 0.9, hipX: 0.86, hipZ: 0.9, limb: 0.92 },
  standard: { torsoX: 1, torsoZ: 1, hipX: 1, hipZ: 1, limb: 1 },
  relaxed: { torsoX: 1.14, torsoZ: 1.1, hipX: 1.18, hipZ: 1.12, limb: 1.06 },
}

function findItem(items: MannequinGarment[], type: string) {
  return items.find((i) => i.type === type)
}

function Limb({
  args,
  position,
  rotation,
  color,
  opacity = 1,
  visible = true,
}: {
  args: [number, number, number?, number?]
  position: [number, number, number]
  rotation?: [number, number, number]
  color: string
  opacity?: number
  visible?: boolean
}) {
  if (!visible) return null
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <capsuleGeometry args={args} />
      <meshStandardMaterial
        color={color}
        roughness={0.55}
        metalness={0.08}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
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
  // Outerwear-only looks still need a torso fill when Top is missing
  const torsoColor = showOuter && !showTop
    ? UNDER
    : showTop
      ? top!.color
      : UNDER
  const legsColor = showBottom ? bottom!.color : UNDER
  const shoeColor = showShoes ? shoes!.color : "#3a4054"

  const labelItems = useMemo(() => {
    const labels: { name: string; position: [number, number, number]; color: string }[] = []
    if (showOuter && outer) {
      labels.push({ name: outer.name, position: [1.15, 1.15, 0], color: outer.color })
    } else if (showTop && top) {
      labels.push({ name: top.name, position: [1.1, 1.05, 0], color: top.color })
    }
    if (showBottom && bottom) {
      labels.push({ name: bottom.name, position: [1.05, 0.15, 0], color: bottom.color })
    }
    if (showShoes && shoes) {
      labels.push({ name: shoes.name, position: [0.95, -0.95, 0], color: shoes.color })
    }
    return labels
  }, [showOuter, showTop, showBottom, showShoes, outer, top, bottom, shoes])

  return (
    <group position={[0, -0.95, 0]}>
      {/* Head */}
      <mesh position={[0, 1.72, 0]} castShadow>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial color={SKIN} roughness={0.65} metalness={0.05} />
      </mesh>
      {/* Neck */}
      <Limb args={[0.05, 0.08, 8, 12]} position={[0, 1.52, 0]} color={SKIN} />

      {/* Torso (Top region) — muted when Top/Outerwear layers off */}
      <group scale={[fit.torsoX, 1, fit.torsoZ]}>
        <mesh position={[0, 1.18, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.22, 0.38, 8, 16]} />
          <meshStandardMaterial
            color={torsoColor}
            roughness={0.5}
            metalness={0.1}
            transparent={!showTop && !showOuter}
            opacity={!showTop && !showOuter ? 0.35 : 1}
          />
        </mesh>
        <mesh position={[0, 1.28, 0.06]} castShadow>
          <boxGeometry args={[0.34, 0.28, 0.16]} />
          <meshStandardMaterial
            color={torsoColor}
            roughness={0.48}
            metalness={0.08}
            transparent={!showTop && !showOuter}
            opacity={!showTop && !showOuter ? 0.35 : 1}
          />
        </mesh>
      </group>

      {/* Outerwear shell — slightly larger coat around torso */}
      {showOuter && (
        <group scale={[fit.torsoX * 1.12, 1.02, fit.torsoZ * 1.18]}>
          <mesh position={[0, 1.12, 0]} castShadow>
            <capsuleGeometry args={[0.26, 0.48, 8, 16]} />
            <meshStandardMaterial
              color={outer!.color}
              roughness={0.45}
              metalness={0.12}
              transparent
              opacity={0.92}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Lapels / open front hint */}
          <mesh position={[0, 1.2, 0.22]} castShadow>
            <boxGeometry args={[0.18, 0.42, 0.04]} />
            <meshStandardMaterial
              color={outer!.color}
              roughness={0.4}
              metalness={0.15}
            />
          </mesh>
        </group>
      )}

      {/* Hips / pelvis */}
      <group scale={[fit.hipX, 1, fit.hipZ]}>
        <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
          <sphereGeometry args={[0.2, 20, 16]} />
          <meshStandardMaterial
            color={legsColor}
            roughness={0.55}
            metalness={0.08}
            transparent={!showBottom}
            opacity={!showBottom ? 0.35 : 1}
          />
        </mesh>
      </group>

      {/* Arms — sleeves follow Outerwear, else Top */}
      <group scale={[fit.limb, 1, fit.limb]}>
        <Limb
          args={[0.055, 0.32, 6, 12]}
          position={[-0.38, 1.22, 0]}
          rotation={[0, 0, 0.35]}
          color={showOuter ? outer!.color : showTop ? top!.color : SKIN}
          opacity={showOuter || showTop ? 1 : 0.4}
        />
        <Limb
          args={[0.055, 0.32, 6, 12]}
          position={[0.38, 1.22, 0]}
          rotation={[0, 0, -0.35]}
          color={showOuter ? outer!.color : showTop ? top!.color : SKIN}
          opacity={showOuter || showTop ? 1 : 0.4}
        />
        <Limb
          args={[0.045, 0.26, 6, 12]}
          position={[-0.48, 0.82, 0.04]}
          rotation={[0.15, 0, 0.2]}
          color={SKIN}
        />
        <Limb
          args={[0.045, 0.26, 6, 12]}
          position={[0.48, 0.82, 0.04]}
          rotation={[0.15, 0, -0.2]}
          color={SKIN}
        />
        <mesh position={[-0.52, 0.55, 0.06]} castShadow>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.65} />
        </mesh>
        <mesh position={[0.52, 0.55, 0.06]} castShadow>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.65} />
        </mesh>
      </group>

      {/* Legs (Bottom region) — muted when Bottom layer off */}
      <group scale={[fit.hipX * 0.95, 1, fit.hipZ * 0.95]}>
        <Limb
          args={[0.075 * fit.limb, 0.42, 6, 12]}
          position={[-0.12, 0.38, 0]}
          color={legsColor}
          opacity={showBottom ? 1 : 0.35}
        />
        <Limb
          args={[0.075 * fit.limb, 0.42, 6, 12]}
          position={[0.12, 0.38, 0]}
          color={legsColor}
          opacity={showBottom ? 1 : 0.35}
        />
        <Limb
          args={[0.055 * fit.limb, 0.36, 6, 12]}
          position={[-0.12, -0.2, 0]}
          color={legsColor}
          opacity={showBottom ? 1 : 0.35}
        />
        <Limb
          args={[0.055 * fit.limb, 0.36, 6, 12]}
          position={[0.12, -0.2, 0]}
          color={legsColor}
          opacity={showBottom ? 1 : 0.35}
        />
      </group>

      {/* Shoes */}
      {showShoes ? (
        <>
          <mesh position={[-0.12, -0.52, 0.06]} castShadow receiveShadow>
            <boxGeometry args={[0.14 * fit.limb, 0.08, 0.28]} />
            <meshStandardMaterial color={shoeColor} roughness={0.4} metalness={0.15} />
          </mesh>
          <mesh position={[0.12, -0.52, 0.06]} castShadow receiveShadow>
            <boxGeometry args={[0.14 * fit.limb, 0.08, 0.28]} />
            <meshStandardMaterial color={shoeColor} roughness={0.4} metalness={0.15} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[-0.12, -0.5, 0]} castShadow>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.7} transparent opacity={0.4} />
          </mesh>
          <mesh position={[0.12, -0.5, 0]} castShadow>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.7} transparent opacity={0.4} />
          </mesh>
        </>
      )}

      {/* Floating garment labels */}
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
              background: "rgba(13,15,24,0.88)",
              color: "#fff",
              border: `1px solid ${label.color}`,
              backdropFilter: "blur(6px)",
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

function SceneContent(props: {
  items: MannequinGarment[]
  activeLayers: Record<string, boolean>
  fitStyle: FitStyle
}) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[3.5, 6, 2.5]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-2.5, 3, -2]} intensity={0.35} />
      <hemisphereLight args={["#b8c4e0", "#1a1e2e", 0.35]} />

      <MannequinFigure {...props} />

      <ContactShadows
        position={[0, -0.95, 0]}
        opacity={0.45}
        scale={4}
        blur={2.2}
        far={3}
      />
      <Environment preset="city" environmentIntensity={0.35} />
      <OrbitControls
        enablePan={false}
        minDistance={2.2}
        maxDistance={5.5}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 1.7}
        target={[0, 0.15, 0]}
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 pointer-events-none">
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--sky)", borderTopColor: "transparent" }}
      />
      <p className="text-[11px] text-muted-foreground font-medium">
        Loading 3D mannequin…
      </p>
    </div>
  )
}

function ErrorOverlay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 px-6 text-center">
      <p className="text-sm font-bold text-white">3D preview unavailable</p>
      <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 px-6 text-center">
      <p className="text-sm font-bold text-white">No garments to display</p>
      <p className="text-[11px] text-muted-foreground">
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
    // Soft timeout so a hung WebGL init still surfaces loading → ready/error UX
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
      {status === "error" && <ErrorOverlay message={errorMsg} onRetry={retry} />}
      {status !== "error" && !anyLayerVisible && items.length === 0 && <EmptyOverlay />}
      {status !== "error" && items.length > 0 && !anyLayerVisible && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-xl text-[10px] font-semibold"
          style={{ background: "rgba(13,15,24,0.85)", color: "var(--muted-foreground)" }}
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
            camera={{ position: [0, 0.55, 3.4], fov: 38, near: 0.1, far: 40 }}
            gl={{ antialias: true, alpha: true, powerPreference: "default" }}
            onCreated={() => setStatus("ready")}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 360,
              touchAction: "none",
              background: "transparent",
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

      <p className="absolute bottom-12 left-0 right-0 text-center text-[9px] text-muted-foreground/70 pointer-events-none">
        Drag to orbit · Pinch/scroll to zoom
      </p>
    </div>
  )
}
