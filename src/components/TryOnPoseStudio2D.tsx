/**
 * Pure 2D Interactive Atelier Pose Studio & OpenPose Skeleton Editor.
 * Lets users pick studio poses/framing or drag 2D joints directly (with 2-bone IK on hands/feet)
 * and exports a pixel-accurate COCO-18 OpenPose skeleton + minimalist 2D pose reference
 * for local SDXL + ControlNet + IP-Adapter generation (zero 3D / WebGL).
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { FIT_EASE } from "../lib/bodyMeasurements"
import type {
  GarmentFitStyle,
  MannequinBodyPreset,
  MannequinCustomization,
  MannequinMaterialId,
  Pose2D,
  PoseJointId,
  PosePoint2D,
} from "../types"

export interface StudioGarmentPreviewLayer {
  slot: "Top" | "Bottom" | "Full Body" | "Outerwear" | "Shoes"
  name: string
  color: string
}

export const STUDIO_W = 768
export const STUDIO_H = 1024

export type CameraPresetId = "front" | "three_quarter" | "side" | "back" | "low_angle"

export const CAMERA_PRESETS: Record<
  CameraPresetId,
  {
    label: string
    promptTag: string
    scaleX: number
    shiftX: number
    scaleY: number
    offsetY: number
    mirrorX?: boolean
  }
> = {
  front: {
    label: "Front",
    promptTag: "straight-on front-facing full-body studio portrait",
    scaleX: 1.0,
    shiftX: 0,
    scaleY: 1.0,
    offsetY: 0,
  },
  three_quarter: {
    label: "3/4",
    promptTag: "three-quarter angle editorial fashion portrait",
    scaleX: 0.78,
    shiftX: -0.02,
    scaleY: 1.0,
    offsetY: 0,
  },
  side: {
    label: "Side",
    promptTag: "clean side profile full-body fashion portrait",
    scaleX: 0.44,
    shiftX: -0.015,
    scaleY: 1.0,
    offsetY: 0,
  },
  back: {
    label: "Back",
    promptTag: "rear back-facing full-body studio portrait from behind",
    scaleX: 1.0,
    shiftX: 0,
    scaleY: 1.0,
    offsetY: 0,
    mirrorX: true,
  },
  low_angle: {
    label: "Hero",
    promptTag: "slightly low-angle full-body runway fashion photograph",
    scaleX: 0.94,
    shiftX: 0.01,
    scaleY: 1.04,
    offsetY: -0.018,
  },
}

export type BackdropPresetId =
  | "cyclorama"
  | "warm_editorial"
  | "golden_hour"
  | "cool_daylight"
  | "midnight"

export const STUDIO_BACKDROP_PRESETS: Record<
  BackdropPresetId,
  {
    label: string
    swatch: string
    bg: string
    bgBottom: string
    plinth: string
    floor: string
    shadowColor: string
    rimTint: string
    promptDesc: string
  }
> = {
  cyclorama: {
    label: "Cyclorama",
    swatch: "#E8E5EE",
    bg: "#ECEAF2",
    bgBottom: "#DDD9E6",
    plinth: "#D1CBD9",
    floor: "#DFDCE7",
    shadowColor: "#4D4864",
    rimTint: "#FFFFFF",
    promptDesc:
      "clean soft lavender-grey seamless studio cyclorama paper backdrop, balanced overhead softbox key lighting, soft floor contact shadow",
  },
  warm_editorial: {
    label: "Warm Stone",
    swatch: "#EDE3D9",
    bg: "#EFE6DC",
    bgBottom: "#DFD3C6",
    plinth: "#D5C5B6",
    floor: "#E6DBD0",
    shadowColor: "#5C4A3D",
    rimTint: "#FFF4E6",
    promptDesc:
      "warm stone beige seamless studio sweep backdrop, soft warm editorial diffused strobe lighting, clean architectural shadow",
  },
  golden_hour: {
    label: "Golden Hour",
    swatch: "#F2DFC4",
    bg: "#F5E4CA",
    bgBottom: "#E7CAA2",
    plinth: "#D9B98F",
    floor: "#EAD3B4",
    shadowColor: "#6E4E2E",
    rimTint: "#FFD494",
    promptDesc:
      "warm sunlit golden hour amber studio backdrop, directional golden key light and warm glowing rim light, long soft shadow",
  },
  cool_daylight: {
    label: "Daylight",
    swatch: "#E2ECF5",
    bg: "#E6EFF8",
    bgBottom: "#CEDDE9",
    plinth: "#C3D3E2",
    floor: "#D8E4F0",
    shadowColor: "#3E5166",
    rimTint: "#F0F8FF",
    promptDesc:
      "crisp airy pale-blue daylight studio cyclorama backdrop, bright north-window diffused softbox lighting, clean shadows",
  },
  midnight: {
    label: "Midnight",
    swatch: "#1A1D29",
    bg: "#1F2333",
    bgBottom: "#121520",
    plinth: "#25293A",
    floor: "#141620",
    shadowColor: "#06070C",
    rimTint: "#8BE4F5",
    promptDesc:
      "moody deep charcoal-indigo dark fashion studio backdrop, dramatic high-contrast softbox key light with crisp cyan rim highlight",
  },
}

export const MANNEQUIN_MATERIALS: Record<
  MannequinMaterialId,
  {
    label: string
    color: string
    shade: string
    jointColor: string
    swatch: string
    promptDesc: string
  }
> = {
  porcelain: {
    label: "Warm Ivory",
    color: "#FAF5EE",
    shade: "#E6DDD0",
    jointColor: "#DDD2C4",
    swatch: "#FAF5EE",
    promptDesc: "smooth satin matte warm ivory porcelain mannequin",
  },
  bisque: {
    label: "Soft Peach",
    color: "#F5D8C5",
    shade: "#DFB89E",
    jointColor: "#D6AE94",
    swatch: "#F5D8C5",
    promptDesc: "smooth matte soft peach bisque mannequin",
  },
  sand: {
    label: "Honey Maple",
    color: "#E5BE96",
    shade: "#C99B6D",
    jointColor: "#BF9062",
    swatch: "#E5BE96",
    promptDesc: "carved satin honey maple wood designer mannequin",
  },
  tan: {
    label: "Terracotta",
    color: "#CA8F67",
    shade: "#AA6E48",
    jointColor: "#9F6540",
    swatch: "#CA8F67",
    promptDesc: "smooth matte warm terracotta clay mannequin",
  },
  espresso: {
    label: "Espresso",
    color: "#6F4836",
    shade: "#523224",
    jointColor: "#482B1E",
    swatch: "#6F4836",
    promptDesc: "rich satin dark espresso walnut wood mannequin",
  },
  walnut: {
    label: "Rose Clay",
    color: "#E2ABA3",
    shade: "#C6887F",
    jointColor: "#BA7D74",
    swatch: "#E2ABA3",
    promptDesc: "smooth matte blush rose clay atelier mannequin",
  },
  charcoal: {
    label: "Obsidian Matte",
    color: "#2E3240",
    shade: "#1C202B",
    jointColor: "#474D61",
    swatch: "#2E3240",
    promptDesc: "sleek matte obsidian charcoal resin couture mannequin",
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
    promptDesc: string
  }
> = {
  petite: {
    label: "Petite",
    height: 0.92,
    shoulders: 0.92,
    chest: 0.93,
    waistHips: 0.94,
    limbBuild: 0.92,
    promptDesc: "petite slender frame mannequin",
  },
  standard: {
    label: "Standard",
    height: 1.0,
    shoulders: 1.0,
    chest: 1.0,
    waistHips: 1.0,
    limbBuild: 1.0,
    promptDesc: "balanced tailored studio proportions mannequin",
  },
  athletic: {
    label: "Athletic",
    height: 1.03,
    shoulders: 1.12,
    chest: 1.08,
    waistHips: 0.98,
    limbBuild: 1.09,
    promptDesc: "athletic broad-shouldered sculpted mannequin",
  },
  curvy: {
    label: "Curvy",
    height: 0.98,
    shoulders: 0.96,
    chest: 1.11,
    waistHips: 1.16,
    limbBuild: 1.05,
    promptDesc: "curvy hourglass silhouette fashion mannequin",
  },
  tall: {
    label: "Tall / Broad",
    height: 1.08,
    shoulders: 1.1,
    chest: 1.06,
    waistHips: 1.04,
    limbBuild: 1.04,
    promptDesc: "tall elongated high-fashion runway mannequin",
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
  fitStyle: "standard",
  includeMyFace: false,
}

export const JOINT_LABELS: Record<PoseJointId, string> = {
  nose: "Head",
  neck: "Neck",
  shoulderL: "Left Shoulder",
  shoulderR: "Right Shoulder",
  elbowL: "Left Elbow",
  elbowR: "Right Elbow",
  wristL: "Left Wrist (IK)",
  wristR: "Right Wrist (IK)",
  pelvis: "Waist / Core",
  hipL: "Left Hip",
  hipR: "Right Hip",
  kneeL: "Left Knee",
  kneeR: "Right Knee",
  ankleL: "Left Ankle (IK)",
  ankleR: "Right Ankle (IK)",
}

export const JOINT_ORDER: PoseJointId[] = [
  "nose",
  "neck",
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "wristL",
  "wristR",
  "pelvis",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR",
  "ankleL",
  "ankleR",
]

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
  { label: string; emoji: string; pose: Pose2D }
> = {
  classic: {
    label: "Classic Studio",
    emoji: "🧍",
    pose: {
      nose: [0.5, 0.145],
      neck: [0.5, 0.22],
      shoulderR: [0.415, 0.245],
      elbowR: [0.375, 0.365],
      wristR: [0.355, 0.495],
      shoulderL: [0.585, 0.245],
      elbowL: [0.625, 0.365],
      wristL: [0.645, 0.495],
      pelvis: [0.5, 0.485],
      hipR: [0.455, 0.505],
      kneeR: [0.448, 0.695],
      ankleR: [0.445, 0.885],
      hipL: [0.545, 0.505],
      kneeL: [0.552, 0.695],
      ankleL: [0.555, 0.885],
    },
  },
  contrapposto: {
    label: "Contrapposto",
    emoji: "✨",
    pose: {
      nose: [0.488, 0.145],
      neck: [0.495, 0.22],
      shoulderR: [0.41, 0.252],
      elbowR: [0.382, 0.375],
      wristR: [0.412, 0.488],
      shoulderL: [0.578, 0.238],
      elbowL: [0.638, 0.352],
      wristL: [0.618, 0.468],
      pelvis: [0.508, 0.488],
      hipR: [0.46, 0.512],
      kneeR: [0.422, 0.69],
      ankleR: [0.442, 0.875],
      hipL: [0.554, 0.498],
      kneeL: [0.548, 0.695],
      ankleL: [0.545, 0.888],
    },
  },
  hands_on_hips: {
    label: "Hands on Hips",
    emoji: "💃",
    pose: {
      nose: [0.495, 0.145],
      neck: [0.5, 0.22],
      shoulderR: [0.415, 0.245],
      elbowR: [0.312, 0.35],
      wristR: [0.442, 0.455],
      shoulderL: [0.585, 0.245],
      elbowL: [0.688, 0.35],
      wristL: [0.558, 0.455],
      pelvis: [0.5, 0.485],
      hipR: [0.455, 0.505],
      kneeR: [0.438, 0.695],
      ankleR: [0.432, 0.885],
      hipL: [0.545, 0.505],
      kneeL: [0.562, 0.695],
      ankleL: [0.568, 0.885],
    },
  },
  runway: {
    label: "Runway Walk",
    emoji: "👠",
    pose: {
      nose: [0.51, 0.145],
      neck: [0.504, 0.22],
      shoulderR: [0.42, 0.245],
      elbowR: [0.39, 0.365],
      wristR: [0.368, 0.48],
      shoulderL: [0.586, 0.242],
      elbowL: [0.625, 0.358],
      wristL: [0.648, 0.472],
      pelvis: [0.5, 0.485],
      hipR: [0.458, 0.505],
      kneeR: [0.478, 0.69],
      ankleR: [0.49, 0.865],
      hipL: [0.542, 0.505],
      kneeL: [0.525, 0.695],
      ankleL: [0.515, 0.895],
    },
  },
  streetwear: {
    label: "Streetwear Lean",
    emoji: "🧥",
    pose: {
      nose: [0.482, 0.148],
      neck: [0.494, 0.222],
      shoulderR: [0.412, 0.242],
      elbowR: [0.36, 0.355],
      wristR: [0.415, 0.472],
      shoulderL: [0.578, 0.25],
      elbowL: [0.635, 0.365],
      wristL: [0.582, 0.482],
      pelvis: [0.508, 0.488],
      hipR: [0.46, 0.508],
      kneeR: [0.422, 0.688],
      ankleR: [0.412, 0.885],
      hipL: [0.554, 0.502],
      kneeL: [0.562, 0.695],
      ankleL: [0.568, 0.885],
    },
  },
  power: {
    label: "Power Stance",
    emoji: "⚡",
    pose: {
      nose: [0.5, 0.142],
      neck: [0.5, 0.22],
      shoulderR: [0.41, 0.244],
      elbowR: [0.34, 0.365],
      wristR: [0.365, 0.478],
      shoulderL: [0.59, 0.244],
      elbowL: [0.66, 0.365],
      wristL: [0.635, 0.478],
      pelvis: [0.5, 0.485],
      hipR: [0.452, 0.505],
      kneeR: [0.41, 0.695],
      ankleR: [0.375, 0.885],
      hipL: [0.548, 0.505],
      kneeL: [0.59, 0.695],
      ankleL: [0.625, 0.885],
    },
  },
  wave: {
    label: "Studio Wave",
    emoji: "👋",
    pose: {
      nose: [0.485, 0.145],
      neck: [0.495, 0.22],
      shoulderR: [0.412, 0.248],
      elbowR: [0.37, 0.368],
      wristR: [0.395, 0.485],
      shoulderL: [0.582, 0.238],
      elbowL: [0.7, 0.215],
      wristL: [0.695, 0.115],
      pelvis: [0.5, 0.485],
      hipR: [0.455, 0.505],
      kneeR: [0.445, 0.695],
      ankleR: [0.44, 0.885],
      hipL: [0.545, 0.505],
      kneeL: [0.562, 0.692],
      ankleL: [0.578, 0.88],
    },
  },
}

export const DEFAULT_POSE: Pose2D = POSE_PRESETS.classic.pose

export function isValidPose2D(candidate: unknown): candidate is Pose2D {
  if (!candidate || typeof candidate !== "object") return false
  const rec = candidate as Record<string, unknown>
  return JOINT_ORDER.every((id) => {
    const pt = rec[id]
    return (
      Array.isArray(pt) &&
      pt.length === 2 &&
      typeof pt[0] === "number" &&
      typeof pt[1] === "number" &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1]) &&
      pt[0] > 0.01 &&
      pt[0] < 0.99 &&
      pt[1] > 0.01 &&
      pt[1] < 0.99
    )
  })
}

export function clampPoint2D(pt: PosePoint2D): PosePoint2D {
  return [
    Math.min(0.92, Math.max(0.08, Number(pt[0].toFixed(4)))),
    Math.min(0.94, Math.max(0.06, Number(pt[1].toFixed(4)))),
  ]
}

export function solveTwoBoneIK2D(
  root: PosePoint2D,
  midCurrent: PosePoint2D,
  endCurrent: PosePoint2D,
  target: PosePoint2D,
  preferSide: 1 | -1,
): { mid: PosePoint2D; end: PosePoint2D } {
  const len1 = Math.max(0.08, Math.hypot(midCurrent[0] - root[0], midCurrent[1] - root[1]))
  const len2 = Math.max(0.08, Math.hypot(endCurrent[0] - midCurrent[0], endCurrent[1] - midCurrent[1]))
  const dx = target[0] - root[0]
  const dy = target[1] - root[1]
  const rawDist = Math.hypot(dx, dy)
  const minDist = Math.abs(len1 - len2) + 0.02
  const maxDist = (len1 + len2) * 0.995
  const dist = Math.min(maxDist, Math.max(minDist, rawDist))

  const baseAngle = Math.atan2(dy, dx)
  const cosAngle = Math.min(
    1,
    Math.max(-1, (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist)),
  )
  const bendOffset = Math.acos(cosAngle)

  // Determine which bend sign preserves the existing elbow/knee bend direction
  const cross =
    (midCurrent[0] - root[0]) * (endCurrent[1] - root[1]) -
    (midCurrent[1] - root[1]) * (endCurrent[0] - root[0])
  const bendSign = Math.abs(cross) > 0.0005 ? (cross >= 0 ? 1 : -1) : preferSide

  const jointAngle = baseAngle + bendSign * bendOffset
  const mid: PosePoint2D = clampPoint2D([
    root[0] + len1 * Math.cos(jointAngle),
    root[1] + len1 * Math.sin(jointAngle),
  ])
  const unitX = rawDist > 1e-4 ? dx / rawDist : 0
  const unitY = rawDist > 1e-4 ? dy / rawDist : 1
  const end: PosePoint2D = clampPoint2D([
    root[0] + dist * unitX,
    root[1] + dist * unitY,
  ])
  return { mid, end }
}

export function createRandomPose(): Pose2D {
  const presets = Object.keys(POSE_PRESETS) as PosePresetId[]
  const base = POSE_PRESETS[presets[Math.floor(Math.random() * presets.length)]].pose
  const jitter = (v: number, amt: number) => v + (Math.random() * 2 - 1) * amt
  const neck: PosePoint2D = [jitter(0.5, 0.014), jitter(0.22, 0.008)]
  const nose: PosePoint2D = [jitter(neck[0], 0.024), jitter(neck[1] - 0.075, 0.006)]
  const shL: PosePoint2D = [neck[0] + 0.085, jitter(0.244, 0.01)]
  const shR: PosePoint2D = [neck[0] - 0.085, jitter(0.244, 0.01)]
  const wrLTarget: PosePoint2D = [jitter(0.65, 0.08), jitter(0.36, 0.16)]
  const wrRTarget: PosePoint2D = [jitter(0.35, 0.08), jitter(0.42, 0.12)]
  const armL = solveTwoBoneIK2D(shL, base.elbowL, base.wristL, wrLTarget, -1)
  const armR = solveTwoBoneIK2D(shR, base.elbowR, base.wristR, wrRTarget, 1)
  const hipL: PosePoint2D = [0.545, jitter(0.505, 0.01)]
  const hipR: PosePoint2D = [0.455, jitter(0.505, 0.01)]
  const akL = solveTwoBoneIK2D(hipL, base.kneeL, base.ankleL, [jitter(0.56, 0.05), jitter(0.88, 0.02)], -1)
  const akR = solveTwoBoneIK2D(hipR, base.kneeR, base.ankleR, [jitter(0.44, 0.05), jitter(0.88, 0.02)], 1)

  return {
    nose: clampPoint2D(nose),
    neck: clampPoint2D(neck),
    shoulderL: clampPoint2D(shL),
    shoulderR: clampPoint2D(shR),
    elbowL: armL.mid,
    elbowR: armR.mid,
    wristL: armL.end,
    wristR: armR.end,
    pelvis: clampPoint2D([jitter(0.5, 0.015), 0.485]),
    hipL: clampPoint2D(hipL),
    hipR: clampPoint2D(hipR),
    kneeL: akL.mid,
    kneeR: akR.mid,
    ankleL: akL.end,
    ankleR: akR.end,
  }
}

export function mirrorPoseLeftRight(pose: Pose2D): Pose2D {
  const flipX = (p: PosePoint2D): PosePoint2D => [Number((1 - p[0]).toFixed(4)), p[1]]
  return {
    nose: flipX(pose.nose),
    neck: flipX(pose.neck),
    pelvis: flipX(pose.pelvis),
    shoulderL: flipX(pose.shoulderR),
    shoulderR: flipX(pose.shoulderL),
    elbowL: flipX(pose.elbowR),
    elbowR: flipX(pose.elbowL),
    wristL: flipX(pose.wristR),
    wristR: flipX(pose.wristL),
    hipL: flipX(pose.hipR),
    hipR: flipX(pose.hipL),
    kneeL: flipX(pose.kneeR),
    kneeR: flipX(pose.kneeL),
    ankleL: flipX(pose.ankleR),
    ankleR: flipX(pose.ankleL),
  }
}

export function symmetrizePose(pose: Pose2D): Pose2D {
  const mirrorL = (p: PosePoint2D): PosePoint2D => [Number((1 - p[0]).toFixed(4)), p[1]]
  return {
    nose: [0.5, pose.nose[1]],
    neck: [0.5, pose.neck[1]],
    pelvis: [0.5, pose.pelvis[1]],
    shoulderL: pose.shoulderL,
    shoulderR: mirrorL(pose.shoulderL),
    elbowL: pose.elbowL,
    elbowR: mirrorL(pose.elbowL),
    wristL: pose.wristL,
    wristR: mirrorL(pose.wristL),
    hipL: pose.hipL,
    hipR: mirrorL(pose.hipL),
    kneeL: pose.kneeL,
    kneeR: mirrorL(pose.kneeL),
    ankleL: pose.ankleL,
    ankleR: mirrorL(pose.ankleL),
  }
}

export interface TryOnPoseCaptureResult {
  imageDataUrl: string
  openposeImageDataUrl: string
  keypoints: Record<string, [number, number, number]>
}

export interface ProjectedSkeleton2D {
  points: Record<PoseJointId | "eyeL" | "eyeR" | "earL" | "earR", [number, number]>
  norm: Record<PoseJointId, PosePoint2D>
}

export function projectPoseForView(
  pose: Pose2D,
  customization: MannequinCustomization,
  cameraPreset: CameraPresetId,
): ProjectedSkeleton2D {
  const cam = CAMERA_PRESETS[cameraPreset] || CAMERA_PRESETS.front
  const anchorY = 0.848
  const cx = (pose.neck[0] + pose.pelvis[0]) * 0.5
  const hScale = customization.height * cam.scaleY
  const dirX = cam.mirrorX ? -1 : 1

  const mapPt = (id: PoseJointId): PosePoint2D => {
    let [x, y] = pose[id]
    if (id === "shoulderL" || id === "shoulderR") {
      x = pose.neck[0] + (x - pose.neck[0]) * customization.shoulders
    } else if (id === "hipL" || id === "hipR") {
      x = pose.pelvis[0] + (x - pose.pelvis[0]) * customization.waistHips
    }
    const isUpper =
      id === "nose" ||
      id === "neck" ||
      id === "shoulderL" ||
      id === "shoulderR" ||
      id === "elbowL" ||
      id === "elbowR" ||
      id === "wristL" ||
      id === "wristR"
    const xScaled =
      cx + (x - cx) * cam.scaleX * dirX + (isUpper ? cam.shiftX : 0)
    const yScaled = anchorY + (y - 0.89) * hScale + cam.offsetY
    return [
      Math.min(0.95, Math.max(0.05, xScaled)),
      Math.min(0.94, Math.max(0.04, yScaled)),
    ]
  }

  const norm = {} as Record<PoseJointId, PosePoint2D>
  for (const id of JOINT_ORDER) {
    norm[id] = mapPt(id)
  }

  const nose = norm.nose
  const headH = Math.max(0.045, Math.abs(norm.neck[1] - nose[1]))
  const eyeW = 0.017 * Math.max(0.45, cam.scaleX) * dirX
  const earW = 0.032 * Math.max(0.35, cam.scaleX) * dirX

  const normPts: Record<PoseJointId | "eyeL" | "eyeR" | "earL" | "earR", PosePoint2D> = {
    ...norm,
    eyeR: [nose[0] - eyeW, nose[1] - headH * 0.14],
    eyeL: [nose[0] + eyeW, nose[1] - headH * 0.14],
    earR: [nose[0] - earW, nose[1] - headH * 0.06],
    earL: [nose[0] + earW, nose[1] - headH * 0.06],
  }

  const points = {} as Record<PoseJointId | "eyeL" | "eyeR" | "earL" | "earR", [number, number]>
  ;(Object.keys(normPts) as (keyof typeof normPts)[]).forEach((k) => {
    points[k] = [normPts[k][0] * STUDIO_W, normPts[k][1] * STUDIO_H]
  })

  return { points, norm }
}

/** Standard COCO-18 OpenPose limb palette expected by ControlNet OpenPose SDXL */
const OPENPOSE_LIMBS: {
  a: PoseJointId | "eyeL" | "eyeR" | "earL" | "earR"
  b: PoseJointId | "eyeL" | "eyeR" | "earL" | "earR"
  color: string
  jointColor: string
}[] = [
  { a: "neck", b: "shoulderR", color: "rgb(255, 0, 0)", jointColor: "rgb(255, 0, 0)" },
  { a: "neck", b: "shoulderL", color: "rgb(255, 85, 0)", jointColor: "rgb(255, 85, 0)" },
  { a: "shoulderR", b: "elbowR", color: "rgb(255, 170, 0)", jointColor: "rgb(255, 170, 0)" },
  { a: "elbowR", b: "wristR", color: "rgb(255, 255, 0)", jointColor: "rgb(255, 255, 0)" },
  { a: "shoulderL", b: "elbowL", color: "rgb(170, 255, 0)", jointColor: "rgb(170, 255, 0)" },
  { a: "elbowL", b: "wristL", color: "rgb(85, 255, 0)", jointColor: "rgb(85, 255, 0)" },
  { a: "neck", b: "hipR", color: "rgb(0, 255, 0)", jointColor: "rgb(0, 255, 0)" },
  { a: "hipR", b: "kneeR", color: "rgb(0, 255, 85)", jointColor: "rgb(0, 255, 85)" },
  { a: "kneeR", b: "ankleR", color: "rgb(0, 255, 170)", jointColor: "rgb(0, 255, 170)" },
  { a: "neck", b: "hipL", color: "rgb(0, 255, 255)", jointColor: "rgb(0, 255, 255)" },
  { a: "hipL", b: "kneeL", color: "rgb(0, 170, 255)", jointColor: "rgb(0, 170, 255)" },
  { a: "kneeL", b: "ankleL", color: "rgb(0, 85, 255)", jointColor: "rgb(0, 85, 255)" },
  { a: "neck", b: "nose", color: "rgb(0, 0, 255)", jointColor: "rgb(0, 0, 255)" },
  { a: "nose", b: "eyeR", color: "rgb(85, 0, 255)", jointColor: "rgb(85, 0, 255)" },
  { a: "eyeR", b: "earR", color: "rgb(170, 0, 255)", jointColor: "rgb(170, 0, 255)" },
  { a: "nose", b: "eyeL", color: "rgb(255, 0, 255)", jointColor: "rgb(255, 0, 255)" },
  { a: "eyeL", b: "earL", color: "rgb(255, 0, 170)", jointColor: "rgb(255, 0, 170)" },
]

