/**
 * Sculpted, customizable, articulated Designer Studio Mannequin.
 * Pure neutral sculpted form with PBR studio materials, body proportion morphs,
 * 10 interactive posable joints (1-tap presets + direct 3D dragging + sliders),
 * optional 3D face medallion, and clean gizmo-free WebGL snapshot capture for Cat-VTON.
 */
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react"
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { ContactShadows, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import type {
  JointAngles,
  MannequinBodyPreset,
  MannequinCustomization,
  MannequinJointId,
  MannequinMaterialId,
  MannequinPose,
} from "../types"

export interface TryOnMannequin3DProps {
  customization: MannequinCustomization
  pose: MannequinPose
  selectedJoint: MannequinJointId
  onSelectJoint: (joint: MannequinJointId) => void
  onChangeJoint: (joint: MannequinJointId, angles: JointAngles) => void
  facePreviewUrl?: string
  resetCameraNonce?: number
  onRegisterCapture?: (captureFn: () => Promise<string>) => void
  className?: string
  compact?: boolean
}

const STUDIO_BG = "#E8E5EE"

export const MANNEQUIN_MATERIALS: Record<
  MannequinMaterialId,
  {
    label: string
    color: string
    jointColor: string
    swatch: string
    roughness: number
    clearcoat: number
    metalness: number
  }
> = {
  porcelain: {
    label: "Porcelain",
    color: "#F3EFE8",
    jointColor: "#D6CFC5",
    swatch: "#F3EFE8",
    roughness: 0.34,
    clearcoat: 0.32,
    metalness: 0.04,
  },
  bisque: {
    label: "Fair Bisque",
    color: "#F2D4BF",
    jointColor: "#D3AE96",
    swatch: "#F2D4BF",
    roughness: 0.44,
    clearcoat: 0.14,
    metalness: 0.02,
  },
  sand: {
    label: "Warm Sand",
    color: "#DEB792",
    jointColor: "#B98E68",
    swatch: "#DEB792",
    roughness: 0.46,
    clearcoat: 0.12,
    metalness: 0.02,
  },
  tan: {
    label: "Golden Tan",
    color: "#C28B62",
    jointColor: "#9B6845",
    swatch: "#C28B62",
    roughness: 0.46,
    clearcoat: 0.12,
    metalness: 0.02,
  },
  espresso: {
    label: "Espresso",
    color: "#6B4432",
    jointColor: "#4E3022",
    swatch: "#6B4432",
    roughness: 0.45,
    clearcoat: 0.14,
    metalness: 0.03,
  },
  walnut: {
    label: "Walnut Wood",
    color: "#9B6A44",
    jointColor: "#CBB07A",
    swatch: "#9B6A44",
    roughness: 0.56,
    clearcoat: 0.18,
    metalness: 0.06,
  },
  charcoal: {
    label: "Charcoal Satin",
    color: "#383C4A",
    jointColor: "#A6AEC4",
    swatch: "#383C4A",
    roughness: 0.4,
    clearcoat: 0.24,
    metalness: 0.18,
  },
}

export const BODY_PRESET_VALUES: Record<
  MannequinBodyPreset,
  {
    label: string
    height: number
    shoulders: number
    chest: number
    waistHips: number
    limbBuild: number
  }
> = {
  petite: {
    label: "Petite",
    height: 0.92,
    shoulders: 0.92,
    chest: 0.93,
    waistHips: 0.94,
    limbBuild: 0.92,
  },
  standard: {
    label: "Standard",
    height: 1.0,
    shoulders: 1.0,
    chest: 1.0,
    waistHips: 1.0,
    limbBuild: 1.0,
  },
  athletic: {
    label: "Athletic",
    height: 1.03,
    shoulders: 1.12,
    chest: 1.08,
    waistHips: 0.98,
    limbBuild: 1.09,
  },
  curvy: {
    label: "Curvy",
    height: 0.98,
    shoulders: 0.96,
    chest: 1.11,
    waistHips: 1.16,
    limbBuild: 1.05,
  },
  tall: {
    label: "Tall / Broad",
    height: 1.08,
    shoulders: 1.1,
    chest: 1.06,
    waistHips: 1.04,
    limbBuild: 1.04,
  },
}

export const DEFAULT_CUSTOMIZATION: MannequinCustomization = {
  bodyPreset: "standard",
  height: 1.0,
  shoulders: 1.0,
  chest: 1.0,
  waistHips: 1.0,
  limbBuild: 1.0,
  materialId: "porcelain",
  includeMyFace: false,
}

export const JOINT_LABELS: Record<MannequinJointId, string> = {
  head: "Head",
  torso: "Torso & Spine",
  shoulderL: "Left Shoulder",
  shoulderR: "Right Shoulder",
  elbowL: "Left Elbow",
  elbowR: "Right Elbow",
  hipL: "Left Hip",
  hipR: "Right Hip",
  kneeL: "Left Knee",
  kneeR: "Right Knee",
}

export const JOINT_LIMITS: Record<
  MannequinJointId,
  { min: JointAngles; max: JointAngles }
> = {
  head: { min: [-0.45, -0.95, -0.35], max: [0.45, 0.95, 0.35] },
  torso: { min: [-0.35, -0.65, -0.35], max: [0.35, 0.65, 0.35] },
  shoulderL: { min: [-2.6, -1.2, -0.25], max: [0.9, 1.2, 2.75] },
  shoulderR: { min: [-2.6, -1.2, -2.75], max: [0.9, 1.2, 0.25] },
  elbowL: { min: [-2.35, -0.9, -0.55], max: [0.08, 0.9, 0.55] },
  elbowR: { min: [-2.35, -0.9, -0.55], max: [0.08, 0.9, 0.55] },
  hipL: { min: [-1.35, -0.55, -0.15], max: [0.75, 0.75, 0.95] },
  hipR: { min: [-1.35, -0.75, -0.95], max: [0.75, 0.55, 0.15] },
  kneeL: { min: [-0.05, -0.2, -0.15], max: [2.2, 0.2, 0.15] },
  kneeR: { min: [-0.05, -0.2, -0.15], max: [2.2, 0.2, 0.15] },
}

export function clampJointAngles(
  joint: MannequinJointId,
  angles: JointAngles,
): JointAngles {
  const { min, max } = JOINT_LIMITS[joint]
  return [
    THREE.MathUtils.clamp(angles[0], min[0], max[0]),
    THREE.MathUtils.clamp(angles[1], min[1], max[1]),
    THREE.MathUtils.clamp(angles[2], min[2], max[2]),
  ]
}

export type PosePresetId =
  | "classic"
  | "contrapposto"
  | "hands_on_hips"
  | "runway"
  | "streetwear"
  | "power"
  | "wave"

export const POSE_PRESETS: Record<
  PosePresetId,
  { label: string; emoji: string; pose: MannequinPose }
> = {
  classic: {
    label: "Classic Studio",
    emoji: "🧍",
    pose: {
      head: [0, 0, 0],
      torso: [0, 0, 0],
      shoulderL: [-0.04, 0, 0.16],
      shoulderR: [-0.04, 0, -0.16],
      elbowL: [-0.16, 0, 0],
      elbowR: [-0.16, 0, 0],
      hipL: [-0.02, 0.04, 0.06],
      hipR: [-0.02, -0.04, -0.06],
      kneeL: [0.04, 0, 0],
      kneeR: [0.04, 0, 0],
    },
  },
  contrapposto: {
    label: "Contrapposto",
    emoji: "✨",
    pose: {
      head: [-0.04, 0.18, -0.05],
      torso: [0.03, -0.14, 0.07],
      shoulderL: [0.1, 0.15, 0.32],
      shoulderR: [-0.14, 0.1, -0.2],
      elbowL: [-0.55, 0, 0],
      elbowR: [-0.34, 0, 0],
      hipL: [0.04, 0.06, 0.05],
      hipR: [-0.22, -0.08, -0.12],
      kneeL: [0.04, 0, 0],
      kneeR: [0.34, 0, 0],
    },
  },
  hands_on_hips: {
    label: "Hands on Hips",
    emoji: "💃",
    pose: {
      head: [-0.05, 0.08, -0.04],
      torso: [-0.04, -0.08, 0.03],
      shoulderL: [-0.05, -0.82, 0.72],
      shoulderR: [-0.05, 0.82, -0.72],
      elbowL: [-1.42, 0, 0],
      elbowR: [-1.42, 0, 0],
      hipL: [-0.06, 0.08, 0.12],
      hipR: [0.04, -0.06, -0.08],
      kneeL: [0.1, 0, 0],
      kneeR: [0.04, 0, 0],
    },
  },
  runway: {
    label: "Runway Walk",
    emoji: "👠",
    pose: {
      head: [-0.04, -0.14, 0.04],
      torso: [0.04, 0.18, -0.05],
      shoulderL: [0.22, 0, 0.18],
      shoulderR: [-0.28, -0.06, -0.18],
      elbowL: [-0.24, 0, 0],
      elbowR: [-0.4, 0, 0],
      hipL: [-0.42, 0.05, 0.05],
      hipR: [0.28, -0.05, -0.05],
      kneeL: [0.18, 0, 0],
      kneeR: [0.38, 0, 0],
    },
  },
  streetwear: {
    label: "Streetwear Lean",
    emoji: "🧥",
    pose: {
      head: [0.04, 0.22, -0.04],
      torso: [0.06, -0.2, 0.06],
      shoulderL: [-0.24, -0.4, 0.26],
      shoulderR: [0.1, 0.22, -0.22],
      elbowL: [-0.88, 0, 0],
      elbowR: [-0.42, 0, 0],
      hipL: [-0.16, 0.08, 0.1],
      hipR: [0.06, -0.06, -0.08],
      kneeL: [0.22, 0, 0],
      kneeR: [0.05, 0, 0],
    },
  },
  power: {
    label: "Power Stance",
    emoji: "⚡",
    pose: {
      head: [-0.08, 0, 0],
      torso: [-0.05, 0, 0],
      shoulderL: [-0.12, -0.35, 0.42],
      shoulderR: [-0.12, 0.35, -0.42],
      elbowL: [-0.58, 0, 0],
      elbowR: [-0.58, 0, 0],
      hipL: [-0.04, 0.1, 0.22],
      hipR: [-0.04, -0.1, -0.22],
      kneeL: [0.06, 0, 0],
      kneeR: [0.06, 0, 0],
    },
  },
  wave: {
    label: "Studio Wave",
    emoji: "👋",
    pose: {
      head: [-0.06, 0.12, 0.08],
      torso: [0.02, 0.12, -0.05],
      shoulderL: [-0.32, 0.15, 2.24],
      shoulderR: [0.08, 0.35, -0.24],
      elbowL: [-0.95, 0.2, 0.2],
      elbowR: [-0.52, 0, 0],
      hipL: [-0.14, 0.06, 0.08],
      hipR: [0.04, -0.05, -0.06],
      kneeL: [0.22, 0, 0],
      kneeR: [0.04, 0, 0],
    },
  },
}

export const DEFAULT_POSE: MannequinPose = POSE_PRESETS.classic.pose

export function createRandomPose(): MannequinPose {
  const rand = (min: number, max: number) => min + Math.random() * (max - min)
  return {
    head: [rand(-0.18, 0.14), rand(-0.35, 0.35), rand(-0.14, 0.14)],
    torso: [rand(-0.14, 0.14), rand(-0.28, 0.28), rand(-0.14, 0.14)],
    shoulderL: [rand(-1.25, 0.35), rand(-0.55, 0.45), rand(0.16, 1.85)],
    shoulderR: [rand(-1.25, 0.35), rand(-0.45, 0.55), rand(-1.85, -0.16)],
    elbowL: [rand(-1.6, -0.12), rand(-0.25, 0.25), 0],
    elbowR: [rand(-1.6, -0.12), rand(-0.25, 0.25), 0],
    hipL: [rand(-0.48, 0.22), rand(-0.08, 0.16), rand(0.04, 0.32)],
    hipR: [rand(-0.48, 0.22), rand(-0.16, 0.08), rand(-0.32, -0.04)],
    kneeL: [rand(0.02, 0.65), 0, 0],
    kneeR: [rand(0.02, 0.65), 0, 0],
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function createLatheGeometry(
  height: number,
  pts: [number, number][],
  segments = 36,
  radial = 32,
): THREE.LatheGeometry {
  const vectorPts: THREE.Vector2[] = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    let radius = pts[pts.length - 1][1]
    for (let j = 0; j < pts.length - 1; j += 1) {
      const [t0, r0] = pts[j]
      const [t1, r1] = pts[j + 1]
      if (t >= t0 && t <= t1) {
        const u = (t - t0) / Math.max(0.0001, t1 - t0)
        const s = u * u * (3 - 2 * u)
        radius = r0 + (r1 - r0) * s
        break
      }
    }
    vectorPts.push(new THREE.Vector2(Math.max(0.004, radius), (t - 0.5) * height))
  }
  const geo = new THREE.LatheGeometry(vectorPts, radial)
  geo.computeVertexNormals()
  return geo
}

/**
 * Single continuous sculpted fashion mannequin head:
 * clean cranium dome, subtle temple narrowing, gentle brow arch & sleek
 * minimalist nose ridge, and a continuous tapered jawline into a soft chin.
 */
function createSculptedHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 56, 42)
  const pos = geo.attributes.position

  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i)
    const vy = pos.getY(i)
    const vz = pos.getZ(i)

    let x = vx * 0.074
    let y = vy * 0.106
    let z = vz * 0.088

    // Taper width softly along lower jaw toward chin
    const lowerT = smoothstep(0.06, -0.96, vy)
    x *= 1 - 0.34 * lowerT

    // Cheekbone & subtle temple contouring on front sides
    const templeMask =
      Math.exp(-Math.pow((vy - 0.24) / 0.25, 2)) *
      smoothstep(0.38, 0.9, Math.abs(vx)) *
      smoothstep(0.02, 0.62, vz)
    x *= 1 - 0.048 * templeMask

    // Gentle chin elongation forward & down
    const chinMask =
      smoothstep(-0.26, -0.82, vy) *
      smoothstep(0.5, 0.96, vz) *
      (1 - smoothstep(0.0, 0.54, Math.abs(vx)))
    z += 0.011 * chinMask
    y -= 0.006 * chinMask

    // Clean under-chin / nape tuck toward the neck column
    const underMask =
      smoothstep(-0.34, -0.92, vy) * smoothstep(0.36, -0.25, vz)
    y += 0.007 * underMask
    z += 0.007 * smoothstep(-0.36, -0.9, vy) * smoothstep(-0.35, -0.98, vz)
    if (vz < -0.15) {
      z *= 1 - 0.065 * smoothstep(0.15, -0.82, vy)
    }

    // Minimalist sculptural brow shelf + soft eye orbital plane + slim nose bridge
    const centerLine = Math.exp(-Math.pow(vx / 0.145, 2))
    const frontFace = smoothstep(0.52, 0.92, vz)
    const noseSpan = smoothstep(-0.28, -0.14, vy) * smoothstep(0.18, -0.02, vy)
    z += 0.011 * centerLine * frontFace * noseSpan

    const browMask =
      Math.exp(-Math.pow((vy - 0.14) / 0.1, 2)) *
      smoothstep(0.18, 0.72, vz) *
      (1 - smoothstep(0.28, 0.78, Math.abs(vx)))
    z += 0.004 * browMask

    const orbitalMask =
      Math.exp(-Math.pow((vy - 0.02) / 0.085, 2)) *
      Math.exp(-Math.pow((Math.abs(vx) - 0.31) / 0.17, 2)) *
      smoothstep(0.5, 0.9, vz)
    z -= 0.0045 * orbitalMask

    pos.setXYZ(i, x, y, z)
  }

  geo.computeVertexNormals()
  return geo
}

