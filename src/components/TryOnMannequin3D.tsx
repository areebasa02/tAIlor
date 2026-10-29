import { Suspense, useEffect, useMemo, useState, Component, type ReactNode } from "react"
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

/** mannequin.js BODY_COLORS — peach matte studio figure */
const SKIN_HEAD = "#faebd7" // antiquewhite
const SKIN_LIMB = "#faebd7"
const SKIN_TORSO = "#ffe4c4" // bisque
const SKIN_PELVIS = "#faebd7"
const JOINT = "#deb887" // burlywood
const SHOE_DEFAULT = "#808080"

const MAT = { roughness: 0.72, metalness: 0.02 } as const

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

function Mat({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      {...MAT}
      transparent={opacity < 1}
      opacity={opacity}
    />
  )
}

/** Rounded limb segment (capsule), mannequin.js LimbShape aesthetic */
function Seg({
  radius,
  length,
  position,
  rotation,
  color,
  opacity = 1,
}: {
  radius: number
  length: number
  position: [number, number, number]
  rotation?: [number, number, number]
  color: string
  opacity?: number
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <capsuleGeometry args={[radius, length, 6, 12]} />
      <Mat color={color} opacity={opacity} />
    </mesh>
  )
}

function Ball({
  radius,
  position,
  color = JOINT,
}: {
  radius: number
  position: [number, number, number]
  color?: string
}) {
  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[radius, 16, 16]} />
      <Mat color={color} />
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

  // Garment tints clothing segments; skin shows when layer off
  const torsoColor = showOuter
    ? outer!.color
    : showTop
      ? top!.color
      : SKIN_TORSO
  const sleeveColor = showOuter
    ? outer!.color
    : showTop
      ? top!.color
      : SKIN_LIMB
  const pelvisColor = showBottom ? bottom!.color : SKIN_PELVIS
  const legColor = showBottom ? bottom!.color : SKIN_LIMB
  const shoeColor = showShoes ? shoes!.color : SHOE_DEFAULT
  const torsoOpacity = showTop || showOuter ? 1 : 1
  const legOpacity = 1

  const labelItems = useMemo(() => {
    const labels: { name: string; position: [number, number, number]; color: string }[] = []
    if (showOuter && outer) {
      labels.push({ name: outer.name, position: [1.05, 1.2, 0], color: outer.color })
    } else if (showTop && top) {
      labels.push({ name: top.name, position: [1.0, 1.1, 0], color: top.color })
    }
    if (showBottom && bottom) {
      labels.push({ name: bottom.name, position: [0.95, 0.2, 0], color: bottom.color })
    }
    if (showShoes && shoes) {
      labels.push({ name: shoes.name, position: [0.85, -0.85, 0], color: shoes.color })
    }
    return labels
  }, [showOuter, showTop, showBottom, showShoes, outer, top, bottom, shoes])

  // Ground contact ≈ y = 0 for feet bottoms after group offset
  const y0 = 0.02

  return (
    <group position={[0, y0, 0]}>
      {/* —— Head —— */}
      <mesh position={[0, 1.68, 0]} scale={[1, 1.12, 0.95]} castShadow>
        <sphereGeometry args={[0.135, 24, 20]} />
        <Mat color={SKIN_HEAD} />
      </mesh>
      <Seg radius={0.045} length={0.06} position={[0, 1.5, 0]} color={SKIN_LIMB} />
      <Ball radius={0.055} position={[0, 1.44, 0]} />

      {/* —— Torso (Top / Outerwear) —— */}
      <group scale={[fit.torsoX, 1, fit.torsoZ]}>
        {/* Chest */}
        <mesh position={[0, 1.22, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.17, 0.28, 8, 16]} />
          <Mat color={torsoColor} opacity={torsoOpacity} />
        </mesh>
        {/* Slight chest breadth */}
        <mesh position={[0, 1.28, 0.02]} scale={[1.15, 0.85, 0.9]} castShadow>
          <sphereGeometry args={[0.14, 16, 14]} />
          <Mat color={torsoColor} opacity={torsoOpacity} />
        </mesh>
        {/* Abdomen */}
        <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.14, 0.12, 6, 14]} />
          <Mat color={torsoColor} opacity={torsoOpacity} />
        </mesh>
      </group>

      {/* Outerwear volume — soft coat shell when outerwear layer on */}
      {showOuter && (
        <group scale={[fit.torsoX * 1.14, 1.04, fit.torsoZ * 1.2]}>
          <mesh position={[0, 1.12, 0]} castShadow>
            <capsuleGeometry args={[0.2, 0.42, 8, 16]} />
            <meshStandardMaterial
              color={outer!.color}
              roughness={0.68}
              metalness={0.04}
              transparent
              opacity={0.88}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}

      {/* —— Pelvis —— */}
      <group scale={[fit.hipX, 1, fit.hipZ]}>
        <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
          <sphereGeometry args={[0.155, 20, 16]} />
          <Mat color={pelvisColor} opacity={legOpacity} />
        </mesh>
      </group>

      {/* —— Arms —— */}
      {([-1, 1] as const).map((side) => {
        const sx = side
        const shoulder: [number, number, number] = [sx * 0.26 * fit.torsoX, 1.34, 0]
        const upperMid: [number, number, number] = [sx * 0.38 * fit.limb, 1.08, 0.02]
        const elbow: [number, number, number] = [sx * 0.44 * fit.limb, 0.86, 0.04]
        const foreMid: [number, number, number] = [sx * 0.48 * fit.limb, 0.64, 0.06]
        const wrist: [number, number, number] = [sx * 0.5 * fit.limb, 0.44, 0.06]
        const hand: [number, number, number] = [sx * 0.5 * fit.limb, 0.34, 0.08]
        const zRot = sx * 0.22
        return (
          <group key={`arm-${side}`}>
            <Ball radius={0.055 * fit.limb} position={shoulder} />
            <Seg
              radius={0.048 * fit.limb}
              length={0.26}
              position={upperMid}
              rotation={[0.05, 0, zRot]}
              color={sleeveColor}
            />
            <Ball radius={0.045 * fit.limb} position={elbow} />
            <Seg
              radius={0.04 * fit.limb}
              length={0.22}
              position={foreMid}
              rotation={[0.08, 0, zRot * 0.5]}
              color={SKIN_LIMB}
            />
            <Ball radius={0.038 * fit.limb} position={wrist} />
            <mesh position={hand} castShadow>
              <sphereGeometry args={[0.048 * fit.limb, 12, 12]} />
              <Mat color={SKIN_LIMB} />
            </mesh>
          </group>
        )
      })}

      {/* —— Legs —— */}
      {([-1, 1] as const).map((side) => {
        const sx = side
        const hip: [number, number, number] = [sx * 0.1 * fit.hipX, 0.62, 0]
        const thigh: [number, number, number] = [sx * 0.11 * fit.hipX, 0.36, 0]
        const knee: [number, number, number] = [sx * 0.11 * fit.hipX, 0.12, 0]
        const shin: [number, number, number] = [sx * 0.11 * fit.hipX, -0.12, 0]
        const ankle: [number, number, number] = [sx * 0.11 * fit.hipX, -0.34, 0.01]
        const lr = 0.07 * fit.limb
        return (
          <group key={`leg-${side}`}>
            <Ball radius={0.06 * fit.limb} position={hip} />
            <Seg
              radius={lr}
              length={0.32}
              position={thigh}
              color={legColor}
              opacity={legOpacity}
            />
            <Ball radius={0.05 * fit.limb} position={knee} />
            <Seg
              radius={0.055 * fit.limb}
              length={0.28}
              position={shin}
              color={legColor}
              opacity={legOpacity}
            />
            <Ball radius={0.042 * fit.limb} position={ankle} />
            {/* Feet / shoes */}
            {showShoes ? (
              <mesh
                position={[sx * 0.11 * fit.hipX, -0.42, 0.06]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.1 * fit.limb, 0.06, 0.22]} />
                <meshStandardMaterial
                  color={shoeColor}
                  roughness={0.55}
                  metalness={0.08}
                />
              </mesh>
            ) : (
              <mesh
                position={[sx * 0.11 * fit.hipX, -0.4, 0.05]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.09 * fit.limb, 0.05, 0.18]} />
                <Mat color={SHOE_DEFAULT} />
              </mesh>
            )}
          </group>
        )
      })}

      {/* Garment labels */}
      {labelItems.map((label) => (
        <Html
          key={label.name}
          position={label.position}
          distanceFactor={6}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            className="px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap shadow-md"
            style={{
              background: "rgba(255,255,255,0.92)",
              color: "#1a1a1a",
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

function StudioFloor() {
  return (
    <group>
      {/* Infinite-looking studio ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        receiveShadow
      >
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial color="#f2f2f4" roughness={0.92} metalness={0} />
      </mesh>
      {/* Soft backdrop wall fade */}
      <mesh position={[0, 2.2, -4]} receiveShadow>
        <planeGeometry args={[16, 8]} />
        <meshStandardMaterial color="#e8e8ec" roughness={1} metalness={0} />
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
      <color attach="background" args={["#f0f0f3"]} />
      <fog attach="fog" args={["#f0f0f3", 6, 14]} />

      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#ffffff", "#d0d0d8", 0.65]} />
      <directionalLight
        position={[3.2, 5.5, 2.8]}
        intensity={1.35}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={12}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={4}
        shadow-camera-bottom={-2}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-2.8, 2.5, -1.5]} intensity={0.35} />
      <directionalLight position={[0, 3, 4]} intensity={0.25} />

      <StudioFloor />
      <MannequinFigure {...props} />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.38}
        scale={5}
        blur={2.6}
        far={4}
        color="#6a6a78"
      />

      <OrbitControls
        enablePan={false}
        minDistance={2.4}
        maxDistance={5.8}
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 pointer-events-none bg-[#f0f0f3]/80">
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

function ErrorOverlay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 px-6 text-center bg-[#f0f0f3]">
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

function EmptyOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 px-6 text-center bg-[#f0f0f3]">
      <p className="text-sm font-bold text-neutral-800">No garments to display</p>
      <p className="text-[11px] text-neutral-500">
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
      {status === "error" && <ErrorOverlay message={errorMsg} onRetry={retry} />}
      {status !== "error" && !anyLayerVisible && items.length === 0 && <EmptyOverlay />}
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
        <CanvasErrorBoundary key={canvasKey} onError={handleError}>
          <Canvas
            shadows
            dpr={[1, 1.75]}
            camera={{ position: [1.1, 1.35, 3.2], fov: 36, near: 0.1, far: 40 }}
            gl={{ antialias: true, alpha: false, powerPreference: "default" }}
            onCreated={({ gl }) => {
              gl.setClearColor("#f0f0f3")
              setStatus("ready")
            }}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 360,
              touchAction: "none",
              background: "#f0f0f3",
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
