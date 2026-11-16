/** 37 body regions + landmark tables from body-explorer-spec.md */
import * as THREE from "three"

export type BodyViewMode = "surface" | "muscles"

export type RegionId =
  | "head"
  | "neck"
  | "chest"
  | "abdomen"
  | "upper_back"
  | "lower_back"
  | "left_shoulder"
  | "right_shoulder"
  | "left_upper_arm"
  | "right_upper_arm"
  | "left_elbow"
  | "right_elbow"
  | "left_forearm"
  | "right_forearm"
  | "left_wrist"
  | "right_wrist"
  | "left_hand"
  | "right_hand"
  | "left_hip"
  | "right_hip"
  | "left_glute"
  | "right_glute"
  | "left_thigh"
  | "right_thigh"
  | "left_hamstring"
  | "right_hamstring"
  | "left_knee"
  | "right_knee"
  | "left_shin"
  | "right_shin"
  | "left_calf"
  | "right_calf"
  | "left_ankle"
  | "right_ankle"
  | "left_foot"
  | "right_foot"

export interface Landmark {
  id: RegionId
  position: [number, number, number]
  label: string
  group: "Head & torso" | "Arms & hands" | "Legs & feet"
  rear?: boolean
}

const PAIRED: {
  base: string
  label: string
  group: Landmark["group"]
  rear?: boolean
  surface: [number, number, number]
  muscles: [number, number, number]
}[] = [
  {
    base: "shoulder",
    label: "Shoulder",
    group: "Arms & hands",
    surface: [0.363, 0.963, -0.1257],
    muscles: [0.38, 0.91, 0.0162],
  },
  {
    base: "upper_arm",
    label: "Upper arm",
    group: "Arms & hands",
    surface: [0.53, 0.77, -0.132],
    muscles: [0.37, 0.68, 0.0071],
  },
  {
    base: "elbow",
    label: "Elbow",
    group: "Arms & hands",
    surface: [0.69, 0.579, -0.0903],
    muscles: [0.44, 0.4, -0.0358],
  },
  {
    base: "forearm",
    label: "Forearm",
    group: "Arms & hands",
    surface: [0.8, 0.46, 0.0253],
    muscles: [0.48, 0.17, 0.0336],
  },
  {
    base: "wrist",
    label: "Wrist",
    group: "Arms & hands",
    surface: [0.915, 0.355, 0.2089],
    muscles: [0.52, -0.03, 0.0423],
  },
  {
    base: "hand",
    label: "Hand",
    group: "Arms & hands",
    surface: [1.015, 0.18, 0.3598],
    muscles: [0.54, -0.2, 0.0721],
  },
  {
    base: "chest",
    label: "Chest",
    group: "Head & torso",
    surface: [0.19, 0.86, -0.017],
    muscles: [0.16, 0.83, 0.2027],
  },
  {
    base: "hip",
    label: "Hip",
    group: "Legs & feet",
    surface: [0.31, -0.04, -0.0318],
    muscles: [0.25, -0.08, 0.0659],
  },
  {
    base: "glute",
    label: "Glute",
    group: "Legs & feet",
    rear: true,
    surface: [0.19, -0.16, -0.392],
    muscles: [0.15, -0.17, -0.1734],
  },
  {
    base: "thigh",
    label: "Thigh",
    group: "Legs & feet",
    surface: [0.255, -0.42, 0.0313],
    muscles: [0.18, -0.43, 0.0993],
  },
  {
    base: "hamstring",
    label: "Hamstring",
    group: "Legs & feet",
    rear: true,
    surface: [0.255, -0.42, -0.3787],
    muscles: [0.18, -0.43, -0.1415],
  },
  {
    base: "knee",
    label: "Knee",
    group: "Legs & feet",
    surface: [0.28, -0.75, -0.0953],
    muscles: [0.17, -0.78, 0.0298],
  },
  {
    base: "shin",
    label: "Shin",
    group: "Legs & feet",
    surface: [0.31, -1.13, -0.1619],
    muscles: [0.16, -1.12, -0.013],
  },
  {
    base: "calf",
    label: "Calf",
    group: "Legs & feet",
    rear: true,
    surface: [0.31, -1.13, -0.3715],
    muscles: [0.16, -1.12, -0.1978],
  },
  {
    base: "ankle",
    label: "Ankle",
    group: "Legs & feet",
    surface: [0.353, -1.5, -0.1485],
    muscles: [0.15, -1.47, -0.0479],
  },
  {
    base: "foot",
    label: "Foot",
    group: "Legs & feet",
    surface: [0.35, -1.635, 0.0393],
    muscles: [0.15, -1.62, 0.0901],
  },
]

const MIDLINE: {
  id: RegionId
  label: string
  group: Landmark["group"]
  rear?: boolean
  surface: [number, number, number]
  muscles: [number, number, number]
}[] = [
  {
    id: "head",
    label: "Head",
    group: "Head & torso",
    surface: [0, 1.4, 0.0192],
    muscles: [0, 1.4, 0.1607],
  },
  {
    id: "neck",
    label: "Neck",
    group: "Head & torso",
    surface: [0, 1.13, -0.096],
    muscles: [0, 1.12, 0.0634],
  },
  {
    id: "abdomen",
    label: "Abdomen",
    group: "Head & torso",
    surface: [0, 0.42, 0.0133],
    muscles: [0, 0.4, 0.1972],
  },
  {
    id: "upper_back",
    label: "Upper back",
    group: "Head & torso",
    rear: true,
    surface: [0, 0.84, -0.431],
    muscles: [0, 0.83, -0.1911],
  },
  {
    id: "lower_back",
    label: "Lower back",
    group: "Head & torso",
    rear: true,
    surface: [0, 0.374, -0.3467],
    muscles: [0, 0.35, -0.144],
  },
]