/**
 * Single continuous sculpted upper torso (waist -> ribcage -> chest/back -> shoulder collar).
 * Uses open CylinderGeometry deformed smoothly from (vx, vz, t) so UV seam normals match cleanly.
 */
function createSculptedTorsoGeometry(
  height: number,
  shouldersScale: number,
  chestScale: number,
  waistScale: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 48, 48, true)
  const pos = geo.attributes.position

  const profile: [number, number, number][] = [
    [0.0, 0.095 * waistScale, 0.068 * waistScale],
    [0.16, 0.102 * waistScale, 0.072 * waistScale],
    [0.36, 0.122 * (waistScale * 0.4 + chestScale * 0.6), 0.084 * chestScale],
    [0.6, 0.146 * chestScale, 0.092 * chestScale],
    [0.78, 0.166 * shouldersScale, 0.084 * chestScale],
    [0.88, 0.148 * shouldersScale, 0.072 * chestScale],
    [0.95, 0.074, 0.056],
    [1.0, 0.044, 0.044],
  ]

  const sampleProfile = (t: number): [number, number] => {
    for (let j = 0; j < profile.length - 1; j += 1) {
      const [t0, rx0, rz0] = profile[j]
      const [t1, rx1, rz1] = profile[j + 1]
      if (t >= t0 && t <= t1) {
        const u = (t - t0) / Math.max(0.0001, t1 - t0)
        const s = u * u * (3 - 2 * u)
        return [rx0 + (rx1 - rx0) * s, rz0 + (rz1 - rz0) * s]
      }
    }
    const last = profile[profile.length - 1]
    return [last[1], last[2]]
  }

  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i)
    const vy = pos.getY(i)
    const vz = pos.getZ(i)
    const t = THREE.MathUtils.clamp(vy + 0.5, 0, 1)
    const lenXZ = Math.hypot(vx, vz) || 1
    const nx = vx / lenXZ
    const nz = vz / lenXZ

    const [rx, rz] = sampleProfile(t)
    let x = nx * rx
    let y = (t - 0.5) * height
    let z = nz * rz

    // Smooth pectoral contour on front (+z) chest without overlapping extra meshes
    const pecHeight = Math.exp(-Math.pow((t - 0.63) / 0.14, 2))
    const pecFront = smoothstep(0.15, 0.85, nz)
    z += 0.022 * chestScale * pecHeight * pecFront

    // Subtle spinal groove & shoulder blade fullness on back (-z)
    const backMask = smoothstep(-0.35, -0.95, nz)
    const spineCenter = Math.exp(-Math.pow(nx / 0.18, 2))
    const scapulaSides = Math.exp(-Math.pow((Math.abs(nx) - 0.45) / 0.24, 2))
    const upperBackH = smoothstep(0.28, 0.72, t) * smoothstep(0.95, 0.75, t)
    z += (0.007 * backMask * spineCenter - 0.008 * backMask * scapulaSides) * upperBackH

    // Gentle trapezius / shoulder slope near collar
    const collarSlope = smoothstep(0.76, 0.94, t) * smoothstep(0.35, 0.92, Math.abs(nx))
    y -= 0.016 * collarSlope

    pos.setXYZ(i, x, y, z)
  }

  geo.computeVertexNormals()
  return geo
}

