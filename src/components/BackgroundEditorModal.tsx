import { useEffect, useRef, useState } from "react"
import {
  Check,
  Circle,
  Crop,
  Eraser,
  Eye,
  Lasso,
  Paintbrush,
  RotateCcw,
  Scissors,
  Sliders,
  Sparkles,
  SquareDashed,
  Trash2,
  Undo2,
  Wand2,
  X,
  ZoomIn,
} from "lucide-react"
import { BottomSheet } from "./BottomSheet"
import { autoRemoveBackground, tightCropCanvas } from "../lib/backgroundRemover"
import { getApiUrl } from "../lib/aiHost"

type ToolMode = "wand" | "erase" | "restore" | "rect" | "ellipse" | "lasso"
type BackdropMode = "ghost" | "dark" | "neon"

interface BackgroundEditorModalProps {
  open: boolean
  originalImage: string
  initialTolerance?: number
  confirmLabel?: string
  onClose: () => void
  onSave: (croppedDataUrl: string) => void
}

const TOOL_BUTTONS: {
  id: ToolMode
  label: string
  hint: string
  Icon: typeof Wand2
}[] = [
  {
    id: "erase",
    label: "Erase BG",
    hint: "Drag over leftover background to erase it.",
    Icon: Eraser,
  },
  {
    id: "restore",
    label: "Restore",
    hint: "Drag over faded or missing parts of your garment to paint them back.",
    Icon: Paintbrush,
  },
  {
    id: "wand",
    label: "Magic Wand",
    hint: "Tap any color patch to select it, then tap Erase or Keep Only.",
    Icon: Wand2,
  },
  {
    id: "rect",
    label: "Box Select",
    hint: "Drag a box around your garment or background, then Erase or Keep Only.",
    Icon: SquareDashed,
  },
  {
    id: "ellipse",
    label: "Oval Select",
    hint: "Drag an oval over the area to keep or erase.",
    Icon: Circle,
  },
  {
    id: "lasso",
    label: "Lasso",
    hint: "Draw a freehand loop around your garment or background.",
    Icon: Lasso,
  },
]

const BRUSH_PRESETS = [
  { label: "Fine", size: 14 },
  { label: "Medium", size: 28 },
  { label: "Large", size: 46 },
]

