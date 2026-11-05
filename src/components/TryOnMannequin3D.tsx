/**
 * Synapp-exact anatomical doll mannequin.
 * CapsuleGeometry limbs + SphereGeometry ball joints, dual pec masses,
 * elongated oval head, pearl MeshPhysicalMaterial.
 * Garment layers tint clothing segments; body shape stays independent.
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

const PEARL = "#f5f3f0"
const STUDIO = "#e8e6ee"

const FIT: Record<
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

function Pearl({ color = PEARL, opacity = 1 }: { color?: string; opacity?: number }) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={0.22}
      metalness={0.02}
      clearcoat={0.7}
      clearcoatRoughness={0.18}
      sheen={0.25}
      sheenColor="#ffffff"
      sheenRoughness={0.35}
      reflectivity={0.55}
      envMapIntensity={0.45}
      transparent={opacity < 1}
      opacity={opacity}
    />
  )
}

/** High-segment capsule between two points (Synapp limb) */
function CapsuleBetween({
  from,
  to,
  radius,
  color,
  radial = 20,
}: {
  from: [number, number, number]
  to: [number, number, number]
  radius: number
  color: string
  radial?: number
}) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const dist = Math.hypot(dx, dy, dz)
  // Length = joint gap minus ball radii overlap — ends nest into spheres
  const length = Math.max(0.02, dist - radius * 0.35)
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ]
  const e = useMemo(() => {
    const dir = new THREE.Vector3(dx, dy, dz).normalize()
    return new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
    )
  }, [dx, dy, dz])

  return (
    <mesh position={mid} rotation={[e.x, e.y, e.z]} castShadow receiveShadow>
      <capsuleGeometry args={[radius, length, 8, radial]} />
      <Pearl color={color} />
    </mesh>
  )
}

function Ball({
  position,
  radius,
  color = PEARL,
  scale,
}: {
  position: [number, number, number]
  radius: number
  color?: string
  scale?: [number, number, number]
}) {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <sphereGeometry args={[radius, 28, 24]} />
      <Pearl color={color} />
    </mesh>
  )
}

function Mitten({
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
      {/* Palm mitt — short rounded capsule, no fingers */}
      <mesh castShadow position={[0, -0.02, 0.01]} rotation={[0.15, 0, 0]}>
        <capsuleGeometry args={[0.028, 0.035, 6, 14]} />
        <Pearl color={color} />
      </mesh>
      <mesh
        castShadow
        position={[side * 0.022, -0.01, 0.015]}
        rotation={[0.2, 0, side * 0.6]}
      >
        <capsuleGeometry args={[0.012, 0.018, 4, 10]} />
        <Pearl color={color} />
      </mesh>
    </group>
  )
}