/**
 * Single continuous sculpted pelvis/hip form connecting smoothly into waist & thighs.
 */
function createSculptedPelvisGeometry(
  height: number,
  waistScale: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 44, 28, true)
  const pos = geo.attributes.position

  const profile: [number, number, number][] = [
    [0.0, 0.088 * waistScale, 0.056 * waistScale],
    [0.24, 0.136 * waistScale, 0.082 * waistScale],
    [0.54, 0.144 * waistScale, 0.086 * waistScale],
    [0.8, 0.122 * waistScale, 0.076 * waistScale],
    [1.0, 0.095 * waistScale, 0.068 * waistScale],
  ]

  const sampleProfile = (t: number): [number, number] => {
    for (let j = 0; j < profile.length - 1; j += 1) {
      const [t0, rx0, rz0] = profile[j]
      const [t1, rx1, rz1] = profile[j + 1]
      if (t >= t0 && t <= t1) {
        const u = (t - t0) / Math.max(0.0001, t1 - t0)
        const s = u * u * (3 - 2 * u)
        return [rx0 + (rx1 - rx0) * s, rz0 + (rz1 - rz0) * s]
      }
    }
    const last = profile[profile.length - 1]
    return [last[1], last[2]]
  }

  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i)
    const vy = pos.getY(i)
    const vz = pos.getZ(i)
    const t = THREE.MathUtils.clamp(vy + 0.5, 0, 1)
    const lenXZ = Math.hypot(vx, vz) || 1
    const nx = vx / lenXZ
    const nz = vz / lenXZ

    const [rx, rz] = sampleProfile(t)
    const x = nx * rx
    const y = (t - 0.5) * height
    let z = nz * rz

    // Natural posterior contour without lumpy spheres
    const gluteH = Math.exp(-Math.pow((t - 0.36) / 0.24, 2))
    const gluteBack = smoothstep(-0.2, -0.88, nz)
    z -= 0.018 * waistScale * gluteH * gluteBack

    pos.setXYZ(i, x, y, z)
  }

  geo.computeVertexNormals()
  return geo
}