export function renderOpenPoseCanvas(
  projected: ProjectedSkeleton2D,
  includeFaceFeatures = false,
  isBackView = false,
): string {
  const canvas = document.createElement("canvas")
  canvas.width = STUDIO_W
  canvas.height = STUDIO_H
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  ctx.fillStyle = "#000000"
  ctx.fillRect(0, 0, STUDIO_W, STUDIO_H)

  const pts = projected.points
  const activeLimbs = isBackView
    ? OPENPOSE_LIMBS.filter(
        (l) =>
          l.a !== "nose" &&
          l.b !== "nose" &&
          l.a !== "eyeR" &&
          l.b !== "eyeR" &&
          l.a !== "eyeL" &&
          l.b !== "eyeL",
      )
    : includeFaceFeatures
      ? OPENPOSE_LIMBS
      : OPENPOSE_LIMBS.filter(
          (l) => l.a !== "eyeR" && l.b !== "eyeR" && l.a !== "eyeL" && l.b !== "eyeL",
        )
  ctx.globalAlpha = 0.65
  for (const limb of activeLimbs) {
    const p1 = pts[limb.a]
    const p2 = pts[limb.b]
    const mx = (p1[0] + p2[0]) * 0.5
    const my = (p1[1] + p2[1]) * 0.5
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    if (len < 2) continue
    const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0])
    ctx.save()
    ctx.translate(mx, my)
    ctx.rotate(angle)
    ctx.fillStyle = limb.color
    ctx.beginPath()
    ctx.ellipse(0, 0, len * 0.5, 4.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.globalAlpha = 1.0
  const baseJoints: { id: PoseJointId | "eyeL" | "eyeR" | "earL" | "earR"; color: string }[] = [
    { id: "nose", color: "rgb(255, 0, 0)" },
    { id: "neck", color: "rgb(255, 85, 0)" },
    { id: "shoulderR", color: "rgb(255, 170, 0)" },
    { id: "elbowR", color: "rgb(255, 255, 0)" },
    { id: "wristR", color: "rgb(170, 255, 0)" },
    { id: "shoulderL", color: "rgb(85, 255, 0)" },
    { id: "elbowL", color: "rgb(0, 255, 0)" },
    { id: "wristL", color: "rgb(0, 255, 85)" },
    { id: "hipR", color: "rgb(0, 255, 170)" },
    { id: "kneeR", color: "rgb(0, 255, 255)" },
    { id: "ankleR", color: "rgb(0, 170, 255)" },
    { id: "hipL", color: "rgb(0, 85, 255)" },
    { id: "kneeL", color: "rgb(0, 0, 255)" },
    { id: "ankleL", color: "rgb(85, 0, 255)" },
  ]
  const joints = isBackView
    ? [
        ...baseJoints.filter((j) => j.id !== "nose"),
        { id: "earR" as const, color: "rgb(255, 0, 170)" },
        { id: "earL" as const, color: "rgb(255, 0, 85)" },
      ]
    : includeFaceFeatures
      ? [
          ...baseJoints,
          { id: "eyeR" as const, color: "rgb(170, 0, 255)" },
          { id: "eyeL" as const, color: "rgb(255, 0, 255)" },
          { id: "earR" as const, color: "rgb(255, 0, 170)" },
          { id: "earL" as const, color: "rgb(255, 0, 85)" },
        ]
      : baseJoints
  for (const j of joints) {
    const [jx, jy] = pts[j.id]
    ctx.fillStyle = j.color
    ctx.beginPath()
    ctx.arc(jx, jy, 4.5, 0, Math.PI * 2)
    ctx.fill()
  }

  return canvas.toDataURL("image/png")
}