function buildLandmarks(mode: BodyViewMode): Landmark[] {
  const out: Landmark[] = []
  // Spec: every paired area as (right, left) in list order, then midline
  for (const p of PAIRED) {
    const pos = mode === "surface" ? p.surface : p.muscles
    const [x, y, z] = pos
    out.push({
      id: `right_${p.base}` as RegionId,
      position: [-x, y, z],
      label: `Right ${p.label.toLowerCase()}`,
      group: p.group,
      rear: p.rear,
    })
    out.push({
      id: `left_${p.base}` as RegionId,
      position: [x, y, z],
      label: `Left ${p.label.toLowerCase()}`,
      group: p.group,
      rear: p.rear,
    })
  }
  for (const m of MIDLINE) {
    out.push({
      id: m.id,
      position: mode === "surface" ? m.surface : m.muscles,
      label: m.label,
      group: m.group,
      rear: m.rear,
    })
  }
  return out
}

export const SURFACE_LANDMARKS = buildLandmarks("surface")
export const MUSCLES_LANDMARKS = buildLandmarks("muscles")

export function landmarksFor(mode: BodyViewMode): Landmark[] {
  return mode === "surface" ? SURFACE_LANDMARKS : MUSCLES_LANDMARKS
}

export function regionIndex(landmarks: Landmark[], id: RegionId | null): number {
  if (!id) return -1
  return landmarks.findIndex((l) => l.id === id)
}

export function isRearRegion(id: RegionId | null, landmarks: Landmark[]): boolean {
  if (!id) return false
  return Boolean(landmarks.find((l) => l.id === id)?.rear)
}

/** Assign every triangle to a region; writes Float32 bodyRegion attribute. */
export function assignBodyRegions(
  mesh: THREE.Mesh,
  landmarks: Landmark[],
): void {
  const geometry = mesh.geometry
  if (!geometry?.attributes?.position) return

  // Prefer indexed path: assign per-triangle into a vertex attribute without
  // exploding morph/attribute layouts via toNonIndexed (which shattered cloth).
  const indexed = geometry.index
  const pos = geometry.attributes.position
  const regions = new Float32Array(pos.count)
  const mw = mesh.matrixWorld
  const tmp = new THREE.Vector3()
  const headIdx = landmarks.findIndex((l) => l.id === "head")
  const neckIdx = landmarks.findIndex((l) => l.id === "neck")

  const pickRegion = (x: number, y: number, z: number) => {
    if (y >= 1.2) return headIdx >= 0 ? headIdx : 0
    if (y >= 1.02 && Math.abs(x) < 0.16) return neckIdx >= 0 ? neckIdx : 0
    let best = 0
    let bestCost = Infinity
    for (let li = 0; li < landmarks.length; li++) {
      const id = landmarks[li].id
      if (x < 0 && id.startsWith("left_")) continue
      if (x > 0 && id.startsWith("right_")) continue
      const [lx, ly, lz] = landmarks[li].position
      let cost =
        (x - lx) * (x - lx) + (y - ly) * (y - ly) + (z - lz) * (z - lz)
      if (
        id.endsWith("_elbow") ||
        id.endsWith("_wrist") ||
        id.endsWith("_knee") ||
        id.endsWith("_ankle")
      ) {
        cost *= 3
      }
      if (cost < bestCost) {
        bestCost = cost
        best = li
      }
    }
    return best
  }

  if (indexed) {
    const triCount = Math.floor(indexed.count / 3)
    for (let t = 0; t < triCount; t++) {
      const a = indexed.getX(t * 3)
      const b = indexed.getX(t * 3 + 1)
      const c = indexed.getX(t * 3 + 2)
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3
      const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3
      const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3
      tmp.set(cx, cy, cz).applyMatrix4(mw)
      const best = pickRegion(tmp.x, tmp.y, tmp.z)
      regions[a] = best
      regions[b] = best
      regions[c] = best
    }
  } else {
    const triCount = Math.floor(pos.count / 3)
    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3
      const cx = (pos.getX(i0) + pos.getX(i0 + 1) + pos.getX(i0 + 2)) / 3
      const cy = (pos.getY(i0) + pos.getY(i0 + 1) + pos.getY(i0 + 2)) / 3
      const cz = (pos.getZ(i0) + pos.getZ(i0 + 1) + pos.getZ(i0 + 2)) / 3
      tmp.set(cx, cy, cz).applyMatrix4(mw)
      const best = pickRegion(tmp.x, tmp.y, tmp.z)
      regions[i0] = best
      regions[i0 + 1] = best
      regions[i0 + 2] = best
    }
  }

  geometry.setAttribute("bodyRegion", new THREE.BufferAttribute(regions, 1))
}

export const REGION_GROUPS: Landmark["group"][] = [
  "Head & torso",
  "Arms & hands",
  "Legs & feet",
]

/** Body regions tinted when a garment layer is active (fitting-room mapping). */
export const GARMENT_REGION_MAP: Record<string, RegionId[]> = {
  Top: [
    "chest",
    "abdomen",
    "left_shoulder",
    "right_shoulder",
    "upper_back",
    "lower_back",
  ],
  Bottom: [
    "left_hip",
    "right_hip",
    "left_glute",
    "right_glute",
    "left_thigh",
    "right_thigh",
    "left_hamstring",
    "right_hamstring",
  ],
  Shoes: [
    "left_foot",
    "right_foot",
    "left_ankle",
    "right_ankle",
  ],
  Outerwear: [
    "chest",
    "abdomen",
    "left_upper_arm",
    "right_upper_arm",
    "left_shoulder",
    "right_shoulder",
    "upper_back",
    "lower_back",
  ],
}