function createFeatheredFaceTexture(imageUrl: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const size = 512
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        resolve(null)
        return
      }
      const minDim = Math.min(img.width, img.height)
      const sx = (img.width - minDim) / 2
      const sy = (img.height - minDim) / 2
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)

      // Soft oval feather mask so edges blend seamlessly into the sculpted head
      ctx.globalCompositeOperation = "destination-in"
      const mask = ctx.createRadialGradient(
        size / 2,
        size / 2,
        size * 0.24,
        size / 2,
        size / 2,
        size * 0.48,
      )
      mask.addColorStop(0, "rgba(0,0,0,1)")
      mask.addColorStop(0.75, "rgba(0,0,0,0.88)")
      mask.addColorStop(1, "rgba(0,0,0,0)")
      ctx.fillStyle = mask
      ctx.fillRect(0, 0, size, size)

      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.needsUpdate = true
      resolve(tex)
    }
    img.onerror = () => resolve(null)
    img.src = imageUrl
  })
}

function CurvedArrowArc({
  radius,
  tubeRadius,
  color,
  opacity,
  arc = Math.PI * 0.72,
}: {
  radius: number
  tubeRadius: number
  color: string
  opacity: number
  arc?: number
}) {
  const coneRadius = tubeRadius * 3.1
  const coneHeight = tubeRadius * 6.5
  const endX = radius * Math.cos(arc)
  const endY = radius * Math.sin(arc)

  return (
    <group>
      <mesh raycast={() => null}>
        <torusGeometry args={[radius, tubeRadius, 12, 32, arc]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[radius, 0, 0]}
        rotation={[0, 0, Math.PI]}
        raycast={() => null}
      >
        <coneGeometry args={[coneRadius, coneHeight, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[endX, endY, 0]}
        rotation={[0, 0, arc]}
        raycast={() => null}
      >
        <coneGeometry args={[coneRadius, coneHeight, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function JointGuideArrows({
  jointId,
  baseRadius,
  isDragging,
}: {
  jointId: MannequinJointId
  baseRadius: number
  isDragging: boolean
}) {
  const isAxial = jointId === "head" || jointId === "torso"
  const arc = Math.PI * 0.72
  const arcRadius = Math.max(baseRadius * 1.78, 0.088)
  const tubeRadius = isDragging ? 0.0052 : 0.0038
  const opacity = isDragging ? 0.98 : 0.8
  const scale = isDragging ? 1.12 : 1.0
  const alignLen = arcRadius * 0.92
  const alignColor = isDragging ? "#FFCB44" : "#FFFFFF"

  return (
    <group scale={scale}>
      {/* Pitch / Bend curved arrow arc in vertical YZ plane (Pink #CE005A) */}
      <group rotation={[0, -Math.PI / 2, 0]}>
        <group rotation={[0, 0, -arc / 2]}>
          <CurvedArrowArc
            radius={arcRadius}
            tubeRadius={tubeRadius}
            color="#CE005A"
            opacity={opacity}
            arc={arc}
          />
        </group>
      </group>

      {/* Swing / Twist curved arrow arc (Turquoise #00B8D4) */}
      {isAxial ? (
        <group rotation={[Math.PI / 2, 0, 0]}>
          <group rotation={[0, 0, Math.PI / 2 - arc / 2]}>
            <CurvedArrowArc
              radius={arcRadius * 1.04}
              tubeRadius={tubeRadius}
              color="#00B8D4"
              opacity={opacity}
              arc={arc}
            />
          </group>
        </group>
      ) : (
        <group rotation={[0, 0, -Math.PI / 2 - arc / 2]}>
          <CurvedArrowArc
            radius={arcRadius * 1.04}
            tubeRadius={tubeRadius}
            color="#00B8D4"
            opacity={opacity}
            arc={arc}
          />
        </group>
      )}

      {/* Active Alignment Direction Pointer (Gold while dragging, crisp white when selected) */}
      {isAxial ? (
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh position={[0, arcRadius * 0.72, 0]} raycast={() => null}>
            <cylinderGeometry args={[tubeRadius * 0.95, tubeRadius * 0.95, alignLen, 10]} />
            <meshBasicMaterial
              color={alignColor}
              transparent
              opacity={opacity}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh
            position={[0, arcRadius * 0.72 + alignLen * 0.52, 0]}
            raycast={() => null}
          >
            <coneGeometry args={[tubeRadius * 3.1, tubeRadius * 6.8, 12]} />
            <meshBasicMaterial
              color={alignColor}
              transparent
              opacity={opacity}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      ) : (
        <group position={[0, 0, baseRadius * 0.95]} rotation={[0, 0, Math.PI]}>
          <mesh position={[0, alignLen * 0.58, 0]} raycast={() => null}>
            <cylinderGeometry args={[tubeRadius * 0.95, tubeRadius * 0.95, alignLen, 10]} />
            <meshBasicMaterial
              color={alignColor}
              transparent
              opacity={opacity}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, alignLen * 1.12, 0]} raycast={() => null}>
            <coneGeometry args={[tubeRadius * 3.1, tubeRadius * 6.8, 12]} />
            <meshBasicMaterial
              color={alignColor}
              transparent
              opacity={opacity}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  )
}

function JointHandle({
  jointId,
  radius = 0.055,
  selected,
  isDragging,
  gizmosVisible,
  onStartDrag,
}: {
  jointId: MannequinJointId
  radius?: number
  selected: boolean
  isDragging: boolean
  gizmosVisible: boolean
  onStartDrag: (jointId: MannequinJointId, e: ThreeEvent<PointerEvent>) => void
}) {
  const [hovered, setHovered] = useState(false)
  if (!gizmosVisible) return null
  const active = selected || hovered || isDragging
  return (
    <group>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = "grab"
        }}
        onPointerOut={(e) => {
          e.stopPropagation()
          setHovered(false)
          document.body.style.cursor = ""
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          onStartDrag(jointId, e)
        }}
      >
        <sphereGeometry args={[Math.max(radius * 1.55, 0.072), 14, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh raycast={() => null}>
        <sphereGeometry args={[radius * (active ? 1.16 : 1.03), 16, 14]} />
        <meshBasicMaterial
          color={isDragging ? "#FFCB44" : selected ? "#CE005A" : hovered ? "#F97316" : "#69D5E6"}
          transparent
          opacity={isDragging ? 0.62 : selected ? 0.48 : hovered ? 0.38 : 0.2}
          depthWrite={false}
        />
      </mesh>
      {(selected || isDragging) && (
        <JointGuideArrows
          jointId={jointId}
          baseRadius={radius}
          isDragging={isDragging}
        />
      )}
    </group>
  )
}

interface ArticulatedMannequinProps {
  customization: MannequinCustomization
  pose: MannequinPose
  selectedJoint: MannequinJointId
  draggingJoint: MannequinJointId | null
  gizmosVisible: boolean
  onStartDrag: (jointId: MannequinJointId, e: ThreeEvent<PointerEvent>) => void
  facePreviewUrl?: string
  headAnchorRef: React.MutableRefObject<THREE.Object3D | null>
}

function ArticulatedMannequin({
  customization,
  pose,
  selectedJoint,
  draggingJoint,
  gizmosVisible,
  onStartDrag,
  facePreviewUrl,
  headAnchorRef,
}: ArticulatedMannequinProps) {
  const matSpec =
    MANNEQUIN_MATERIALS[customization.materialId] ||
    MANNEQUIN_MATERIALS.porcelain

  const bodyMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: matSpec.color,
        roughness: matSpec.roughness,
        metalness: matSpec.metalness,
        clearcoat: matSpec.clearcoat,
        clearcoatRoughness: 0.35,
      }),
    [matSpec],
  )
  const jointMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: matSpec.jointColor,
        roughness: 0.28,
        metalness: 0.36,
        clearcoat: 0.35,
      }),
    [matSpec],
  )

  useEffect(() => {
    return () => {
      bodyMat.dispose()
      jointMat.dispose()
    }
  }, [bodyMat, jointMat])

  const [faceTexture, setFaceTexture] = useState<THREE.Texture | null>(null)
  const effectiveFaceUrl = customization.includeMyFace
    ? customization.faceImageData || facePreviewUrl
    : undefined

  useEffect(() => {
    let active = true
    let created: THREE.Texture | null = null
    if (!effectiveFaceUrl) {
      setFaceTexture(null)
      return
    }
    void createFeatheredFaceTexture(effectiveFaceUrl).then((tex) => {
      if (!active) {
        tex?.dispose()
        return
      }
      created = tex
      setFaceTexture(tex)
    })
    return () => {
      active = false
      if (created) created.dispose()
    }
  }, [effectiveFaceUrl])

  const { height, shoulders, chest, waistHips, limbBuild } = customization

  // Single-mesh sculpted body parts parameterized smoothly by user proportions
  const bodyGeometries = useMemo(() => {
    const pelvis = createSculptedPelvisGeometry(0.19, waistHips)
    const torso = createSculptedTorsoGeometry(0.43, shoulders, chest, waistHips)
    return { pelvis, torso }
  }, [shoulders, chest, waistHips])

  useEffect(() => {
    return () => {
      bodyGeometries.pelvis.dispose()
      bodyGeometries.torso.dispose()
    }
  }, [bodyGeometries])

  // Static sculpted head & sleek 8-head limb lathe geometries
  const staticGeometries = useMemo(() => {
    const head = createSculptedHeadGeometry()
    const neck = createLatheGeometry(0.095, [
      [0.0, 0.044],
      [0.45, 0.039],
      [1.0, 0.042],
    ])
    const upperArm = createLatheGeometry(0.285, [
      [0.0, 0.029],
      [0.45, 0.036],
      [0.84, 0.041],
      [1.0, 0.039],
    ])
    const forearm = createLatheGeometry(0.255, [
      [0.0, 0.021],
      [0.36, 0.025],
      [0.74, 0.032],
      [1.0, 0.029],
    ])
    const thigh = createLatheGeometry(0.43, [
      [0.0, 0.037],
      [0.35, 0.052],
      [0.74, 0.065],
      [1.0, 0.056],
    ])
    const calf = createLatheGeometry(0.43, [
      [0.0, 0.024],
      [0.28, 0.029],
      [0.68, 0.042],
      [0.88, 0.039],
      [1.0, 0.036],
    ])
    return { head, neck, upperArm, forearm, thigh, calf }
  }, [])

  useEffect(() => {
    return () => {
      Object.values(staticGeometries).forEach((g) => g.dispose())
    }
  }, [staticGeometries])

  // Bone group refs for smooth per-frame lerp
  const boneRefs = useRef<Record<MannequinJointId, THREE.Group | null>>({
    head: null,
    torso: null,
    shoulderL: null,
    shoulderR: null,
    elbowL: null,
    elbowR: null,
    hipL: null,
    hipR: null,
    kneeL: null,
    kneeR: null,
  })

  useFrame((_, delta) => {
    const alpha = 1 - Math.exp(-Math.min(delta, 0.1) * 14)
    ;(Object.keys(boneRefs.current) as MannequinJointId[]).forEach((jointId) => {
      const group = boneRefs.current[jointId]
      const target = pose[jointId]
      if (!group || !target) return
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, target[0], alpha)
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, target[1], alpha)
      group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, target[2], alpha)
    })
  })

  const hipOffsetX = 0.088 * waistHips
  const shoulderOffsetX = 0.168 * shoulders

  const renderArm = (side: 1 | -1) => {
    const shJoint: MannequinJointId = side === 1 ? "shoulderL" : "shoulderR"
    const elJoint: MannequinJointId = side === 1 ? "elbowL" : "elbowR"
    return (
      <group
        key={`arm-${side}`}
        position={[side * shoulderOffsetX, 0.348, 0.002]}
        ref={(el) => {
          boneRefs.current[shJoint] = el
        }}
      >
        <mesh material={jointMat} castShadow>
          <sphereGeometry args={[0.04 * limbBuild, 24, 18]} />
        </mesh>
        <JointHandle
          jointId={shJoint}
          radius={0.048}
          selected={selectedJoint === shJoint}
          isDragging={draggingJoint === shJoint}
          gizmosVisible={gizmosVisible}
          onStartDrag={onStartDrag}
        />

        {/* Upper arm */}
        <mesh
          geometry={staticGeometries.upperArm}
          material={bodyMat}
          position={[0, -0.15, 0]}
          scale={[limbBuild, 1, limbBuild]}
          castShadow
          receiveShadow
        />

        {/* Elbow joint */}
        <group
          position={[0, -0.295, 0]}
          ref={(el) => {
            boneRefs.current[elJoint] = el
          }}
        >
          <mesh material={jointMat} castShadow>
            <sphereGeometry args={[0.03 * limbBuild, 20, 16]} />
          </mesh>
          <JointHandle
            jointId={elJoint}
            radius={0.04}
            selected={selectedJoint === elJoint}
            isDragging={draggingJoint === elJoint}
            gizmosVisible={gizmosVisible}
            onStartDrag={onStartDrag}
          />

          {/* Forearm */}
          <mesh
            geometry={staticGeometries.forearm}
            material={bodyMat}
            position={[0, -0.134, 0]}
            scale={[limbBuild, 1, limbBuild]}
            castShadow
            receiveShadow
          />

          {/* Wrist & Refined Sculpted Hand */}
          <group position={[0, -0.265, 0]} scale={[limbBuild, limbBuild, limbBuild]}>
            <mesh material={jointMat} castShadow>
              <sphereGeometry args={[0.021, 16, 14]} />
            </mesh>
            <mesh
              material={bodyMat}
              position={[0, -0.04, 0.004]}
              scale={[0.68, 1.32, 0.42]}
              castShadow
            >
              <sphereGeometry args={[0.028, 18, 14]} />
            </mesh>
            <mesh
              material={bodyMat}
              position={[0, -0.088, 0.008]}
              scale={[0.56, 1.25, 0.34]}
              castShadow
            >
              <sphereGeometry args={[0.022, 14, 12]} />
            </mesh>
            <mesh
              material={bodyMat}
              position={[-side * 0.019, -0.036, 0.014]}
              rotation={[0.22, 0, -side * 0.42]}
              scale={[0.38, 0.85, 0.38]}
              castShadow
            >
              <sphereGeometry args={[0.016, 12, 10]} />
            </mesh>
          </group>
        </group>
      </group>
    )
  }

  const renderLeg = (side: 1 | -1) => {
    const hipJoint: MannequinJointId = side === 1 ? "hipL" : "hipR"
    const kneeJoint: MannequinJointId = side === 1 ? "kneeL" : "kneeR"
    return (
      <group
        key={`leg-${side}`}
        position={[side * hipOffsetX, -0.02, 0]}
        ref={(el) => {
          boneRefs.current[hipJoint] = el
        }}
      >
        <mesh material={jointMat} castShadow>
          <sphereGeometry args={[0.05 * limbBuild, 24, 18]} />
        </mesh>
        <JointHandle
          jointId={hipJoint}
          radius={0.056}
          selected={selectedJoint === hipJoint}
          isDragging={draggingJoint === hipJoint}
          gizmosVisible={gizmosVisible}
          onStartDrag={onStartDrag}
        />

        {/* Thigh */}
        <mesh
          geometry={staticGeometries.thigh}
          material={bodyMat}
          position={[0, -0.22, 0]}
          scale={[limbBuild, 1, limbBuild]}
          castShadow
          receiveShadow
        />

        {/* Knee joint */}
        <group
          position={[0, -0.44, 0.005]}
          ref={(el) => {
            boneRefs.current[kneeJoint] = el
          }}
        >
          <mesh material={jointMat} castShadow>
            <sphereGeometry args={[0.037 * limbBuild, 20, 16]} />
          </mesh>
          <JointHandle
            jointId={kneeJoint}
            radius={0.046}
            selected={selectedJoint === kneeJoint}
            isDragging={draggingJoint === kneeJoint}
            gizmosVisible={gizmosVisible}
            onStartDrag={onStartDrag}
          />

          {/* Calf */}
          <mesh
            geometry={staticGeometries.calf}
            material={bodyMat}
            position={[0, -0.22, -0.003]}
            scale={[limbBuild, 1, limbBuild]}
            castShadow
            receiveShadow
          />

          {/* Ankle & Sleek Fashion Foot */}
          <group position={[0, -0.44, 0]} scale={[limbBuild, 1, limbBuild]}>
            <mesh material={jointMat} castShadow>
              <sphereGeometry args={[0.024, 16, 14]} />
            </mesh>
            <mesh
              material={bodyMat}
              position={[0, -0.038, 0.048]}
              scale={[0.76, 0.44, 1.56]}
              castShadow
              receiveShadow
            >
              <sphereGeometry args={[0.044, 18, 14]} />
            </mesh>
            <mesh
              material={bodyMat}
              position={[0, -0.03, -0.014]}
              scale={[0.72, 0.58, 0.82]}
              castShadow
            >
              <sphereGeometry args={[0.031, 14, 12]} />
            </mesh>
          </group>
        </group>
      </group>
    )
  }

  return (
    <group position={[0, 0.962 * height, 0]} scale={height}>
      {/* Single continuous sculpted pelvis/hip form */}
      <mesh
        geometry={bodyGeometries.pelvis}
        material={bodyMat}
        position={[0, 0.045, 0]}
        castShadow
        receiveShadow
      />

      {/* Waist joint -> Single continuous sculpted torso */}
      <group
        position={[0, 0.132, 0]}
        ref={(el) => {
          boneRefs.current.torso = el
        }}
      >
        <mesh
          material={jointMat}
          scale={[waistHips * 0.94, 0.68, waistHips * 0.68]}
          castShadow
        >
          <sphereGeometry args={[0.092, 24, 18]} />
        </mesh>
        <JointHandle
          jointId="torso"
          radius={0.07}
          selected={selectedJoint === "torso"}
          isDragging={draggingJoint === "torso"}
          gizmosVisible={gizmosVisible}
          onStartDrag={onStartDrag}
        />

        {/* Single sculpted ribcage/chest/clavicle torso */}
        <mesh
          geometry={bodyGeometries.torso}
          material={bodyMat}
          position={[0, 0.215, 0]}
          castShadow
          receiveShadow
        />

        {/* Neck column */}
        <mesh
          geometry={staticGeometries.neck}
          material={bodyMat}
          position={[0, 0.455, 0.002]}
          castShadow
        />

        {/* Neck joint -> Single Continuous Sculpted Head */}
        <group
          position={[0, 0.495, 0.006]}
          ref={(el) => {
            boneRefs.current.head = el
            headAnchorRef.current = el
          }}
        >
          <mesh material={jointMat} castShadow>
            <sphereGeometry args={[0.04, 20, 16]} />
          </mesh>
          <JointHandle
            jointId="head"
            radius={0.052}
            selected={selectedJoint === "head"}
            isDragging={draggingJoint === "head"}
            gizmosVisible={gizmosVisible}
            onStartDrag={onStartDrag}
          />

          {/* Single seamless sculpted fashion mannequin head */}
          <mesh
            geometry={staticGeometries.head}
            material={bodyMat}
            position={[0, 0.106, 0.004]}
            castShadow
            receiveShadow
          />

          {/* Optional 3D Feathered Face Portrait Medallion */}
          {faceTexture && (
            <mesh
              position={[0, 0.106, 0.012]}
              scale={[0.74, 1.04, 0.94]}
            >
              <sphereGeometry
                args={[0.098, 28, 20, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.28, Math.PI * 0.44]}
              />
              <meshStandardMaterial
                map={faceTexture}
                transparent
                roughness={0.55}
                metalness={0}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>

        {/* Left & Right Arms */}
        {renderArm(1)}
        {renderArm(-1)}
      </group>

      {/* Left & Right Legs */}
      {renderLeg(1)}
      {renderLeg(-1)}
    </group>
  )
}

function StudioEnvironment() {
  return (
    <group>
      {/* Clean studio plinth */}
      <mesh position={[0, -0.025, 0]} receiveShadow>
        <cylinderGeometry args={[0.56, 0.6, 0.05, 64]} />
        <meshStandardMaterial color="#D5D0DF" roughness={0.72} metalness={0.08} />
      </mesh>
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <cylinderGeometry args={[5.5, 5.5, 0.02, 64]} />
        <meshStandardMaterial color="#DFDCE7" roughness={0.94} metalness={0} />
      </mesh>
    </group>
  )
}

interface SceneContentProps {
  customization: MannequinCustomization
  pose: MannequinPose
  selectedJoint: MannequinJointId
  onSelectJoint: (joint: MannequinJointId) => void
  onChangeJoint: (joint: MannequinJointId, angles: JointAngles) => void
  facePreviewUrl?: string
  resetCameraNonce?: number
  onRegisterCapture?: (captureFn: () => Promise<string>) => void
}

function SceneContent({
  customization,
  pose,
  selectedJoint,
  onSelectJoint,
  onChangeJoint,
  facePreviewUrl,
  resetCameraNonce,
  onRegisterCapture,
}: SceneContentProps) {
  const { gl, scene, camera } = useThree()
  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null)
  const headAnchorRef = useRef<THREE.Object3D | null>(null)
  const [gizmosVisible, setGizmosVisible] = useState(true)
  const [draggingJoint, setDraggingJoint] = useState<MannequinJointId | null>(null)
  const gizmosHiddenSyncRef = useRef(false)

  // Latest pose & face props in refs for smooth global pointer dragging & async capture
  const poseRef = useRef(pose)
  poseRef.current = pose
  const customizationRef = useRef(customization)
  customizationRef.current = customization
  const faceUrlRef = useRef(facePreviewUrl)
  faceUrlRef.current = facePreviewUrl

  const dragStateRef = useRef<{
    joint: MannequinJointId
    lastX: number
    lastY: number
    shift: boolean
  } | null>(null)

  const handleStartDrag = useCallback(
    (jointId: MannequinJointId, e: ThreeEvent<PointerEvent>) => {
      onSelectJoint(jointId)
      setDraggingJoint(jointId)
      if (controlsRef.current) {
        controlsRef.current.enabled = false
      }
      dragStateRef.current = {
        joint: jointId,
        lastX: e.clientX,
        lastY: e.clientY,
        shift: e.shiftKey,
      }
      document.body.style.cursor = "grabbing"
    },
    [onSelectJoint],
  )

  useEffect(() => {
    const onPointerMove = (ev: PointerEvent) => {
      const drag = dragStateRef.current
      if (!drag) return
      const dx = ev.clientX - drag.lastX
      const dy = ev.clientY - drag.lastY
      drag.lastX = ev.clientX
      drag.lastY = ev.clientY
      if (dx === 0 && dy === 0) return

      const cur = poseRef.current[drag.joint] || [0, 0, 0]
      const next: JointAngles = [...cur]
      const sens = 0.011

      if (drag.joint === "head" || drag.joint === "torso") {
        if (ev.shiftKey) {
          next[2] -= dx * sens
          next[0] += dy * sens
        } else {
          next[1] += dx * sens
          next[0] += dy * sens
        }
      } else if (drag.joint === "kneeL" || drag.joint === "kneeR") {
        next[0] += dy * sens
      } else if (drag.joint === "elbowL" || drag.joint === "elbowR") {
        next[0] += dy * sens
        next[1] += dx * sens * 0.7
      } else {
        // Shoulders and Hips: horizontal drag swings Z outward/inward, vertical drag pitches forward/back
        next[2] += dx * sens
        next[0] += dy * sens
      }

      const clamped = clampJointAngles(drag.joint, next)
      onChangeJoint(drag.joint, clamped)
    }

    const onPointerUp = () => {
      if (!dragStateRef.current) return
      dragStateRef.current = null
      setDraggingJoint(null)
      document.body.style.cursor = ""
      if (controlsRef.current) {
        controlsRef.current.enabled = true
      }
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
      document.body.style.cursor = ""
    }
  }, [onChangeJoint])

  useEffect(() => {
    if (!resetCameraNonce) return
    camera.position.set(0.22, 1.02, 3.45)
    camera.lookAt(0, 0.92, 0)
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0.92, 0)
      controlsRef.current.update()
    }
  }, [resetCameraNonce, camera])

  // Register clean snapshot capture function (hides gizmos + composites oval face when enabled)
  useEffect(() => {
    if (!onRegisterCapture) return
    const captureSnapshot = async (): Promise<string> => {
      gizmosHiddenSyncRef.current = true
      setGizmosVisible(false)

      // Allow two animation frames so React hides gizmo rings cleanly before capturing
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )

      gl.render(scene, camera)
      const sourceCanvas = gl.domElement
      const outW = 768
      const outH = 1024
      const out = document.createElement("canvas")
      out.width = outW
      out.height = outH
      const ctx = out.getContext("2d")
      if (!ctx) {
        gizmosHiddenSyncRef.current = false
        setGizmosVisible(true)
        return sourceCanvas.toDataURL("image/png")
      }

      ctx.fillStyle = STUDIO_BG
      ctx.fillRect(0, 0, outW, outH)

      const srcRatio = sourceCanvas.width / Math.max(1, sourceCanvas.height)
      const dstRatio = outW / outH
      let drawW = outW
      let drawH = outH
      let offsetX = 0
      let offsetY = 0
      if (srcRatio > dstRatio) {
        drawH = outH
        drawW = outH * srcRatio
        offsetX = (outW - drawW) / 2
      } else {
        drawW = outW
        drawH = outW / srcRatio
        offsetY = (outH - drawH) / 2
      }
      ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH)

      const curCustom = customizationRef.current
      const faceSrc = curCustom.includeMyFace
        ? curCustom.faceImageData || faceUrlRef.current
        : undefined
      if (faceSrc && headAnchorRef.current) {
        const headCenter = new THREE.Vector3(0, 0.105, 0.072)
        const headTop = new THREE.Vector3(0, 0.212, 0.072)
        const headForward = new THREE.Vector3(0, 0, 1)
        headAnchorRef.current.localToWorld(headCenter)
        headAnchorRef.current.localToWorld(headTop)
        const headWorldQuat = new THREE.Quaternion()
        headAnchorRef.current.getWorldQuaternion(headWorldQuat)
        headForward.applyQuaternion(headWorldQuat).normalize()

        const camDir = camera.position.clone().sub(headCenter).normalize()
        if (headForward.dot(camDir) > 0.25) {
          const pCenter = headCenter.project(camera)
          const pTop = headTop.project(camera)
          const cx = offsetX + ((pCenter.x + 1) * 0.5) * drawW
          const cy = offsetY + ((1 - pCenter.y) * 0.5) * drawH
          const topY = offsetY + ((1 - pTop.y) * 0.5) * drawH
          const radiusY = Math.max(22, Math.abs(cy - topY) * 0.88)
          const radiusX = radiusY * 0.78

          await new Promise<void>((resolveFace) => {
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.onload = () => {
              const fw = Math.max(32, Math.round(radiusX * 2))
              const fh = Math.max(32, Math.round(radiusY * 2))
              const faceCanvas = document.createElement("canvas")
              faceCanvas.width = fw
              faceCanvas.height = fh
              const fctx = faceCanvas.getContext("2d")
              if (fctx) {
                const minDim = Math.min(img.width, img.height)
                fctx.drawImage(
                  img,
                  (img.width - minDim) / 2,
                  (img.height - minDim) / 2,
                  minDim,
                  minDim,
                  0,
                  0,
                  fw,
                  fh,
                )
                fctx.globalCompositeOperation = "destination-in"
                const mask = fctx.createRadialGradient(
                  fw / 2,
                  fh / 2,
                  Math.min(fw, fh) * 0.26,
                  fw / 2,
                  fh / 2,
                  Math.max(fw, fh) * 0.5,
                )
                mask.addColorStop(0, "rgba(0,0,0,1)")
                mask.addColorStop(0.72, "rgba(0,0,0,0.85)")
                mask.addColorStop(1, "rgba(0,0,0,0)")
                fctx.fillStyle = mask
                fctx.fillRect(0, 0, fw, fh)
                ctx.drawImage(faceCanvas, cx - radiusX, cy - radiusY, radiusX * 2, radiusY * 2)
              }
              resolveFace()
            }
            img.onerror = () => resolveFace()
            img.src = faceSrc
          })
        }
      }

      gizmosHiddenSyncRef.current = false
      setGizmosVisible(true)
      return out.toDataURL("image/png")
    }

    onRegisterCapture(captureSnapshot)
  }, [onRegisterCapture, gl, scene, camera])

  return (
    <>
      <color attach="background" args={[STUDIO_BG]} />
      <fog attach="fog" args={[STUDIO_BG, 8, 17]} />

      <ambientLight intensity={0.62} />
      <hemisphereLight args={["#ffffff", "#c9c3d8", 0.55]} />
      <directionalLight
        position={[2.5, 5.2, 3.2]}
        intensity={0.95}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={14}
        shadow-camera-left={-2.5}
        shadow-camera-right={2.5}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-1.5}
        shadow-bias={-0.00015}
      />
      <pointLight position={[-2.2, 2.8, 2.6]} intensity={0.75} color="#efe9ff" />
      <directionalLight position={[-1.5, 3, -3.2]} intensity={0.55} color="#fff7ed" />

      <StudioEnvironment />
      <ArticulatedMannequin
        customization={customization}
        pose={pose}
        selectedJoint={selectedJoint}
        draggingJoint={draggingJoint}
        gizmosVisible={gizmosVisible}
        onStartDrag={handleStartDrag}
        facePreviewUrl={facePreviewUrl}
        headAnchorRef={headAnchorRef}
      />

      <ContactShadows
        position={[0, 0.002, 0]}
        opacity={0.28}
        scale={3.6}
        blur={2.4}
        far={2.6}
        color="#4d4864"
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.1}
        maxDistance={5.4}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.04}
        target={[0, 0.92, 0]}
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