export function BackgroundEditorModal({
  open,
  originalImage,
  initialTolerance = 32,
  confirmLabel = "Use Cutout & Scan",
  onClose,
  onSave,
}: BackgroundEditorModalProps) {
  const [tolerance, setTolerance] = useState(initialTolerance)
  const [tool, setTool] = useState<ToolMode>("erase")
  const [brushSize, setBrushSize] = useState(28)
  const [backdrop, setBackdrop] = useState<BackdropMode>("ghost")
  const [zoom, setZoom] = useState<1 | 1.75 | 2.5>(1)
  const [busy, setBusy] = useState(false)
  const [statusLabel, setStatusLabel] = useState("Running AI Smart Cutout…")
  const [canUndo, setCanUndo] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)

  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const undoStackRef = useRef<ImageData[]>([])
  const selectionMaskRef = useRef<Uint8Array | null>(null)

  const drawingRef = useRef(false)
  const startPtRef = useRef<{ x: number; y: number } | null>(null)
  const lastPtRef = useRef<{ x: number; y: number } | null>(null)
  const lassoPtsRef = useRef<{ x: number; y: number }[]>([])

  const clearSelection = () => {
    selectionMaskRef.current = null
    setHasSelection(false)
    const overlay = overlayCanvasRef.current
    const ctx = overlay?.getContext("2d")
    if (overlay && ctx) {
      ctx.clearRect(0, 0, overlay.width, overlay.height)
    }
  }

  const drawCutoutToDisplay = (cutDataUrl: string, w: number, h: number) =>
    new Promise<void>((resolve) => {
      const cutImg = new Image()
      cutImg.onload = () => {
        const canvas = displayCanvasRef.current
        const overlay = overlayCanvasRef.current
        if (!canvas) {
          resolve()
          return
        }
        canvas.width = w
        canvas.height = h
        if (overlay) {
          overlay.width = w
          overlay.height = h
        }
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (ctx) {
          ctx.clearRect(0, 0, w, h)
          ctx.drawImage(cutImg, 0, 0, w, h)
          undoStackRef.current = []
          setCanUndo(false)
        }
        resolve()
      }
      cutImg.onerror = () => resolve()
      cutImg.src = cutDataUrl
    })

  // Run AI neural cutout (server rembg) first, seamlessly falling back to client-side auto-crop
  const runAutoCutout = async (mode: "ai" | "tolerance", tolValue = tolerance) => {
    const orig = originalCanvasRef.current
    if (!orig || !originalImage) return
    const { width: w, height: h } = orig
    setBusy(true)
    clearSelection()

    try {
      if (mode === "ai") {
        setStatusLabel("Running AI Smart Cutout…")
        try {
          const controller = new AbortController()
          const timer = window.setTimeout(() => controller.abort(), 14000)
          const resp = await fetch(getApiUrl("/api/wardrobe/remove-bg"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: originalImage, maxDimension: 560 }),
            signal: controller.signal,
          }).finally(() => window.clearTimeout(timer))

          if (resp.ok) {
            const json = (await resp.json()) as { imageDataUrl?: string }
            if (json.imageDataUrl) {
              await drawCutoutToDisplay(json.imageDataUrl, w, h)
              setStatusLabel("AI cutout ready — touch up any spots below")
              return
            }
          }
        } catch {
          // Server rembg unavailable — fall back cleanly to local browser cutout
        }
      }

      setStatusLabel("Applying color-based cutout…")
      const res = await autoRemoveBackground(originalImage, {
        tolerance: tolValue,
        tightCrop: false,
        maxDimension: 560,
      })
      await drawCutoutToDisplay(res.dataUrl, w, h)
      setStatusLabel("Cutout ready — touch up any spots below")
    } finally {
      setBusy(false)
    }
  }

  // Load original photo on open & run AI Smart Cutout automatically
  useEffect(() => {
    if (!open || !originalImage) return
    let cancelled = false
    setBusy(true)
    setZoom(1)
    setStatusLabel("Running AI Smart Cutout…")
    clearSelection()

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      const scale = Math.min(1, 560 / Math.max(img.width, img.height, 1))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))

      const origCanvas = document.createElement("canvas")
      origCanvas.width = w
      origCanvas.height = h
      const origCtx = origCanvas.getContext("2d", { willReadFrequently: true })
      origCtx?.drawImage(img, 0, 0, w, h)
      originalCanvasRef.current = origCanvas

      void runAutoCutout("ai", initialTolerance)
    }
    img.src = originalImage
    return () => {
      cancelled = true
    }
  }, [open, originalImage])

  const renderSelectionMaskOverlay = (mask: Uint8Array, w: number, h: number) => {
    const overlay = overlayCanvasRef.current
    const ctx = overlay?.getContext("2d")
    if (!overlay || !ctx) return
    overlay.width = w
    overlay.height = h
    ctx.clearRect(0, 0, w, h)
    const imgData = ctx.createImageData(w, h)
    const out = imgData.data
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        if (!mask[idx]) continue
        const isEdge =
          x === 0 ||
          x === w - 1 ||
          y === 0 ||
          y === h - 1 ||
          !mask[idx - 1] ||
          !mask[idx + 1] ||
          !mask[idx - w] ||
          !mask[idx + w]
        const p = idx * 4
        if (isEdge) {
          // High-visibility bright gold border for low vision
          out[p] = 255
          out[p + 1] = 203
          out[p + 2] = 68
          out[p + 3] = 255
        } else {
          out[p] = 225
          out[p + 1] = 29
          out[p + 2] = 116
          out[p + 3] = 110
        }
      }
    }
    ctx.putImageData(imgData, 0, 0)
  }

  const pushUndo = () => {
    const canvas = displayCanvasRef.current
    const ctx = canvas?.getContext("2d", { willReadFrequently: true })
    if (!canvas || !ctx) return
    undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (undoStackRef.current.length > 20) undoStackRef.current.shift()
    setCanUndo(true)
  }

  const handleUndo = () => {
    const canvas = displayCanvasRef.current
    const ctx = canvas?.getContext("2d", { willReadFrequently: true })
    const prev = undoStackRef.current.pop()
    if (canvas && ctx && prev) {
      ctx.putImageData(prev, 0, 0)
    }
    setCanUndo(undoStackRef.current.length > 0)
  }

  const handleResetOriginal = () => {
    const canvas = displayCanvasRef.current
    const orig = originalCanvasRef.current
    if (!canvas || !orig) return
    pushUndo()
    clearSelection()
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(orig, 0, 0)
    }
  }

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = displayCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: Math.max(0, Math.min(canvas.width - 1, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height - 1, (e.clientY - rect.top) * scaleY)),
    }
  }

  const runMagicWandAt = (pt: { x: number; y: number }) => {
    const orig = originalCanvasRef.current
    const canvas = displayCanvasRef.current
    if (!orig || !canvas) return
    const w = orig.width
    const h = orig.height
    const origData = orig.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, w, h).data
    if (!origData) return

    const sx = Math.round(pt.x)
    const sy = Math.round(pt.y)
    const sIdx = (sy * w + sx) * 4
    const tR = origData[sIdx]
    const tG = origData[sIdx + 1]
    const tB = origData[sIdx + 2]

    const mask = new Uint8Array(w * h)
    const queue = new Int32Array(w * h)
    let head = 0
    let tail = 0
    const startLinear = sy * w + sx
    mask[startLinear] = 1
    queue[tail++] = startLinear

    const tolSq = tolerance * tolerance * 1.6

    while (head < tail) {
      const idx = queue[head++]
      const x = idx % w
      const y = (idx - x) / w

      const tryNeighbor = (n: number) => {
        if (mask[n]) return
        const p = n * 4
        const dr = origData[p] - tR
        const dg = origData[p + 1] - tG
        const db = origData[p + 2] - tB
        if (dr * dr + dg * dg + db * db <= tolSq) {
          mask[n] = 1
          queue[tail++] = n
        }
      }

      if (x > 0) tryNeighbor(idx - 1)
      if (x + 1 < w) tryNeighbor(idx + 1)
      if (y > 0) tryNeighbor(idx - w)
      if (y + 1 < h) tryNeighbor(idx + w)
    }

    selectionMaskRef.current = mask
    setHasSelection(true)
    renderSelectionMaskOverlay(mask, w, h)
  }

  const commitShapeSelection = (drawShape: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = displayCanvasRef.current
    if (!canvas) return
    const { width: w, height: h } = canvas
    const scratch = document.createElement("canvas")
    scratch.width = w
    scratch.height = h
    const sCtx = scratch.getContext("2d", { willReadFrequently: true })
    if (!sCtx) return
    sCtx.fillStyle = "#ffffff"
    drawShape(sCtx)
    const data = sCtx.getImageData(0, 0, w, h).data
    const mask = new Uint8Array(w * h)
    let count = 0
    for (let i = 0; i < w * h; i++) {
      if (data[i * 4 + 3] > 128) {
        mask[i] = 1
        count++
      }
    }
    if (count < 16) {
      clearSelection()
      return
    }
    selectionMaskRef.current = mask
    setHasSelection(true)
    renderSelectionMaskOverlay(mask, w, h)
  }

  const drawLiveDragPreview = (current: { x: number; y: number }) => {
    const overlay = overlayCanvasRef.current
    const ctx = overlay?.getContext("2d")
    const start = startPtRef.current
    if (!overlay || !ctx || !start) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    ctx.save()
    ctx.strokeStyle = "#FFCB44"
    ctx.fillStyle = "rgba(225, 29, 116, 0.32)"
    ctx.lineWidth = 3
    ctx.setLineDash([7, 4])

    if (tool === "rect") {
      const rx = Math.min(start.x, current.x)
      const ry = Math.min(start.y, current.y)
      const rw = Math.abs(current.x - start.x)
      const rh = Math.abs(current.y - start.y)
      ctx.fillRect(rx, ry, rw, rh)
      ctx.strokeRect(rx, ry, rw, rh)
    } else if (tool === "ellipse") {
      const cx = (start.x + current.x) / 2
      const cy = (start.y + current.y) / 2
      const rx = Math.max(1, Math.abs(current.x - start.x) / 2)
      const ry = Math.max(1, Math.abs(current.y - start.y) / 2)
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else if (tool === "lasso" && lassoPtsRef.current.length > 1) {
      const pts = lassoPtsRef.current
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  const applySelectionAction = (action: "erase_inside" | "keep_only" | "restore_inside") => {
    const canvas = displayCanvasRef.current
    const orig = originalCanvasRef.current
    const mask = selectionMaskRef.current
    if (!canvas || !mask) return
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return

    pushUndo()
    const { width: w, height: h } = canvas
    const imgData = ctx.getImageData(0, 0, w, h)
    const data = imgData.data
    const origData = orig?.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, w, h).data

    for (let i = 0; i < w * h; i++) {
      const inSel = mask[i] === 1
      const p = i * 4
      if (action === "erase_inside" && inSel) {
        data[p + 3] = 0
      } else if (action === "keep_only" && !inSel) {
        data[p + 3] = 0
      } else if (action === "restore_inside" && inSel && origData) {
        data[p] = origData[p]
        data[p + 1] = origData[p + 1]
        data[p + 2] = origData[p + 2]
        data[p + 3] = origData[p + 3]
      }
    }

    ctx.putImageData(imgData, 0, 0)
    clearSelection()
  }

  const paintStroke = (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const canvas = displayCanvasRef.current
    const orig = originalCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.max(1, Math.hypot(dx, dy))
    const steps = Math.ceil(dist / Math.max(2, brushSize * 0.25))
    const radius = brushSize / 2

    if (tool === "erase") {
      ctx.save()
      ctx.globalCompositeOperation = "destination-out"
      ctx.fillStyle = "rgba(0,0,0,1)"
      for (let i = 0; i <= steps; i++) {
        const px = from.x + (dx * i) / steps
        const py = from.y + (dy * i) / steps
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    } else if (tool === "restore" && orig) {
      ctx.save()
      for (let i = 0; i <= steps; i++) {
        const px = from.x + (dx * i) / steps
        const py = from.y + (dy * i) / steps
        ctx.save()
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(orig, 0, 0)
        ctx.restore()
      }
      ctx.restore()
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = getCanvasPoint(e)
    if (!pt) return

    if (tool === "wand") {
      runMagicWandAt(pt)
      return
    }

    if (tool === "erase" || tool === "restore") {
      clearSelection()
      pushUndo()
      drawingRef.current = true
      lastPtRef.current = pt
      paintStroke(pt, pt)
      return
    }

    clearSelection()
    drawingRef.current = true
    startPtRef.current = pt
    lastPtRef.current = pt
    if (tool === "lasso") {
      lassoPtsRef.current = [pt]
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPtRef.current) return
    const pt = getCanvasPoint(e)
    if (!pt) return

    if (tool === "erase" || tool === "restore") {
      paintStroke(lastPtRef.current, pt)
      lastPtRef.current = pt
      return
    }

    if (tool === "lasso") {
      const prev = lassoPtsRef.current[lassoPtsRef.current.length - 1]
      if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) >= 3) {
        lassoPtsRef.current.push(pt)
      }
    }
    lastPtRef.current = pt
    drawLiveDragPreview(pt)
  }

  const handlePointerUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false

    const start = startPtRef.current
    const end = lastPtRef.current

    if (tool === "rect" && start && end) {
      const rx = Math.min(start.x, end.x)
      const ry = Math.min(start.y, end.y)
      const rw = Math.abs(end.x - start.x)
      const rh = Math.abs(end.y - start.y)
      commitShapeSelection((ctx) => {
        ctx.fillRect(rx, ry, rw, rh)
      })
    } else if (tool === "ellipse" && start && end) {
      const cx = (start.x + end.x) / 2
      const cy = (start.y + end.y) / 2
      const rx = Math.max(1, Math.abs(end.x - start.x) / 2)
      const ry = Math.max(1, Math.abs(end.y - start.y) / 2)
      commitShapeSelection((ctx) => {
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.fill()
      })
    } else if (tool === "lasso" && lassoPtsRef.current.length >= 3) {
      const pts = [...lassoPtsRef.current]
      commitShapeSelection((ctx) => {
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y)
        }
        ctx.closePath()
        ctx.fill()
      })
    }

    startPtRef.current = null
    lastPtRef.current = null
    lassoPtsRef.current = []
  }

  const handleApply = async () => {
    const canvas = displayCanvasRef.current
    if (!canvas) return
    setBusy(true)
    try {
      const croppedUrl = await tightCropCanvas(canvas)
      onSave(croppedUrl)
    } finally {
      setBusy(false)
    }
  }

  const isBrushTool = tool === "erase" || tool === "restore"
  const activeToolMeta = TOOL_BUTTONS.find((t) => t.id === tool)!

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Crop & Isolate Garment"
      subtitle={statusLabel}
      icon={<Scissors className="w-4 h-4 text-pink" />}
      titleId="bg-editor-sheet-title"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] px-4 rounded-xl text-xs font-bold border border-border bg-muted text-foreground cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleApply()}
            className="btn-shine btn-lumina-primary flex-1 min-h-[46px] rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4" strokeWidth={2.5} />
            <span>{busy ? "Preparing…" : confirmLabel}</span>
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {/* Top Accessibility Bar: High-Contrast Backdrop + Zoom + AI Re-Cut */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Backdrop Contrast Switcher (makes missing sleeves & stray BG pop for low vision!) */}
          <div
            role="group"
            aria-label="Preview contrast backdrop"
            className="inline-flex items-center rounded-xl p-0.5 bg-muted border border-border"
          >
            {(
              [
                { id: "ghost", label: "Ghost" },
                { id: "dark", label: "Black" },
                { id: "neon", label: "Green" },
              ] as const
            ).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBackdrop(b.id)}
                aria-pressed={backdrop === b.id}
                className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 ${
                  backdrop === b.id
                    ? "bg-card text-foreground shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {b.id === "ghost" && <Eye className="w-3 h-3 text-turquoise" />}
                <span>{b.label}</span>
              </button>
            ))}
          </div>

          {/* 1-Tap Zoom Cycle + AI Auto Cutout */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setZoom((z) => (z === 1 ? 1.75 : z === 1.75 ? 2.5 : 1))
              }
              aria-label={`Zoom canvas (currently ${zoom}x)`}
              className={`min-h-[34px] px-2.5 rounded-xl text-[11px] font-bold border inline-flex items-center gap-1 cursor-pointer ${
                zoom > 1
                  ? "bg-turquoise/15 border-turquoise text-turquoise"
                  : "bg-muted/70 border-border text-foreground"
              }`}
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>{zoom}×</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void runAutoCutout("ai")}
              className="min-h-[34px] px-2.5 rounded-xl text-[11px] font-bold border border-gold/50 bg-[#FFCB44]/15 text-foreground hover:bg-[#FFCB44]/25 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-gold" />
              <span>AI Auto</span>
            </button>
          </div>
        </div>

        {/* High-Visibility Canvas Viewport (scrolls cleanly when zoomed) */}
        <div
          className="relative rounded-2xl border-2 border-border overflow-auto flex items-center justify-center min-h-[220px] max-h-[300px]"
          style={{
            backgroundColor:
              backdrop === "neon"
                ? "#00C853"
                : "#070911",
          }}
        >
          <div
            className="relative inline-flex items-center justify-center transition-transform origin-center"
            style={{
              width: zoom === 1 ? "auto" : `${Math.round(zoom * 100)}%`,
            }}
          >
            {/* Ghost Original Underlay (22% opacity so low-vision users immediately spot missing sleeves!) */}
            {backdrop === "ghost" && originalImage && (
              <img
                src={originalImage}
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none absolute inset-0 w-full h-full object-contain opacity-25 grayscale-[35%]"
              />
            )}

            <canvas
              ref={displayCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                filter:
                  backdrop === "ghost"
                    ? "drop-shadow(0 0 2px #FFCB44)"
                    : undefined,
              }}
              className={`max-w-full w-auto h-auto touch-none cursor-crosshair block relative z-10 ${
                zoom === 1 ? "max-h-[288px]" : "max-h-none w-full"
              }`}
            />
            <canvas
              ref={overlayCanvasRef}
              className="pointer-events-none absolute inset-0 w-full h-full z-20"
            />
          </div>

          {busy && (
            <div className="absolute inset-0 z-30 bg-background/75 backdrop-blur-xs flex flex-col items-center justify-center gap-1.5 text-xs font-bold text-foreground">
              <Sparkles className="w-5 h-5 text-gold animate-pulse" />
              <span>{statusLabel}</span>
            </div>
          )}
        </div>

        {/* Active Selection Action Bar (Large 44px Low-Vision Buttons) */}
        {hasSelection && (
          <div className="rounded-2xl p-2.5 bg-pink/10 border-2 border-pink/50 space-y-2 animate-in fade-in duration-150">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => applySelectionAction("erase_inside")}
                className="min-h-[44px] px-3 rounded-xl text-xs font-bold bg-pink text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Erase Selected</span>
              </button>
              <button
                type="button"
                onClick={() => applySelectionAction("keep_only")}
                className="min-h-[44px] px-3 rounded-xl text-xs font-bold bg-turquoise text-accent-foreground inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Crop className="w-4 h-4" />
                <span>Keep Only</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => applySelectionAction("restore_inside")}
                className="flex-1 min-h-[38px] px-3 rounded-xl text-xs font-bold bg-card border border-border text-foreground cursor-pointer"
              >
                Restore Selected
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="min-h-[38px] px-3 rounded-xl text-xs font-semibold bg-muted text-foreground inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        )}

        {/* Clear Plain-English Guidance Banner */}
        <p className="text-xs font-semibold text-foreground bg-muted/70 border border-border rounded-xl px-3 py-2 leading-snug">
          <span className="text-turquoise font-bold">{activeToolMeta.label}: </span>
          {activeToolMeta.hint}
        </p>

        {/* Large Low-Vision-Friendly 3x2 Tool Grid + Undo / Reset */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {TOOL_BUTTONS.map(({ id, label, Icon }) => {
              const active = tool === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTool(id)}
                  aria-pressed={active}
                  className={`min-h-[46px] px-2 py-2 rounded-xl border-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? "bg-pink text-white border-pink shadow-sm"
                      : "bg-muted/60 border-border text-foreground hover:border-turquoise/60"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={2.2} />
                  <span className="text-xs font-bold leading-none truncate">
                    {label}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canUndo}
              onClick={handleUndo}
              className="min-h-[40px] px-3 rounded-xl border border-border bg-muted/60 text-foreground disabled:opacity-35 inline-flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer"
            >
              <Undo2 className="w-4 h-4" />
              <span>Undo Last Edit</span>
            </button>
            <button
              type="button"
              onClick={handleResetOriginal}
              className="min-h-[40px] px-3 rounded-xl border border-border bg-muted/60 text-foreground hover:border-pink/60 inline-flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Photo</span>
            </button>
          </div>
        </div>

        {/* Context-Sensitive Size Presets or Tolerance Slider */}
        <div className="space-y-2 pt-2 border-t border-border">
          {isBrushTool ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground">
                  Brush Size
                </span>
                <div className="flex items-center gap-1.5">
                  {BRUSH_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setBrushSize(p.size)}
                      aria-pressed={brushSize === p.size}
                      className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                        brushSize === p.size
                          ? "bg-turquoise text-accent-foreground border-turquoise"
                          : "bg-muted text-foreground border-border"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="range"
                min={10}
                max={64}
                step={2}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                aria-label="Brush size"
                className="w-full accent-turquoise cursor-pointer"
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground inline-flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-turquoise" />
                  {tool === "wand" ? "Magic Wand Sensitivity" : "Color Cutout Sensitivity"}
                </span>
                <span className="font-mono text-xs text-turquoise font-bold">
                  {tolerance}
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={78}
                step={2}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                aria-label="Magic wand sensitivity"
                className="w-full accent-pink cursor-pointer"
              />
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
