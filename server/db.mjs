import { DatabaseSync } from "node:sqlite"
import { mkdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"

const root = fileURLToPath(new URL("../", import.meta.url))
const dataDir = join(root, "data")
const uploadsDir = join(dataDir, "uploads")
const historyDir = join(dataDir, "history")
const dbPath = join(dataDir, "tailor.db")

mkdirSync(uploadsDir, { recursive: true })
mkdirSync(historyDir, { recursive: true })

const db = new DatabaseSync(dbPath)
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS user_tryon_photos (
    user_id TEXT PRIMARY KEY,
    photo_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    photo_kind TEXT NOT NULL DEFAULT 'full_body',
    consent_confirmed INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tryon_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    outfit_label TEXT NOT NULL,
    subject_mode TEXT NOT NULL,
    image_path TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tryon_history_user_time
    ON tryon_history (user_id, created_at DESC);
`)

function sanitizeId(raw) {
  return String(raw || "guest")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .slice(0, 64) || "guest"
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i)
  if (!match) {
    throw new Error("Expected a valid base64 image data URL.")
  }
  const mimeType = match[1].toLowerCase()
  const ext =
    mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg"
  const buffer = Buffer.from(match[2], "base64")
  if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
    throw new Error("Photo must be between 1 byte and 10 MB.")
  }
  return { mimeType, ext, buffer }
}

const stmtGetPhoto = db.prepare(
  "SELECT user_id, photo_path, mime_type, photo_kind, consent_confirmed, updated_at FROM user_tryon_photos WHERE user_id = ?",
)
const stmtUpsertPhoto = db.prepare(`
  INSERT INTO user_tryon_photos (user_id, photo_path, mime_type, photo_kind, consent_confirmed, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    photo_path = excluded.photo_path,
    mime_type = excluded.mime_type,
    photo_kind = excluded.photo_kind,
    consent_confirmed = excluded.consent_confirmed,
    updated_at = excluded.updated_at
`)
const stmtDeletePhoto = db.prepare("DELETE FROM user_tryon_photos WHERE user_id = ?")
const stmtInsertHistory = db.prepare(
  "INSERT INTO tryon_history (id, user_id, outfit_label, subject_mode, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?)",
)
const stmtListHistory = db.prepare(
  "SELECT id, user_id, outfit_label, subject_mode, image_path, created_at FROM tryon_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
)
const stmtCounts = db.prepare(
  "SELECT (SELECT COUNT(*) FROM user_tryon_photos) AS photos, (SELECT COUNT(*) FROM tryon_history) AS history",
)

export function getProfileTryOnPhoto(userId) {
  const safeId = sanitizeId(userId)
  const row = stmtGetPhoto.get(safeId)
  if (!row || !row.photo_path || !existsSync(row.photo_path)) {
    return null
  }
  const buf = readFileSync(row.photo_path)
  return {
    userId: row.user_id,
    imageDataUrl: `data:${row.mime_type};base64,${buf.toString("base64")}`,
    photoKind: row.photo_kind === "portrait" ? "portrait" : "full_body",
    consentConfirmed: Boolean(row.consent_confirmed),
    updatedAt: Number(row.updated_at),
  }
}

export function saveProfileTryOnPhoto({
  userId,
  imageDataUrl,
  photoKind = "full_body",
  consentConfirmed = true,
}) {
  const safeId = sanitizeId(userId)
  const { mimeType, ext, buffer } = decodeDataUrl(imageDataUrl)
  const normalizedKind = photoKind === "portrait" ? "portrait" : "full_body"
  const prev = stmtGetPhoto.get(safeId)
  const filePath = join(uploadsDir, `${safeId}-tryon.${ext}`)
  writeFileSync(filePath, buffer)
  if (prev?.photo_path && prev.photo_path !== filePath && existsSync(prev.photo_path)) {
    try {
      unlinkSync(prev.photo_path)
    } catch {
      // Ignore stale file cleanup error
    }
  }
  const now = Date.now()
  stmtUpsertPhoto.run(safeId, filePath, mimeType, normalizedKind, consentConfirmed ? 1 : 0, now)
  return {
    userId: safeId,
    imageDataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    photoKind: normalizedKind,
    consentConfirmed: Boolean(consentConfirmed),
    updatedAt: now,
  }
}

export function deleteProfileTryOnPhoto(userId) {
  const safeId = sanitizeId(userId)
  const prev = stmtGetPhoto.get(safeId)
  stmtDeletePhoto.run(safeId)
  if (prev?.photo_path && existsSync(prev.photo_path)) {
    try {
      unlinkSync(prev.photo_path)
    } catch {
      // Ignore file removal error
    }
  }
  return { deleted: Boolean(prev) }
}

export function recordTryOnHistory({ userId, outfitLabel, subjectMode, imageDataUrl }) {
  try {
    const safeId = sanitizeId(userId)
    const { ext, buffer } = decodeDataUrl(imageDataUrl)
    const id = randomUUID()
    const filePath = join(historyDir, `${safeId}-${id.slice(0, 8)}.${ext}`)
    writeFileSync(filePath, buffer)
    stmtInsertHistory.run(
      id,
      safeId,
      String(outfitLabel || "Studio Try-On").slice(0, 120),
      String(subjectMode || "mannequin").slice(0, 32),
      filePath,
      Date.now(),
    )
    return id
  } catch {
    return null
  }
}

export function listTryOnHistory(userId, limit = 12) {
  const safeId = sanitizeId(userId)
  const rows = stmtListHistory.all(safeId, Math.max(1, Math.min(24, Number(limit) || 12)))
  return rows
    .filter((r) => r.image_path && existsSync(r.image_path))
    .map((r) => {
      const ext = r.image_path.endsWith(".png") ? "image/png" : "image/jpeg"
      const b64 = readFileSync(r.image_path).toString("base64")
      return {
        id: r.id,
        outfitLabel: r.outfit_label,
        subjectMode: r.subject_mode,
        imageDataUrl: `data:${ext};base64,${b64}`,
        createdAt: Number(r.created_at),
      }
    })
}

export function getDbStats() {
  const row = stmtCounts.get()
  return {
    dbPath,
    savedPhotos: Number(row?.photos || 0),
    historyCount: Number(row?.history || 0),
  }
}