export default function TryOnMannequin3D({
  customization,
  pose,
  selectedJoint,
  onSelectJoint,
  onChangeJoint,
  facePreviewUrl,
  resetCameraNonce,
  onRegisterCapture,
  className,
  compact = false,
}: TryOnMannequin3DProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("Could not initialize 3D canvas")
  const [canvasKey, setCanvasKey] = useState(0)

  useEffect(() => {
    if (status !== "loading") return
    const timer = window.setTimeout(
      () => setStatus((s) => (s === "loading" ? "ready" : s)),
      3500,
    )
    return () => window.clearTimeout(timer)
  }, [status, canvasKey])

  const minH = compact ? "min-h-[240px]" : "min-h-[340px]"

  return (
    <div className={`relative w-full h-full ${minH} ${className ?? ""}`}>
      {status === "loading" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 pointer-events-none"
          style={{ background: `${STUDIO_BG}dd` }}
        >
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--pink)", borderTopColor: "transparent" }}
          />
          <p className="text-[11px] text-neutral-600 font-bold">
            Preparing 3D Mannequin Studio…
          </p>
        </div>
      )}

      {status === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 px-6 text-center"
          style={{ background: STUDIO_BG }}
        >
          <p className="text-sm font-black text-neutral-900">
            3D Studio unavailable
          </p>
          <p className="text-xs text-neutral-600">{errorMsg}</p>
          <button
            type="button"
            onClick={() => {
              setErrorMsg("Could not initialize 3D canvas")
              setStatus("loading")
              setCanvasKey((k) => k + 1)
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-black bg-turquoise text-[#0D0F18] cursor-pointer"
          >
            Retry 3D Studio
          </button>
        </div>
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
            dpr={[1, 2]}
            frameloop="always"
            camera={{
              position: [0.22, 1.02, 3.45],
              fov: 32,
              near: 0.1,
              far: 40,
            }}
            gl={{
              antialias: true,
              alpha: false,
              preserveDrawingBuffer: true,
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
              minHeight: compact ? 240 : 340,
              touchAction: "none",
              background: STUDIO_BG,
            }}
          >
            <Suspense fallback={null}>
              <SceneContent
                customization={customization}
                pose={pose}
                selectedJoint={selectedJoint}
                onSelectJoint={onSelectJoint}
                onChangeJoint={onChangeJoint}
                facePreviewUrl={facePreviewUrl}
                resetCameraNonce={resetCameraNonce}
                onRegisterCapture={onRegisterCapture}
              />
            </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      )}
    </div>
  )
}