export async function renderBareSilhouetteCanvas(
  projected: ProjectedSkeleton2D,
  customization: MannequinCustomization,
  backdropPreset: BackdropPresetId,
  faceUrl?: string,
  isBackView = false,
): Promise<string> {
  const backdrop =
    STUDIO_BACKDROP_PRESETS[backdropPreset] || STUDIO_BACKDROP_PRESETS.cyclorama
  const mat =
    MANNEQUIN_MATERIALS[customization.materialId] || MANNEQUIN_MATERIALS.porcelain
  const pts = projected.points

  const canvas = document.createElement("canvas")
  canvas.width = STUDIO_W
  canvas.height = STUDIO_H
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  // Studio cyclorama sweep background
  const grad = ctx.createLinearGradient(0, 0, 0, STUDIO_H)
  grad.addColorStop(0, backdrop.bg)
  grad.addColorStop(0.75, backdrop.bgBottom)
  grad.addColorStop(1, backdrop.floor)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, STUDIO_W, STUDIO_H)

  // Floor plinth ellipse
  const baseY = Math.max(pts.ankleL[1], pts.ankleR[1]) + 28
  const centerX = (pts.ankleL[0] + pts.ankleR[0]) * 0.5
  ctx.fillStyle = backdrop.plinth
  ctx.beginPath()
  ctx.ellipse(centerX, baseY, 155, 22, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = backdrop.shadowColor
  ctx.globalAlpha = 0.18
  ctx.beginPath()
  ctx.ellipse(centerX, baseY - 2, 102, 13, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  const drawLimb = (a: [number, number], b: [number, number], w: number, fill: string) => {
    ctx.strokeStyle = fill
    ctx.lineWidth = w
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }

  const limbW = (base: number) => base * customization.limbBuild
  // Back shadow outline for depth
  const drawBody = (color: string, dx: number, dy: number) => {
    const off = (p: [number, number]): [number, number] => [p[0] + dx, p[1] + dy]
    // Legs + flat studio feet
    drawLimb(off(pts.hipR), off(pts.kneeR), limbW(44), color)
    drawLimb(off(pts.kneeR), off(pts.ankleR), limbW(31), color)
    drawLimb(off(pts.hipL), off(pts.kneeL), limbW(44), color)
    drawLimb(off(pts.kneeL), off(pts.ankleL), limbW(31), color)

    for (const ak of [off(pts.ankleR), off(pts.ankleL)]) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(ak[0], ak[1] + 15, limbW(18), 11, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // Arms + tapered hands
    drawLimb(off(pts.shoulderR), off(pts.elbowR), limbW(28), color)
    drawLimb(off(pts.elbowR), off(pts.wristR), limbW(22), color)
    drawLimb(off(pts.shoulderL), off(pts.elbowL), limbW(28), color)
    drawLimb(off(pts.elbowL), off(pts.wristL), limbW(22), color)

    for (const wr of [off(pts.wristR), off(pts.wristL)]) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(wr[0], wr[1] + 18, limbW(11), 19, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // Neck
    drawLimb(off(pts.neck), off(pts.nose), limbW(26), color)

    // Sculpted torso + pelvis quad
    const shR = off(pts.shoulderR)
    const shL = off(pts.shoulderL)
    const hpR = off(pts.hipR)
    const hpL = off(pts.hipL)
    const wShift = (pts.pelvis[0] - pts.neck[0]) * 0.2
    const waistW = Math.max(24, Math.abs(hpL[0] - hpR[0]) * 0.72 * customization.chest)
    const waistY = shR[1] * 0.36 + hpR[1] * 0.64
    const waistCx = pts.pelvis[0] + dx + wShift

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(shR[0] + 6, shR[1] - 10)
    ctx.quadraticCurveTo((shR[0] + shL[0]) * 0.5, shR[1] - 24, shL[0] - 6, shL[1] - 10)
    ctx.quadraticCurveTo(waistCx + waistW * 0.96, waistY, hpL[0] + 10, hpL[1] + 18)
    ctx.quadraticCurveTo((hpL[0] + hpR[0]) * 0.5, hpL[1] + 44, hpR[0] - 10, hpR[1] + 18)
    ctx.quadraticCurveTo(waistCx - waistW * 0.96, waistY, shR[0] + 6, shR[1] - 10)
    ctx.closePath()
    ctx.fill()

    // Smooth ovoid head
    const n = off(pts.nose)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(n[0], n[1] - 4, 34, 46, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  drawBody(mat.shade, 6, 4)
  drawBody(mat.color, 0, 0)

  // Subtle tonal joint circles
  ctx.fillStyle = mat.jointColor
  for (const id of ["neck", "shoulderR", "elbowR", "wristR", "shoulderL", "elbowL", "wristL", "hipR", "kneeR", "ankleR", "hipL", "kneeL", "ankleL"] as PoseJointId[]) {
    const [x, y] = pts[id]
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.fill()
  }

  // Optional circular portrait preview if "Put My Face" is enabled (front/angled views only)
  const faceSrc =
    !isBackView && customization.includeMyFace
      ? customization.faceImageData || faceUrl
      : undefined
  if (faceSrc) {
    await new Promise<void>((resolve) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(pts.nose[0], pts.nose[1] - 4, 29, 40, 0, 0, Math.PI * 2)
        ctx.clip()
        const side = Math.min(img.width, img.height)
        ctx.drawImage(
          img,
          (img.width - side) * 0.5,
          (img.height - side) * 0.5,
          side,
          side,
          pts.nose[0] - 32,
          pts.nose[1] - 44,
          64,
          80,
        )
        ctx.restore()
        resolve()
      }
      img.onerror = () => resolve()
      img.src = faceSrc
    })
  }

  return canvas.toDataURL("image/png")
}

export interface TryOnPoseStudio2DProps {
  customization: MannequinCustomization
  pose: Pose2D
  selectedJoint: PoseJointId
  onSelectJoint: (joint: PoseJointId) => void
  onChangeJoint: (joint: PoseJointId, pt: PosePoint2D) => void
  onChangePose: (pose: Pose2D) => void
  facePreviewUrl?: string
  cameraPreset: CameraPresetId
  backdropPreset: BackdropPresetId
  zoom?: number
  fitStyle?: GarmentFitStyle
  garmentPreviewLayers?: StudioGarmentPreviewLayer[]
  onRegisterCapture?: (captureFn: () => Promise<TryOnPoseCaptureResult>) => void
}

const FOUR_WAY_DIRS: { dx: number; dy: number; rot: number }[] = [
  { dx: 0, dy: -1, rot: 0 },
  { dx: 1, dy: 0, rot: 90 },
  { dx: 0, dy: 1, rot: 180 },
  { dx: -1, dy: 0, rot: 270 },
]

function lerpPt(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

export default function TryOnPoseStudio2D({
  customization,
  pose,
  selectedJoint,
  onSelectJoint,
  onChangeJoint,
  onChangePose,
  facePreviewUrl,
  cameraPreset,
  backdropPreset,
  zoom = 1,
  fitStyle = "standard",
  garmentPreviewLayers = [],
  onRegisterCapture,
}: TryOnPoseStudio2DProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [draggingJoint, setDraggingJoint] = useState<PoseJointId | null>(null)
  const [hoveredJoint, setHoveredJoint] = useState<PoseJointId | null>(null)

  const backdrop =
    STUDIO_BACKDROP_PRESETS[backdropPreset] || STUDIO_BACKDROP_PRESETS.cyclorama
  const mat =
    MANNEQUIN_MATERIALS[customization.materialId] || MANNEQUIN_MATERIALS.porcelain
  const isBackView = cameraPreset === "back"
  const clampedZoom = Math.min(2, Math.max(1, zoom || 1))
  const viewW = STUDIO_W / clampedZoom
  const viewH = STUDIO_H / clampedZoom
  const viewX = (STUDIO_W - viewW) * 0.5
  const viewY = (STUDIO_H - viewH) * 0.44

  const projected = useMemo(
    () => projectPoseForView(pose, customization, cameraPreset),
    [pose, customization, cameraPreset],
  )
  const pts = projected.points

  const poseRef = useRef(pose)
  poseRef.current = pose
  const customizationRef = useRef(customization)
  customizationRef.current = customization
  const cameraRef = useRef(cameraPreset)
  cameraRef.current = cameraPreset
  const backdropRef = useRef(backdropPreset)
  backdropRef.current = backdropPreset
  const faceRef = useRef(facePreviewUrl)
  faceRef.current = facePreviewUrl

  useEffect(() => {
    if (!onRegisterCapture) return
    const capture = async (): Promise<TryOnPoseCaptureResult> => {
      const custom = customizationRef.current
      const camId = cameraRef.current
      const back = camId === "back"
      const proj = projectPoseForView(poseRef.current, custom, camId)
      const openposeImageDataUrl = renderOpenPoseCanvas(
        proj,
        Boolean(custom.includeMyFace) && !back,
        back,
      )
      const imageDataUrl = await renderBareSilhouetteCanvas(
        proj,
        custom,
        backdropRef.current,
        faceRef.current,
        back,
      )
      const keypoints: Record<string, [number, number, number]> = {}
      ;(Object.keys(proj.norm) as PoseJointId[]).forEach((k) => {
        keypoints[k] = [
          Number(proj.norm[k][0].toFixed(4)),
          Number(proj.norm[k][1].toFixed(4)),
          1.0,
        ]
      })
      return { imageDataUrl, openposeImageDataUrl, keypoints }
    }
    onRegisterCapture(capture)
  }, [onRegisterCapture])

  const pointerToNormalized = (clientX: number, clientY: number): PosePoint2D | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const scale = Math.min(rect.width / viewW, rect.height / viewH)
    const renderedW = viewW * scale
    const renderedH = viewH * scale
    const offsetX = rect.left + (rect.width - renderedW) * 0.5
    const offsetY = rect.top + (rect.height - renderedH) * 0.5
    const svgX = viewX + ((clientX - offsetX) / renderedW) * viewW
    const svgY = viewY + ((clientY - offsetY) / renderedH) * viewH
    const vx = svgX / STUDIO_W
    const vy = svgY / STUDIO_H

    // Invert camera framing (including Back-view horizontal mirror) so dragging tracks cursor 1:1
    const cam = CAMERA_PRESETS[cameraPreset] || CAMERA_PRESETS.front
    const dirX = cam.mirrorX ? -1 : 1
    const cx = (pose.neck[0] + pose.pelvis[0]) * 0.5
    const isUpper =
      selectedJoint === "nose" ||
      selectedJoint === "neck" ||
      selectedJoint === "shoulderL" ||
      selectedJoint === "shoulderR" ||
      selectedJoint === "elbowL" ||
      selectedJoint === "elbowR" ||
      selectedJoint === "wristL" ||
      selectedJoint === "wristR"
    const invX =
      cx +
      ((vx - (isUpper ? cam.shiftX : 0) - cx) * dirX) / Math.max(0.28, cam.scaleX)
    const anchorY = 0.848
    const hScale = customization.height * cam.scaleY
    const invY = 0.89 + (vy - cam.offsetY - anchorY) / Math.max(0.5, hScale)
    return clampPoint2D([invX, invY])
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingJoint) return
    const target = pointerToNormalized(e.clientX, e.clientY)
    if (!target) return

    if (draggingJoint === "wristL") {
      const { mid, end } = solveTwoBoneIK2D(pose.shoulderL, pose.elbowL, pose.wristL, target, -1)
      onChangePose({ ...pose, elbowL: mid, wristL: end })
    } else if (draggingJoint === "wristR") {
      const { mid, end } = solveTwoBoneIK2D(pose.shoulderR, pose.elbowR, pose.wristR, target, 1)
      onChangePose({ ...pose, elbowR: mid, wristR: end })
    } else if (draggingJoint === "ankleL") {
      const { mid, end } = solveTwoBoneIK2D(pose.hipL, pose.kneeL, pose.ankleL, target, -1)
      onChangePose({ ...pose, kneeL: mid, ankleL: end })
    } else if (draggingJoint === "ankleR") {
      const { mid, end } = solveTwoBoneIK2D(pose.hipR, pose.kneeR, pose.ankleR, target, 1)
      onChangePose({ ...pose, kneeR: mid, ankleR: end })
    } else {
      onChangeJoint(draggingJoint, target)
    }
  }

  const stopDrag = (e?: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingJoint) return
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDraggingJoint(null)
  }

  const limbW = (base: number) => base * customization.limbBuild
  const shR = pts.shoulderR
  const shL = pts.shoulderL
  const hpR = pts.hipR
  const hpL = pts.hipL
  const waistW = Math.max(24, Math.abs(hpL[0] - hpR[0]) * 0.72 * customization.chest)
  const waistY = shR[1] * 0.36 + hpR[1] * 0.64
  const waistCx = pts.pelvis[0] + (pts.pelvis[0] - pts.neck[0]) * 0.2
  const torsoPath = [
    `M ${shR[0] + 6} ${shR[1] - 10}`,
    `Q ${(shR[0] + shL[0]) * 0.5} ${shR[1] - 24} ${shL[0] - 6} ${shL[1] - 10}`,
    `Q ${waistCx + waistW * 0.96} ${waistY} ${hpL[0] + 10} ${hpL[1] + 18}`,
    `Q ${(hpL[0] + hpR[0]) * 0.5} ${hpL[1] + 44} ${hpR[0] - 10} ${hpR[1] + 18}`,
    `Q ${waistCx - waistW * 0.96} ${waistY} ${shR[0] + 6} ${shR[1] - 10} Z`,
  ].join(" ")

  const baseY = Math.max(pts.ankleL[1], pts.ankleR[1]) + 28
  const centerX = (pts.ankleL[0] + pts.ankleR[0]) * 0.5
  const effectiveFace =
    !isBackView && customization.includeMyFace
      ? customization.faceImageData || facePreviewUrl
      : undefined

  // Atelier 2D Garment Layer & Ease Drape Overlay geometry (visual studio feedback only)
  const easeScale = (FIT_EASE[fitStyle] || FIT_EASE.standard).drapeScale
  const shLeftX = Math.min(shR[0], shL[0])
  const shRightX = Math.max(shR[0], shL[0])
  const shMidY = (shR[1] + shL[1]) * 0.5
  const hpLeftX = Math.min(hpR[0], hpL[0])
  const hpRightX = Math.max(hpR[0], hpL[0])
  const hpMidY = (hpR[1] + hpL[1]) * 0.5
  const garmentWaistHalf = Math.max(26, waistW * 1.04 * easeScale)
  const hipPad = 14 * easeScale
  const shPad = 9 * easeScale

  const topLayer = garmentPreviewLayers.find((l) => l.slot === "Top")
  const bottomLayer = garmentPreviewLayers.find((l) => l.slot === "Bottom")
  const fullBodyLayer = garmentPreviewLayers.find((l) => l.slot === "Full Body")
  const outerLayer = garmentPreviewLayers.find((l) => l.slot === "Outerwear")
  const shoesLayer = garmentPreviewLayers.find((l) => l.slot === "Shoes")

  const topTorsoPath = [
    `M ${shLeftX - shPad} ${shMidY - 12}`,
    `Q ${(shLeftX + shRightX) * 0.5} ${shMidY - (isBackView ? 22 : 6)} ${shRightX + shPad} ${shMidY - 12}`,
    `Q ${waistCx + garmentWaistHalf} ${waistY} ${hpRightX + hipPad} ${hpMidY + 22}`,
    `Q ${(hpLeftX + hpRightX) * 0.5} ${hpMidY + 34} ${hpLeftX - hipPad} ${hpMidY + 22}`,
    `Q ${waistCx - garmentWaistHalf} ${waistY} ${shLeftX - shPad} ${shMidY - 12} Z`,
  ].join(" ")

  const outerPad = 16 * easeScale
  const outerHemY = Math.min(pts.kneeL[1], pts.kneeR[1]) - 18
  const outerTorsoPath = [
    `M ${shLeftX - outerPad} ${shMidY - 15}`,
    `Q ${(shLeftX + shRightX) * 0.5} ${shMidY - 26} ${shRightX + outerPad} ${shMidY - 15}`,
    `L ${hpRightX + hipPad + 14 * easeScale} ${outerHemY}`,
    `Q ${(hpLeftX + hpRightX) * 0.5} ${outerHemY + 12} ${hpLeftX - hipPad - 14 * easeScale} ${outerHemY}`,
    `Z`,
  ].join(" ")

  const isPantsFullBody = Boolean(
    fullBodyLayer &&
      /(jumpsuit|romper|boilersuit|coverall|overalls)/i.test(fullBodyLayer.name),
  )
  const dressHemY =
    (Math.max(pts.kneeL[1], pts.kneeR[1]) * 0.38 +
      Math.min(pts.ankleL[1], pts.ankleR[1]) * 0.62)
  const dressFlare = 42 * easeScale
  const ankleLeftX = Math.min(pts.ankleR[0], pts.ankleL[0])
  const ankleRightX = Math.max(pts.ankleR[0], pts.ankleL[0])
  const dressSkirtPath = [
    `M ${shLeftX - shPad} ${shMidY - 12}`,
    `Q ${(shLeftX + shRightX) * 0.5} ${shMidY - (isBackView ? 20 : 6)} ${shRightX + shPad} ${shMidY - 12}`,
    `Q ${waistCx + garmentWaistHalf * 0.94} ${waistY} ${ankleRightX + dressFlare} ${dressHemY}`,
    `Q ${(ankleLeftX + ankleRightX) * 0.5} ${dressHemY + 20} ${ankleLeftX - dressFlare} ${dressHemY}`,
    `Q ${waistCx - garmentWaistHalf * 0.94} ${waistY} ${shLeftX - shPad} ${shMidY - 12} Z`,
  ].join(" ")

  const topHasLongSleeves = Boolean(
    topLayer &&
      /(sweater|knit|blouse|shirt|long|cardigan|turtleneck|hoodie|crewneck)/i.test(
        topLayer.name,
      ),
  )
  const sleeveRTarget = topHasLongSleeves ? pts.wristR : lerpPt(pts.shoulderR, pts.elbowR, 0.72)
  const sleeveLTarget = topHasLongSleeves ? pts.wristL : lerpPt(pts.shoulderL, pts.elbowL, 0.72)

  return (
    <svg
      ref={svgRef}
      viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onPointerLeave={stopDrag}
      className="w-full h-full select-none touch-none"
      role="img"
      aria-label="Interactive 2D pose skeleton studio"
    >
      <defs>
        <linearGradient id="tailorStudioBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={backdrop.bg} />
          <stop offset="76%" stopColor={backdrop.bgBottom} />
          <stop offset="100%" stopColor={backdrop.floor} />
        </linearGradient>
        <radialGradient id="tailorRimGlow" cx="50%" cy="38%" r="48%">
          <stop offset="0%" stopColor={backdrop.rimTint} stopOpacity="0.24" />
          <stop offset="100%" stopColor={backdrop.rimTint} stopOpacity="0" />
        </radialGradient>
        <clipPath id="tailorFaceClip">
          <ellipse cx={pts.nose[0]} cy={pts.nose[1] - 4} rx="29" ry="40" />
        </clipPath>
      </defs>

      {/* Backdrop & soft studio lighting glow */}
      <rect width={STUDIO_W} height={STUDIO_H} fill="url(#tailorStudioBg)" />
      <rect width={STUDIO_W} height={STUDIO_H} fill="url(#tailorRimGlow)" />

      {/* Plinth & floor shadow */}
      <ellipse cx={centerX} cy={baseY} rx="158" ry="22" fill={backdrop.plinth} />
      <ellipse
        cx={centerX}
        cy={baseY - 2}
        rx="104"
        ry="13"
        fill={backdrop.shadowColor}
        opacity="0.2"
      />

      {/* Shaded 2D minimalist silhouette shadow offset */}
      <g transform="translate(6, 4)" opacity="0.88">
        <g stroke={mat.shade} strokeLinecap="round" fill="none">
          <line x1={pts.hipR[0]} y1={pts.hipR[1]} x2={pts.kneeR[0]} y2={pts.kneeR[1]} strokeWidth={limbW(44)} />
          <line x1={pts.kneeR[0]} y1={pts.kneeR[1]} x2={pts.ankleR[0]} y2={pts.ankleR[1]} strokeWidth={limbW(31)} />
          <line x1={pts.hipL[0]} y1={pts.hipL[1]} x2={pts.kneeL[0]} y2={pts.kneeL[1]} strokeWidth={limbW(44)} />
          <line x1={pts.kneeL[0]} y1={pts.kneeL[1]} x2={pts.ankleL[0]} y2={pts.ankleL[1]} strokeWidth={limbW(31)} />
          <line x1={pts.shoulderR[0]} y1={pts.shoulderR[1]} x2={pts.elbowR[0]} y2={pts.elbowR[1]} strokeWidth={limbW(28)} />
          <line x1={pts.elbowR[0]} y1={pts.elbowR[1]} x2={pts.wristR[0]} y2={pts.wristR[1]} strokeWidth={limbW(22)} />
          <line x1={pts.shoulderL[0]} y1={pts.shoulderL[1]} x2={pts.elbowL[0]} y2={pts.elbowL[1]} strokeWidth={limbW(28)} />
          <line x1={pts.elbowL[0]} y1={pts.elbowL[1]} x2={pts.wristL[0]} y2={pts.wristL[1]} strokeWidth={limbW(22)} />
          <line x1={pts.neck[0]} y1={pts.neck[1]} x2={pts.nose[0]} y2={pts.nose[1]} strokeWidth={limbW(26)} />
        </g>
        <path d={torsoPath} fill={mat.shade} />
        <ellipse cx={pts.nose[0]} cy={pts.nose[1] - 4} rx="34" ry="46" fill={mat.shade} />
      </g>

      {/* Main 2D minimalist studio mannequin silhouette */}
      <g>
        <g stroke={mat.color} strokeLinecap="round" fill="none">
          <line x1={pts.hipR[0]} y1={pts.hipR[1]} x2={pts.kneeR[0]} y2={pts.kneeR[1]} strokeWidth={limbW(44)} />
          <line x1={pts.kneeR[0]} y1={pts.kneeR[1]} x2={pts.ankleR[0]} y2={pts.ankleR[1]} strokeWidth={limbW(31)} />
          <line x1={pts.hipL[0]} y1={pts.hipL[1]} x2={pts.kneeL[0]} y2={pts.kneeL[1]} strokeWidth={limbW(44)} />
          <line x1={pts.kneeL[0]} y1={pts.kneeL[1]} x2={pts.ankleL[0]} y2={pts.ankleL[1]} strokeWidth={limbW(31)} />
          <line x1={pts.shoulderR[0]} y1={pts.shoulderR[1]} x2={pts.elbowR[0]} y2={pts.elbowR[1]} strokeWidth={limbW(28)} />
          <line x1={pts.elbowR[0]} y1={pts.elbowR[1]} x2={pts.wristR[0]} y2={pts.wristR[1]} strokeWidth={limbW(22)} />
          <line x1={pts.shoulderL[0]} y1={pts.shoulderL[1]} x2={pts.elbowL[0]} y2={pts.elbowL[1]} strokeWidth={limbW(28)} />
          <line x1={pts.elbowL[0]} y1={pts.elbowL[1]} x2={pts.wristL[0]} y2={pts.wristL[1]} strokeWidth={limbW(22)} />
          <line x1={pts.neck[0]} y1={pts.neck[1]} x2={pts.nose[0]} y2={pts.nose[1]} strokeWidth={limbW(26)} />
        </g>

        <ellipse cx={pts.ankleR[0]} cy={pts.ankleR[1] + 15} rx={limbW(18)} ry="11" fill={mat.color} />
        <ellipse cx={pts.ankleL[0]} cy={pts.ankleL[1] + 15} rx={limbW(18)} ry="11" fill={mat.color} />
        <ellipse cx={pts.wristR[0]} cy={pts.wristR[1] + 18} rx={limbW(11)} ry="19" fill={mat.color} />
        <ellipse cx={pts.wristL[0]} cy={pts.wristL[1] + 18} rx={limbW(11)} ry="19" fill={mat.color} />

        <path d={torsoPath} fill={mat.color} />
        <ellipse cx={pts.nose[0]} cy={pts.nose[1] - 4} rx="34" ry="46" fill={mat.color} />

        {isBackView && (
          <g stroke={mat.shade} strokeWidth="2.5" strokeLinecap="round" opacity="0.65">
            <line x1={pts.nose[0]} y1={pts.nose[1] + 24} x2={pts.pelvis[0]} y2={pts.pelvis[1] - 8} strokeDasharray="5 5" />
          </g>
        )}

        {effectiveFace && (
          <image
            href={effectiveFace}
            x={pts.nose[0] - 32}
            y={pts.nose[1] - 44}
            width="64"
            height="80"
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#tailorFaceClip)"
          />
        )}
      </g>

      {/* Live 2D Atelier Garment Drape & Fit/Ease Preview Overlay */}
      {garmentPreviewLayers.length > 0 && (
        <g pointerEvents="none">
          {/* Bottoms (Trousers / Skirt) or Jumpsuit Legs */}
          {(bottomLayer || (fullBodyLayer && isPantsFullBody)) && (() => {
            const col = (bottomLayer || fullBodyLayer)?.color || "#3B4254"
            return (
              <g opacity="0.58">
                <g stroke={col} strokeLinecap="round" strokeLinejoin="round" fill="none">
                  <line x1={pts.hipR[0]} y1={pts.hipR[1]} x2={pts.kneeR[0]} y2={pts.kneeR[1]} strokeWidth={limbW(50) * easeScale} />
                  <line x1={pts.kneeR[0]} y1={pts.kneeR[1]} x2={pts.ankleR[0]} y2={pts.ankleR[1] - 6} strokeWidth={limbW(38) * easeScale} />
                  <line x1={pts.hipL[0]} y1={pts.hipL[1]} x2={pts.kneeL[0]} y2={pts.kneeL[1]} strokeWidth={limbW(50) * easeScale} />
                  <line x1={pts.kneeL[0]} y1={pts.kneeL[1]} x2={pts.ankleL[0]} y2={pts.ankleL[1] - 6} strokeWidth={limbW(38) * easeScale} />
                </g>
                <ellipse
                  cx={(hpLeftX + hpRightX) * 0.5}
                  cy={hpMidY + 8}
                  rx={Math.max(30, (hpRightX - hpLeftX) * 0.5 + hipPad)}
                  ry={26}
                  fill={col}
                />
              </g>
            )
          })()}

          {/* Full-Body Dress / Jumpsuit Bodice */}
          {fullBodyLayer && (
            <g opacity="0.62">
              <path
                d={isPantsFullBody ? topTorsoPath : dressSkirtPath}
                fill={fullBodyLayer.color || "#9B5DE5"}
                stroke="#11131C"
                strokeOpacity="0.22"
                strokeWidth="2"
              />
              <g stroke={fullBodyLayer.color || "#9B5DE5"} strokeLinecap="round" fill="none">
                <line
                  x1={pts.shoulderR[0]}
                  y1={pts.shoulderR[1]}
                  x2={lerpPt(pts.shoulderR, pts.elbowR, 0.55)[0]}
                  y2={lerpPt(pts.shoulderR, pts.elbowR, 0.55)[1]}
                  strokeWidth={limbW(32) * easeScale}
                />
                <line
                  x1={pts.shoulderL[0]}
                  y1={pts.shoulderL[1]}
                  x2={lerpPt(pts.shoulderL, pts.elbowL, 0.55)[0]}
                  y2={lerpPt(pts.shoulderL, pts.elbowL, 0.55)[1]}
                  strokeWidth={limbW(32) * easeScale}
                />
              </g>
            </g>
          )}

          {/* Top Layer */}
          {topLayer && (
            <g opacity="0.62">
              <g stroke={topLayer.color || "#CE005A"} strokeLinecap="round" strokeLinejoin="round" fill="none">
                {topHasLongSleeves ? (
                  <>
                    <line x1={pts.shoulderR[0]} y1={pts.shoulderR[1]} x2={pts.elbowR[0]} y2={pts.elbowR[1]} strokeWidth={limbW(33) * easeScale} />
                    <line x1={pts.elbowR[0]} y1={pts.elbowR[1]} x2={sleeveRTarget[0]} y2={sleeveRTarget[1]} strokeWidth={limbW(26) * easeScale} />
                    <line x1={pts.shoulderL[0]} y1={pts.shoulderL[1]} x2={pts.elbowL[0]} y2={pts.elbowL[1]} strokeWidth={limbW(33) * easeScale} />
                    <line x1={pts.elbowL[0]} y1={pts.elbowL[1]} x2={sleeveLTarget[0]} y2={sleeveLTarget[1]} strokeWidth={limbW(26) * easeScale} />
                  </>
                ) : (
                  <>
                    <line x1={pts.shoulderR[0]} y1={pts.shoulderR[1]} x2={sleeveRTarget[0]} y2={sleeveRTarget[1]} strokeWidth={limbW(34) * easeScale} />
                    <line x1={pts.shoulderL[0]} y1={pts.shoulderL[1]} x2={sleeveLTarget[0]} y2={sleeveLTarget[1]} strokeWidth={limbW(34) * easeScale} />
                  </>
                )}
              </g>
              <path
                d={topTorsoPath}
                fill={topLayer.color || "#CE005A"}
                stroke="#11131C"
                strokeOpacity="0.22"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Outerwear Layer (open coat/jacket silhouette + full sleeves) */}
          {outerLayer && (
            <g opacity="0.54">
              <g stroke={outerLayer.color || "#1E6F78"} strokeLinecap="round" strokeLinejoin="round" fill="none">
                <line x1={pts.shoulderR[0]} y1={pts.shoulderR[1]} x2={pts.elbowR[0]} y2={pts.elbowR[1]} strokeWidth={limbW(38) * easeScale} />
                <line x1={pts.elbowR[0]} y1={pts.elbowR[1]} x2={pts.wristR[0]} y2={pts.wristR[1]} strokeWidth={limbW(30) * easeScale} />
                <line x1={pts.shoulderL[0]} y1={pts.shoulderL[1]} x2={pts.elbowL[0]} y2={pts.elbowL[1]} strokeWidth={limbW(38) * easeScale} />
                <line x1={pts.elbowL[0]} y1={pts.elbowL[1]} x2={pts.wristL[0]} y2={pts.wristL[1]} strokeWidth={limbW(30) * easeScale} />
              </g>
              <path
                d={outerTorsoPath}
                fill={outerLayer.color || "#1E6F78"}
                fillOpacity={isBackView ? "0.92" : "0.52"}
                stroke={outerLayer.color || "#1E6F78"}
                strokeWidth="4"
              />
              {!isBackView && (topLayer || fullBodyLayer) && (
                <line
                  x1={(shLeftX + shRightX) * 0.5}
                  y1={shMidY - 8}
                  x2={(hpLeftX + hpRightX) * 0.5}
                  y2={outerHemY + 4}
                  stroke="#FFFFFF"
                  strokeOpacity="0.45"
                  strokeWidth="3"
                />
              )}
            </g>
          )}

          {/* Shoes Layer */}
          {shoesLayer && (
            <g opacity="0.78">
              <ellipse
                cx={pts.ankleR[0]}
                cy={pts.ankleR[1] + 15}
                rx={limbW(22)}
                ry="13"
                fill={shoesLayer.color || "#222530"}
                stroke="#11131C"
                strokeOpacity="0.3"
                strokeWidth="2"
              />
              <ellipse
                cx={pts.ankleL[0]}
                cy={pts.ankleL[1] + 15}
                rx={limbW(22)}
                ry="13"
                fill={shoesLayer.color || "#222530"}
                stroke="#11131C"
                strokeOpacity="0.3"
                strokeWidth="2"
              />
            </g>
          )}
        </g>
      )}

      {/* Subtle skeleton bone guide lines */}
      <g stroke="#11131C" strokeWidth="3.5" strokeOpacity="0.32" strokeDasharray="7 6" fill="none">
        <line x1={pts.nose[0]} y1={pts.nose[1]} x2={pts.neck[0]} y2={pts.neck[1]} />
        <line x1={pts.neck[0]} y1={pts.neck[1]} x2={pts.pelvis[0]} y2={pts.pelvis[1]} />
        <line x1={pts.neck[0]} y1={pts.neck[1]} x2={pts.shoulderR[0]} y2={pts.shoulderR[1]} />
        <line x1={pts.neck[0]} y1={pts.neck[1]} x2={pts.shoulderL[0]} y2={pts.shoulderL[1]} />
        <line x1={pts.shoulderR[0]} y1={pts.shoulderR[1]} x2={pts.elbowR[0]} y2={pts.elbowR[1]} />
        <line x1={pts.elbowR[0]} y1={pts.elbowR[1]} x2={pts.wristR[0]} y2={pts.wristR[1]} />
        <line x1={pts.shoulderL[0]} y1={pts.shoulderL[1]} x2={pts.elbowL[0]} y2={pts.elbowL[1]} />
        <line x1={pts.elbowL[0]} y1={pts.elbowL[1]} x2={pts.wristL[0]} y2={pts.wristL[1]} />
        <line x1={pts.pelvis[0]} y1={pts.pelvis[1]} x2={pts.hipR[0]} y2={pts.hipR[1]} />
        <line x1={pts.pelvis[0]} y1={pts.pelvis[1]} x2={pts.hipL[0]} y2={pts.hipL[1]} />
        <line x1={pts.hipR[0]} y1={pts.hipR[1]} x2={pts.kneeR[0]} y2={pts.kneeR[1]} />
        <line x1={pts.kneeR[0]} y1={pts.kneeR[1]} x2={pts.ankleR[0]} y2={pts.ankleR[1]} />
        <line x1={pts.hipL[0]} y1={pts.hipL[1]} x2={pts.kneeL[0]} y2={pts.kneeL[1]} />
        <line x1={pts.kneeL[0]} y1={pts.kneeL[1]} x2={pts.ankleL[0]} y2={pts.ankleL[1]} />
      </g>

      {/* Large high-contrast interactive draggable joint & IK handles */}
      {JOINT_ORDER.map((jointId) => {
        const [x, y] = pts[jointId]
        const isIK =
          jointId === "wristL" ||
          jointId === "wristR" ||
          jointId === "ankleL" ||
          jointId === "ankleR"
        const selected = selectedJoint === jointId
        const dragging = draggingJoint === jointId
        const hovered = hoveredJoint === jointId
        const active = selected || dragging || hovered
        const fill = dragging
          ? "#FFCB44"
          : selected
            ? "#FF2975"
            : hovered
              ? "#F97316"
              : "#00D4E8"
        const r = active ? 16 : isIK ? 14 : 11

        return (
          <g
            key={jointId}
            transform={`translate(${x}, ${y})`}
            style={{ cursor: isIK ? "move" : "grab" }}
            onPointerEnter={() => setHoveredJoint(jointId)}
            onPointerLeave={() =>
              setHoveredJoint((prev) => (prev === jointId ? null : prev))
            }
            onPointerDown={(e) => {
              e.stopPropagation()
              svgRef.current?.setPointerCapture(e.pointerId)
              onSelectJoint(jointId)
              setDraggingJoint(jointId)
            }}
          >
            {/* Generous touch/mouse hit target */}
            <circle r="34" fill="transparent" />

            {/* 4-way directional arrows on selected joint and hand/foot IK handles */}
            {(selected || dragging || isIK) &&
              FOUR_WAY_DIRS.map((d, di) => {
                const dist = r + (active ? 22 : 16)
                const size = active ? 11 : 8
                return (
                  <g
                    key={di}
                    transform={`translate(${d.dx * dist}, ${d.dy * dist}) rotate(${d.rot})`}
                  >
                    <polygon
                      points={`0,${-size} ${size * 0.78},${size * 0.65} ${-size * 0.78},${size * 0.65}`}
                      fill={fill}
                      stroke="#11131C"
                      strokeWidth="3"
                      strokeLinejoin="round"
                    />
                  </g>
                )
              })}

            {/* Outer dark contrast ring + vivid core handle */}
            <circle
              r={r + 3.5}
              fill="none"
              stroke="#11131C"
              strokeWidth="4.5"
              strokeOpacity="0.88"
            />
            <circle
              r={r}
              fill={fill}
              fillOpacity={active ? 0.95 : 0.78}
              stroke="#FFFFFF"
              strokeWidth="2.5"
            />
            {isIK && (
              <circle r="4.5" fill="#11131C" />
            )}
          </g>
        )
      })}
    </svg>
  )
}