function RoundedFoot({
  position,
  color,
}: {
  position: [number, number, number]
  color: string
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.02, 0.045]} scale={[0.9, 0.55, 1.35]}>
        <sphereGeometry args={[0.045, 20, 16]} />
        <Pearl color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.025, -0.02]} scale={[0.85, 0.7, 0.9]}>
        <sphereGeometry args={[0.032, 16, 14]} />
        <Pearl color={color} />
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
  const fit = FIT[fitStyle]
  const top = findItem(items, "Top")
  const bottom = findItem(items, "Bottom")
  const shoes = findItem(items, "Shoes")
  const outer = findItem(items, "Outerwear")

  const showTop = Boolean(activeLayers.Top && top)
  const showBottom = Boolean(activeLayers.Bottom && bottom)
  const showShoes = Boolean(activeLayers.Shoes && shoes)
  const showOuter = Boolean(activeLayers.Outerwear && outer)

  // Base mannequin always pearl; garments tint clothing segments
  const torsoC = showOuter ? outer!.color : showTop ? top!.color : PEARL
  const sleeveC = showOuter ? outer!.color : showTop ? top!.color : PEARL
  const legC = showBottom ? bottom!.color : PEARL
  const shoeC = showShoes ? shoes!.color : PEARL
  const pelvisC = showBottom ? bottom!.color : PEARL

  const ls = fit.limb

  // ~8-heads fashion proportions (head unit ≈ 0.21)
  // Joints always pearl (Synapp doll look); clothing colors on limb/torso volumes

  return (
    <group position={[0, 0.13, 0]}>
      {/* —— HEAD: elongated oval —— */}
      <Ball position={[0, 1.58, 0.01]} radius={0.105} scale={[0.9, 1.35, 0.92]} />

      {/* —— NECK: short thick cylinder/capsule —— */}
      <mesh position={[0, 1.42, 0]} castShadow>
        <capsuleGeometry args={[0.048, 0.055, 6, 16]} />
        <Pearl />
      </mesh>

      {/* —— TORSO —— */}
      <group scale={[fit.torsoX, 1, fit.torsoZ * 0.82]}>
        {/* Dual rounded pec masses */}
        <Ball
          position={[-0.07, 1.24, 0.055]}
          radius={0.095}
          color={torsoC}
          scale={[1.05, 0.85, 0.75]}
        />
        <Ball
          position={[0.07, 1.24, 0.055]}
          radius={0.095}
          color={torsoC}
          scale={[1.05, 0.85, 0.75]}
        />
        {/* Upper chest bridge behind pecs */}
        <Ball
          position={[0, 1.26, -0.01]}
          radius={0.12}
          color={torsoC}
          scale={[1.35, 0.75, 0.7]}
        />
        {/* Mid torso / ribcage tapering down */}
        <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.13, 0.14, 8, 20]} />
          <Pearl color={torsoC} />
        </mesh>
        {/* Waist — narrow V-taper */}
        <mesh position={[0, 0.88, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.095, 0.1, 8, 18]} />
          <Pearl color={torsoC} />
        </mesh>
      </group>

      {/* Outerwear shell */}
      {showOuter && (
        <group scale={[fit.torsoX * 1.12, 1.03, fit.torsoZ * 0.95]}>
          <mesh position={[0, 1.1, 0]} castShadow>
            <capsuleGeometry args={[0.17, 0.32, 8, 22]} />
            <Pearl color={outer!.color} opacity={0.92} />
          </mesh>
        </group>
      )}

      {/* —— PELVIS —— */}
      <group scale={[fit.hipX, 1, fit.hipZ * 0.9]}>
        <Ball
          position={[0, 0.7, 0]}
          radius={0.13}
          color={pelvisC}
          scale={[1.2, 0.75, 1]}
        />
      </group>

      {/* —— ARMS (A-pose) —— */}
      {([-1, 1] as const).map((side) => {
        const sh: [number, number, number] = [
          side * 0.22 * fit.torsoX,
          1.3,
          0.02,
        ]
        const el: [number, number, number] = [side * 0.4 * ls, 0.98, 0.04]
        const wr: [number, number, number] = [side * 0.48 * ls, 0.66, 0.05]
        const hd: [number, number, number] = [side * 0.5 * ls, 0.55, 0.06]
        return (
          <group key={`arm-${side}`}>
            <Ball position={sh} radius={0.058 * ls} color={PEARL} />
            <CapsuleBetween
              from={sh}
              to={el}
              radius={0.042 * ls}
              color={sleeveC}
            />
            <Ball position={el} radius={0.04 * ls} color={PEARL} />
            <CapsuleBetween
              from={el}
              to={wr}
              radius={0.034 * ls}
              color={PEARL}
            />
            <Ball position={wr} radius={0.032 * ls} color={PEARL} />
            <Mitten position={hd} side={side} s={ls} color={PEARL} />
          </group>
        )
      })}

      {/* —— LEGS —— */}
      {([-1, 1] as const).map((side) => {
        const hip: [number, number, number] = [
          side * 0.09 * fit.hipX,
          0.64,
          0,
        ]
        const knee: [number, number, number] = [
          side * 0.095 * fit.hipX,
          0.3,
          0.01,
        ]
        const ankle: [number, number, number] = [
          side * 0.09 * fit.hipX,
          -0.04,
          0.015,
        ]
        return (
          <group key={`leg-${side}`}>
            <Ball position={hip} radius={0.06 * ls} color={PEARL} />
            <CapsuleBetween
              from={hip}
              to={knee}
              radius={0.058 * ls}
              color={legC}
            />
            <Ball position={knee} radius={0.045 * ls} color={PEARL} />
            <CapsuleBetween
              from={knee}
              to={ankle}
              radius={0.042 * ls}
              color={legC}
            />
            <Ball position={ankle} radius={0.035 * ls} color={PEARL} />
            <RoundedFoot
              position={[side * 0.09 * fit.hipX, -0.12, 0.02]}
              color={shoeC}
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
        <meshStandardMaterial color="#ddd9e8" roughness={0.92} metalness={0} />
      </mesh>
      <mesh position={[0, 1.9, -4]}>
        <planeGeometry args={[16, 11]} />
        <meshStandardMaterial color={STUDIO} roughness={1} />
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
      <color attach="background" args={[STUDIO]} />
      <fog attach="fog" args={[STUDIO, 9, 18]} />

      {/* Soft diffuse Synapp studio */}
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#ffffff", "#c8c4d6", 0.55]} />
      <directionalLight
        position={[2.4, 5.5, 3]}
        intensity={0.75}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={14}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={4}
        shadow-camera-bottom={-2}
        shadow-bias={-0.00015}
      />
      <directionalLight position={[-2.5, 2.2, 1.5]} intensity={0.35} color="#efeaf8" />
      <directionalLight position={[0, 3, -2.5]} intensity={0.3} />
      {/* Soft fill for AO-like contact between segments */}
      <pointLight position={[0, 1.2, 1.5]} intensity={0.2} distance={4} />

      <Studio />
      <MannequinFigure {...props} />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.25}
        scale={5}
        blur={3}
        far={3.5}
        color="#5a5670"
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
      {status === "loading" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 pointer-events-none"
          style={{ background: `${STUDIO}cc` }}
        >
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--sky)", borderTopColor: "transparent" }}
          />
          <p className="text-[11px] text-neutral-500 font-medium">
            Loading 3D mannequin…
          </p>
        </div>
      )}
      {status === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 px-6 text-center"
          style={{ background: STUDIO }}
        >
          <p className="text-sm font-bold text-neutral-800">
            3D preview unavailable
          </p>
          <p className="text-[11px] text-neutral-500">{errorMsg}</p>
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
              position: [1.2, 1.05, 3.5],
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
              gl.setClearColor(STUDIO)
              gl.toneMapping = THREE.ACESFilmicToneMapping
              gl.toneMappingExposure = 1.1
              setStatus("ready")
            }}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 360,
              touchAction: "none",
              background: STUDIO,
            }}
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
