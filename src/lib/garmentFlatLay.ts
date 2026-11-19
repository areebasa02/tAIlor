import type { WardrobeItem } from "../types"
import { normalizeGarmentSlot } from "./garmentCategories"

function parseHexColor(hex: string, fallback = "#4A6FA5"): [number, number, number] {
  const clean = (hex || "").trim().replace("#", "")
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.slice(0, 6)
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return parseHexColor(fallback, "#4A6FA5")
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function adjustRgb(
  rgb: [number, number, number],
  delta: number,
): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `rgb(${clamp(rgb[0] + delta)}, ${clamp(rgb[1] + delta)}, ${clamp(rgb[2] + delta)})`
}

function drawTopGarment(
  ctx: CanvasRenderingContext2D,
  name: string,
  rgb: [number, number, number],
  isOuterwear: boolean,
) {
  const lower = name.toLowerCase()
  const isSleeveless = lower.includes("tank") || lower.includes("vest")
  const isButtonUp =
    isOuterwear ||
    lower.includes("button") ||
    lower.includes("oxford") ||
    lower.includes("blouse") ||
    lower.includes("shirt") ||
    lower.includes("trench") ||
    lower.includes("cardigan") ||
    lower.includes("blazer") ||
    lower.includes("coat") ||
    lower.includes("jacket")
  const isShortSleeve =
    lower.includes("tee") ||
    lower.includes("short") ||
    lower.includes("polo")

  const base = adjustRgb(rgb, 0)
  const light = adjustRgb(rgb, 24)
  const shade = adjustRgb(rgb, -28)
  const stroke = adjustRgb(rgb, -46)

  const grad = ctx.createLinearGradient(180, 120, 588, 860)
  grad.addColorStop(0, light)
  grad.addColorStop(0.55, base)
  grad.addColorStop(1, shade)

  const bottomY = isOuterwear ? 900 : 790
  const sleeveEndX = isSleeveless ? 245 : isShortSleeve ? 132 : 84
  const sleeveEndY = isSleeveless ? 340 : isShortSleeve ? 405 : 730
  const sleeveCuffInX = isSleeveless ? 255 : isShortSleeve ? 195 : 152
  const sleeveCuffInY = isSleeveless ? 410 : isShortSleeve ? 448 : 755

  // Main silhouette
  ctx.save()
  ctx.shadowColor = "rgba(18, 22, 34, 0.14)"
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 14
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(318, 150)
  ctx.quadraticCurveTo(384, 198, 450, 150)
  ctx.lineTo(548, 188)
  if (!isSleeveless) {
    ctx.lineTo(768 - sleeveEndX, sleeveEndY)
    ctx.lineTo(768 - sleeveCuffInX, sleeveCuffInY)
    ctx.lineTo(564, 412)
  } else {
    ctx.quadraticCurveTo(540, 310, 560, 412)
  }
  ctx.lineTo(582, bottomY)
  ctx.quadraticCurveTo(384, bottomY + 18, 186, bottomY)
  ctx.lineTo(204, 412)
  if (!isSleeveless) {
    ctx.lineTo(sleeveCuffInX, sleeveCuffInY)
    ctx.lineTo(sleeveEndX, sleeveEndY)
  } else {
    ctx.quadraticCurveTo(228, 310, 220, 188)
  }
  ctx.lineTo(220, 188)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Outline & seam details
  ctx.strokeStyle = stroke
  ctx.lineWidth = 4
  ctx.lineJoin = "round"
  ctx.stroke()

  // Neckline / collar
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.moveTo(318, 150)
  ctx.quadraticCurveTo(384, 212, 450, 150)
  ctx.quadraticCurveTo(384, 174, 318, 150)
  ctx.fill()

  if (isButtonUp) {
    // Collar flaps / lapels
    ctx.fillStyle = light
    ctx.strokeStyle = stroke
    ctx.lineWidth = 3
    for (const side of [-1, 1] as const) {
      ctx.beginPath()
      ctx.moveTo(384 + side * 66, 152)
      ctx.lineTo(384 + side * 86, isOuterwear ? 310 : 240)
      ctx.lineTo(384 + side * 10, 212)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    // Center placket & buttons
    ctx.beginPath()
    ctx.moveTo(384, 206)
    ctx.lineTo(384, bottomY)
    ctx.strokeStyle = stroke
    ctx.lineWidth = 3
    ctx.stroke()

    const count = isOuterwear ? 6 : 7
    const startY = 238
    const stepY = (bottomY - 60 - startY) / count
    for (let i = 0; i < count; i += 1) {
      ctx.beginPath()
      ctx.arc(384, startY + i * stepY, 6, 0, Math.PI * 2)
      ctx.fillStyle = "#F5F3EE"
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = 2
      ctx.stroke()
    }
  } else {
    // Crew / scoop neckline trim
    ctx.beginPath()
    ctx.moveTo(312, 154)
    ctx.quadraticCurveTo(384, 224, 456, 154)
    ctx.strokeStyle = stroke
    ctx.lineWidth = 5
    ctx.stroke()
  }

  // Subtle fabric fold lines
  ctx.strokeStyle = "rgba(255,255,255,0.18)"
  ctx.lineWidth = 3
  for (const x of [285, 483]) {
    ctx.beginPath()
    ctx.moveTo(x, 340)
    ctx.quadraticCurveTo(x + (x < 384 ? 10 : -10), 560, x, bottomY - 40)
    ctx.stroke()
  }
}

function drawBottomGarment(
  ctx: CanvasRenderingContext2D,
  name: string,
  rgb: [number, number, number],
) {
  const lower = name.toLowerCase()
  const isSkirt = lower.includes("skirt")
  const isWide = lower.includes("wide") || lower.includes("relaxed")

  const base = adjustRgb(rgb, 0)
  const light = adjustRgb(rgb, 20)
  const shade = adjustRgb(rgb, -26)
  const stroke = adjustRgb(rgb, -46)

  const grad = ctx.createLinearGradient(220, 120, 548, 920)
  grad.addColorStop(0, light)
  grad.addColorStop(0.5, base)
  grad.addColorStop(1, shade)

  ctx.save()
  ctx.shadowColor = "rgba(18, 22, 34, 0.14)"
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 14
  ctx.fillStyle = grad

  if (isSkirt) {
    ctx.beginPath()
    ctx.moveTo(256, 140)
    ctx.lineTo(512, 140)
    ctx.quadraticCurveTo(584, 520, 616, 860)
    ctx.quadraticCurveTo(384, 885, 152, 860)
    ctx.quadraticCurveTo(184, 520, 256, 140)
    ctx.closePath()
    ctx.fill()
  } else {
    const legOuter = isWide ? 186 : 210
    const cuffOuter = isWide ? 156 : 230
    const cuffInner = isWide ? 356 : 360

    ctx.beginPath()
    ctx.moveTo(222, 130)
    ctx.lineTo(546, 130)
    ctx.lineTo(768 - legOuter, 420)
    ctx.lineTo(768 - cuffOuter, 916)
    ctx.lineTo(768 - cuffInner, 916)
    ctx.lineTo(396, 420)
    ctx.lineTo(384, 405)
    ctx.lineTo(372, 420)
    ctx.lineTo(cuffInner, 916)
    ctx.lineTo(cuffOuter, 916)
    ctx.lineTo(legOuter, 420)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  ctx.strokeStyle = stroke
  ctx.lineWidth = 4
  ctx.lineJoin = "round"
  ctx.stroke()

  // Waistband
  ctx.fillStyle = shade
  ctx.fillRect(isSkirt ? 256 : 222, isSkirt ? 140 : 130, isSkirt ? 256 : 324, 34)
  ctx.strokeRect(isSkirt ? 256 : 222, isSkirt ? 140 : 130, isSkirt ? 256 : 324, 34)

  if (!isSkirt) {
    // Center fly & pocket stitching
    ctx.beginPath()
    ctx.moveTo(384, 164)
    ctx.lineTo(384, 340)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(384, 147, 7, 0, Math.PI * 2)
    ctx.fillStyle = "#E5E0D5"
    ctx.fill()
    ctx.stroke()

    for (const side of [-1, 1] as const) {
      ctx.beginPath()
      ctx.moveTo(384 + side * 145, 194)
      ctx.quadraticCurveTo(384 + side * 120, 265, 384 + side * 66, 278)
      ctx.stroke()
    }
  }
}

function drawFullBodyGarment(
  ctx: CanvasRenderingContext2D,
  name: string,
  rgb: [number, number, number],
) {
  const lower = name.toLowerCase()
  const isJumpsuit =
    lower.includes("jumpsuit") ||
    lower.includes("boilersuit") ||
    lower.includes("coverall") ||
    lower.includes("overall") ||
    lower.includes("romper")
  const isRomper = lower.includes("romper")
  const isWrap = lower.includes("wrap")
  const isSleeveless =
    !isJumpsuit &&
    (lower.includes("slip") ||
      lower.includes("tank") ||
      lower.includes("satin") ||
      lower.includes("sundress"))

  const base = adjustRgb(rgb, 0)
  const light = adjustRgb(rgb, 24)
  const shade = adjustRgb(rgb, -28)
  const stroke = adjustRgb(rgb, -46)

  const grad = ctx.createLinearGradient(180, 100, 588, 920)
  grad.addColorStop(0, light)
  grad.addColorStop(0.5, base)
  grad.addColorStop(1, shade)

  const topY = 112
  const waistY = 408
  const botY = isRomper ? 650 : 922

  ctx.save()
  ctx.shadowColor = "rgba(18, 22, 34, 0.14)"
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 14
  ctx.fillStyle = grad
  ctx.beginPath()

  if (isJumpsuit) {
    const legOut = 236
    const cuffOut = 216
    const cuffIn = 354
    ctx.moveTo(322, topY)
    ctx.quadraticCurveTo(384, topY + 34, 446, topY)
    ctx.lineTo(516, topY + 46)
    ctx.lineTo(650, 535)
    ctx.lineTo(590, 560)
    ctx.lineTo(504, 336)
    ctx.lineTo(474, waistY)
    ctx.lineTo(768 - legOut, 548)
    ctx.lineTo(768 - cuffOut, botY)
    ctx.lineTo(768 - cuffIn, botY)
    ctx.lineTo(394, 594)
    ctx.lineTo(384, 578)
    ctx.lineTo(374, 594)
    ctx.lineTo(cuffIn, botY)
    ctx.lineTo(cuffOut, botY)
    ctx.lineTo(legOut, 548)
    ctx.lineTo(294, waistY)
    ctx.lineTo(264, 336)
    ctx.lineTo(178, 560)
    ctx.lineTo(118, 535)
    ctx.lineTo(252, topY + 46)
  } else {
    const waistL = 296
    const waistR = 472
    const hemL = 166
    const hemR = 602
    if (isSleeveless) {
      ctx.moveTo(308, topY + 8)
      ctx.lineTo(334, topY + 10)
      ctx.lineTo(344, topY + 128)
      ctx.quadraticCurveTo(384, topY + 165, 424, topY + 128)
      ctx.lineTo(434, topY + 10)
      ctx.lineTo(460, topY + 8)
      ctx.lineTo(482, 310)
    } else {
      ctx.moveTo(322, topY)
      ctx.quadraticCurveTo(384, topY + 45, 446, topY)
      ctx.lineTo(512, topY + 46)
      ctx.lineTo(630, 445)
      ctx.lineTo(572, 472)
      ctx.lineTo(496, 330)
    }
    ctx.lineTo(waistR, waistY)
    ctx.quadraticCurveTo(560, 680, hemR, botY - 18)
    ctx.quadraticCurveTo(384, botY + 18, hemL, botY - 18)
    ctx.quadraticCurveTo(208, 680, waistL, waistY)
    if (isSleeveless) {
      ctx.lineTo(286, 310)
    } else {
      ctx.lineTo(272, 330)
      ctx.lineTo(196, 472)
      ctx.lineTo(138, 445)
      ctx.lineTo(256, topY + 46)
    }
  }

  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = stroke
  ctx.lineWidth = 4
  ctx.lineJoin = "round"
  ctx.stroke()

  // Waistline belt / seam
  ctx.fillStyle = shade
  ctx.fillRect(294, waistY - 14, 180, 28)
  ctx.strokeRect(294, waistY - 14, 180, 28)

  if (isWrap && !isJumpsuit) {
    ctx.beginPath()
    ctx.moveTo(324, topY + 8)
    ctx.lineTo(436, waistY - 14)
    ctx.moveTo(444, topY + 8)
    ctx.lineTo(332, waistY - 14)
    ctx.stroke()
  }
}

function renderGarmentFlatLayDataUrl(item: {
  type: string
  name: string
  color: string
}): string {
  const canvas = document.createElement("canvas")
  canvas.width = 768
  canvas.height = 1024
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  // Clean studio white canvas for garment extraction
  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const rgb = parseHexColor(item.color)
  const slot = normalizeGarmentSlot(item.type, item.name)
  if (slot === "Full Body") {
    drawFullBodyGarment(ctx, item.name, rgb)
  } else if (slot === "Bottom") {
    drawBottomGarment(ctx, item.name, rgb)
  } else {
    drawTopGarment(ctx, item.name, rgb, slot === "Outerwear")
  }

  return canvas.toDataURL("image/png")
}

export function getGarmentImageForTryOn(
  item: { type: string; name: string; color: string; imageData?: string },
  wardrobe: WardrobeItem[],
): string {
  if (item.imageData?.trim()) return item.imageData.trim()

  const normalized = item.name.trim().toLowerCase()
  const matched = wardrobe.find(
    (w) =>
      w.imageData?.trim() &&
      (w.name.trim().toLowerCase() === normalized ||
        w.name.trim().toLowerCase().includes(normalized) ||
        normalized.includes(w.name.trim().toLowerCase())),
  )
  if (matched?.imageData?.trim()) return matched.imageData.trim()

  return renderGarmentFlatLayDataUrl(item)
}

export function getDefaultFacePortraitDataUrl(user: {
  name: string
  initials: string
  avatarBg: string
}): string {
  const canvas = document.createElement("canvas")
  canvas.width = 384
  canvas.height = 384
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  // Soft studio backdrop behind face
  const bg = ctx.createRadialGradient(192, 175, 24, 192, 192, 210)
  bg.addColorStop(0, "#F6EFEA")
  bg.addColorStop(1, "#DED7D1")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 384, 384)

  // Hair / silhouette framing
  ctx.fillStyle = "#2E2522"
  ctx.beginPath()
  ctx.ellipse(192, 152, 118, 126, 0, 0, Math.PI * 2)
  ctx.fill()

  // Warm sculpted face oval
  const skinGrad = ctx.createRadialGradient(178, 165, 20, 192, 192, 120)
  skinGrad.addColorStop(0, "#F4D1B8")
  skinGrad.addColorStop(0.7, "#E3B697")
  skinGrad.addColorStop(1, "#C99676")
  ctx.fillStyle = skinGrad
  ctx.beginPath()
  ctx.ellipse(192, 194, 88, 114, 0, 0, Math.PI * 2)
  ctx.fill()

  // Soft blush accents
  for (const x of [142, 242]) {
    const blush = ctx.createRadialGradient(x, 218, 2, x, 218, 26)
    blush.addColorStop(0, "rgba(218, 118, 112, 0.28)")
    blush.addColorStop(1, "rgba(218, 118, 112, 0)")
    ctx.fillStyle = blush
    ctx.beginPath()
    ctx.arc(x, 218, 26, 0, Math.PI * 2)
    ctx.fill()
  }

  // Hair bangs / hairline crown
  ctx.fillStyle = "#2E2522"
  ctx.beginPath()
  ctx.moveTo(96, 170)
  ctx.quadraticCurveTo(132, 82, 200, 80)
  ctx.quadraticCurveTo(266, 84, 288, 168)
  ctx.quadraticCurveTo(240, 116, 192, 122)
  ctx.quadraticCurveTo(138, 118, 96, 170)
  ctx.fill()

  // Eyebrows
  ctx.strokeStyle = "#3E2D26"
  ctx.lineWidth = 6
  ctx.lineCap = "round"
  for (const side of [-1, 1] as const) {
    ctx.beginPath()
    ctx.moveTo(192 + side * 18, 164)
    ctx.quadraticCurveTo(192 + side * 38, 155, 192 + side * 56, 163)
    ctx.stroke()
  }

  // Eyes
  for (const side of [-1, 1] as const) {
    const cx = 192 + side * 38
    ctx.fillStyle = "#FAF7F5"
    ctx.beginPath()
    ctx.ellipse(cx, 186, 14, 8, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#3A2B24"
    ctx.beginPath()
    ctx.arc(cx, 186, 6.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#FFFFFF"
    ctx.beginPath()
    ctx.arc(cx - 2, 184, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Soft nose bridge & tip shadow
  ctx.strokeStyle = "rgba(155, 102, 74, 0.45)"
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(192, 188)
  ctx.lineTo(190, 218)
  ctx.quadraticCurveTo(192, 224, 198, 220)
  ctx.stroke()

  // Natural smile
  ctx.fillStyle = "#C4736D"
  ctx.beginPath()
  ctx.moveTo(166, 248)
  ctx.quadraticCurveTo(192, 266, 218, 248)
  ctx.quadraticCurveTo(192, 255, 166, 248)
  ctx.fill()

  // Subtle accent ring around edge keyed to user avatar tint
  ctx.strokeStyle = user.avatarBg || "#CE005A"
  ctx.globalAlpha = 0.25
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, 376, 376)

  return canvas.toDataURL("image/png")
}
