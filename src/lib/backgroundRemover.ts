export interface AutoCropOptions {
  /** Color distance tolerance (10..80). Default 32. */
  tolerance?: number
  /** Soft edge feather band width. Default 14. */
  feather?: number
  /** Whether to tight-crop transparent padding. Default true. */
  tightCrop?: boolean
  /** Max output dimension (px) to keep localStorage & UI fast. Default 768. */
  maxDimension?: number
}

export interface AutoCropResult {
  dataUrl: string
  width: number
  height: number
  removedRatio: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load image for cropping."))
    img.src = src
  })
}

/**
 * Automatically detects the border background color, removes connected background
 * pixels via edge-seeded flood-fill with soft anti-aliased edges, and tight-crops
 * the garment into a transparent PNG data URL.
 */
export async function autoRemoveBackground(
  sourceDataUrl: string,
  options: AutoCropOptions = {},
): Promise<AutoCropResult> {
  const {
    tolerance = 32,
    feather = 14,
    tightCrop = true,
    maxDimension = 768,
  } = options

  const img = await loadImage(sourceDataUrl)
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) {
    return { dataUrl: sourceDataUrl, width: w, height: h, removedRatio: 0 }
  }

  ctx.drawImage(img, 0, 0, w, h)
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Helper to run one edge-seeded flood-fill pass inside an active bounding box
  const runFloodPass = (
    boxMinX: number,
    boxMinY: number,
    boxMaxX: number,
    boxMaxY: number,
    passTol: number,
    passFeather: number,
  ): number => {
    const rs: number[] = []
    const gs: number[] = []
    const bs: number[] = []
    const samplePixel = (x: number, y: number) => {
      const idx = (y * w + x) * 4
      if (data[idx + 3] < 20) return
      rs.push(data[idx])
      gs.push(data[idx + 1])
      bs.push(data[idx + 2])
    }

    const bw = boxMaxX - boxMinX + 1
    const bh = boxMaxY - boxMinY + 1
    const stepX = Math.max(1, Math.floor(bw / 40))
    const stepY = Math.max(1, Math.floor(bh / 40))
    for (let x = boxMinX; x <= boxMaxX; x += stepX) {
      samplePixel(x, boxMinY)
      samplePixel(x, boxMaxY)
    }
    for (let y = boxMinY; y <= boxMaxY; y += stepY) {
      samplePixel(boxMinX, y)
      samplePixel(boxMaxX, y)
    }
    if (rs.length < 8) return 0

    rs.sort((a, b) => a - b)
    gs.sort((a, b) => a - b)
    bs.sort((a, b) => a - b)
    const mid = Math.floor(rs.length / 2)
    const bgR = rs[mid]
    const bgG = gs[mid]
    const bgB = bs[mid]

    const total = w * h
    const dists = new Float32Array(total)
    const visited = new Uint8Array(total)
    const maxDist = passTol + passFeather

    for (let y = boxMinY; y <= boxMaxY; y++) {
      for (let x = boxMinX; x <= boxMaxX; x++) {
        const i = y * w + x
        const p = i * 4
        const dr = data[p] - bgR
        const dg = data[p + 1] - bgG
        const db = data[p + 2] - bgB
        dists[i] = Math.sqrt(dr * dr + dg * dg + db * db)
      }
    }

    const queue = new Int32Array(total)
    let head = 0
    let tail = 0

    const trySeed = (x: number, y: number) => {
      const idx = y * w + x
      if (!visited[idx] && (data[idx * 4 + 3] < 20 || dists[idx] <= maxDist)) {
        visited[idx] = 1
        queue[tail++] = idx
      }
    }

    for (let x = boxMinX; x <= boxMaxX; x++) {
      trySeed(x, boxMinY)
      trySeed(x, boxMaxY)
    }
    for (let y = boxMinY; y <= boxMaxY; y++) {
      trySeed(boxMinX, y)
      trySeed(boxMaxX, y)
    }

    while (head < tail) {
      const idx = queue[head++]
      const x = idx % w
      const y = (idx - x) / w

      if (x > boxMinX) {
        const n = idx - 1
        if (!visited[n] && dists[n] <= maxDist) {
          visited[n] = 1
          queue[tail++] = n
        }
      }
      if (x < boxMaxX) {
        const n = idx + 1
        if (!visited[n] && dists[n] <= maxDist) {
          visited[n] = 1
          queue[tail++] = n
        }
      }
      if (y > boxMinY) {
        const n = idx - w
        if (!visited[n] && dists[n] <= maxDist) {
          visited[n] = 1
          queue[tail++] = n
        }
      }
      if (y < boxMaxY) {
        const n = idx + w
        if (!visited[n] && dists[n] <= maxDist) {
          visited[n] = 1
          queue[tail++] = n
        }
      }
    }

    let removed = 0
    for (let y = boxMinY; y <= boxMaxY; y++) {
      for (let x = boxMinX; x <= boxMaxX; x++) {
        const i = y * w + x
        if (!visited[i]) continue
        const p = i * 4
        const d = dists[i]
        if (d <= passTol) {
          if (data[p + 3] > 0) removed++
          data[p + 3] = 0
        } else if (passFeather > 0) {
          const ratio = (d - passTol) / passFeather
          data[p + 3] = Math.round(data[p + 3] * Math.max(0, Math.min(1, ratio)))
        }
      }
    }
    return removed
  }

  // Pass 1: Remove outer background (or white framing margin)
  let totalRemoved = runFloodPass(0, 0, w - 1, h - 1, tolerance, feather)

  // Pass 2: If an inner rectangular backdrop remains (e.g. grey studio wall inside a white frame),
  // compute the new opaque bbox and run a second pass seeded from its edges
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX - minX > 30 && maxY - minY > 30 && (minX > 4 || minY > 4 || maxX < w - 5 || maxY < h - 5)) {
    totalRemoved += runFloodPass(minX, minY, maxX, maxY, tolerance, feather)
  }

  ctx.putImageData(imageData, 0, 0)
  return finishCrop(canvas, data, w, h, tightCrop, totalRemoved / (w * h))
}

function finishCrop(
  canvas: HTMLCanvasElement,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tightCrop: boolean,
  removedRatio: number,
): AutoCropResult {
  if (!tightCrop) {
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: w,
      height: h,
      removedRatio,
    }
  }

  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: w,
      height: h,
      removedRatio,
    }
  }

  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1
  const pad = Math.max(8, Math.round(Math.max(cropW, cropH) * 0.04))
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const sw = Math.min(w - sx, cropW + pad * 2)
  const sh = Math.min(h - sy, cropH + pad * 2)

  const out = document.createElement("canvas")
  out.width = sw
  out.height = sh
  const outCtx = out.getContext("2d")
  if (outCtx) {
    outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
  }

  return {
    dataUrl: out.toDataURL("image/png"),
    width: sw,
    height: sh,
    removedRatio,
  }
}

/**
 * Tight-crops any transparent PNG data URL (used when saving manual brush edits).
 */
export async function tightCropCanvas(
  canvas: HTMLCanvasElement,
): Promise<string> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return canvas.toDataURL("image/png")
  const { width: w, height: h } = canvas
  const data = ctx.getImageData(0, 0, w, h).data
  return finishCrop(canvas, data, w, h, true, 0).dataUrl
}
