import { useEffect, useRef, useState } from "react"
import { useApp, PRESET_PERSONAS } from "../context/AppContext"
import { getContrastTextColor } from "../types"
import OnboardingQuiz from "../components/OnboardingQuiz"
import {
  deleteProfileTryOnPhotoFromDb,
  fetchProfileTryOnPhoto,
  saveProfileTryOnPhotoToDb,
  type SavedProfileTryOnPhoto,
} from "../lib/aiHost"

export default function ProfileTab({ onBack }: { onBack: () => void }) {
  const {
    user,
    switchUser,
    updateAccessibility,
    applyQuizResult,
    logout,
    wardrobe,
    theme,
    toggleTheme,
  } = useApp()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  const [savedPhoto, setSavedPhoto] = useState<SavedProfileTryOnPhoto | null>(null)
  const [photoKind, setPhotoKind] = useState<"full_body" | "portrait">("full_body")
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoStatusMsg, setPhotoStatusMsg] = useState("")
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let active = true
    setSavedPhoto(null)
    setPhotoStatusMsg("")
    void fetchProfileTryOnPhoto(user.id).then((photo) => {
      if (!active) return
      setSavedPhoto(photo)
      if (photo) setPhotoKind(photo.photoKind)
    })
    return () => {
      active = false
    }
  }, [user.id])

  const handleSaveProfilePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setPhotoBusy(true)
    setPhotoStatusMsg("")
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => reject(new Error("Could not read image file."))
        reader.readAsDataURL(file)
      })
      const saved = await saveProfileTryOnPhotoToDb(user.id, {
        imageDataUrl: dataUrl,
        photoKind,
        consentConfirmed: true,
      })
      setSavedPhoto(saved)
      setPhotoStatusMsg("Saved to your profile database for future try-ons.")
    } catch (err) {
      setPhotoStatusMsg(err instanceof Error ? err.message : "Could not save photo.")
    } finally {
      setPhotoBusy(false)
    }
  }

  const handleRemoveSavedPhoto = async () => {
    setPhotoBusy(true)
    setPhotoStatusMsg("")
    try {
      await deleteProfileTryOnPhotoFromDb(user.id)
      setSavedPhoto(null)
      setPhotoStatusMsg("Removed saved try-on picture from your profile.")
    } catch (err) {
      setPhotoStatusMsg(err instanceof Error ? err.message : "Could not remove photo.")
    } finally {
      setPhotoBusy(false)
    }
  }

  useEffect(() => {
    if (!confirmLogout) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmLogout(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [confirmLogout])

  const cleanItems = wardrobe.filter((i) => i.status !== "dirty").length
  const dirtyItems = wardrobe.filter((i) => i.status === "dirty").length
  const favItems = wardrobe.filter((i) => i.favorite).length
  const rarelyWorn = wardrobe.filter((i) => i.worn < 5).length

  return (
    <div className="pt-1 pb-4 space-y-3">
      {/* Back & Sign Out */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-extrabold px-3 min-h-[38px] rounded-xl border-2 border-border bg-muted text-foreground hover:border-turquoise flex items-center gap-1 transition-colors cursor-pointer"
        >
          ← Today
        </button>

        <button
          type="button"
          onClick={() => setConfirmLogout(true)}
          className="text-xs font-extrabold px-3 min-h-[38px] rounded-xl border-2 border-red text-red hover:bg-red/10 transition-colors cursor-pointer"
        >
          Sign Out
        </button>
      </div>

      {/* Single-Column Mobile Shell Stack */}
      <div className="space-y-3">
        {/* User Hero, Demo Profiles & Closet Analytics */}
        <div className="space-y-3">
          {/* User Hero */}
          <div className="flex flex-col p-3.5 rounded-2xl border-2 shadow-sm bg-card border-border">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-base font-black shadow-md shrink-0 border-2 border-border"
                style={{
                  background: user.avatarBg,
                  color: getContrastTextColor(user.avatarBg),
                }}
              >
                {user.initials}
              </div>
              <div className="min-w-0 flex-1">
                <h1
                  className="text-xl font-black text-foreground truncate leading-tight"
                  style={{ fontFamily: "Nunito, sans-serif" }}
                >
                  {user.name}
                </h1>
                <p className="text-xs font-semibold text-muted-foreground truncate">
                  {user.email}
                </p>
                <span className="inline-block mt-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-turquoise/15 text-foreground border-2 border-turquoise/50">
                  {user.roleTitle}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setQuizOpen(true)}
              className="w-full min-h-[42px] py-2 px-3 rounded-xl border-2 border-turquoise text-foreground bg-turquoise/10 text-xs font-extrabold hover:bg-turquoise/20 transition-colors flex items-center justify-center gap-2 mt-3 cursor-pointer"
            >
              <span aria-hidden="true">✦</span> Retake Quiz
            </button>
          </div>

          {/* Saved Try-On Picture (SQLite Profile Database) */}
          <div className="rounded-2xl p-3.5 space-y-2.5 border-2 shadow-sm bg-card border-border">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                <span aria-hidden="true">📸 </span>Saved Try-On Picture
              </span>
              <span className="text-[11px] font-bold text-muted-foreground">
                {savedPhoto ? "Saved in SQLite DB" : "Optional"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Save a personal photo to your profile so Try-On can use it anytime without re-uploading. You can also upload a temporary one-time photo inside Try-On.
            </p>

            <div className="flex items-center gap-3">
              {savedPhoto ? (
                <img
                  src={savedPhoto.imageDataUrl}
                  alt={`${user.name} saved try-on picture`}
                  className="w-16 h-20 rounded-xl object-cover border-2 border-turquoise shrink-0 bg-muted"
                />
              ) : (
                <div className="w-16 h-20 rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center text-xl shrink-0">
                  🧑
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPhotoKind("full_body")}
                    aria-pressed={photoKind === "full_body"}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-black border cursor-pointer ${
                      photoKind === "full_body"
                        ? "bg-pink text-white border-pink"
                        : "bg-muted text-foreground border-border"
                    }`}
                  >
                    🧍 Full-Body
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoKind("portrait")}
                    aria-pressed={photoKind === "portrait"}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-black border cursor-pointer ${
                      photoKind === "portrait"
                        ? "bg-pink text-white border-pink"
                        : "bg-muted text-foreground border-border"
                    }`}
                  >
                    😊 Face Portrait
                  </button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleSaveProfilePhotoFile(e)}
                  />
                  <button
                    type="button"
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-turquoise text-[#0D0F18] border border-[#0D0F18]/20 hover:brightness-105 cursor-pointer disabled:opacity-50"
                  >
                    {photoBusy ? "Saving…" : savedPhoto ? "Replace Photo" : "Upload & Save"}
                  </button>
                  {savedPhoto && (
                    <button
                      type="button"
                      disabled={photoBusy}
                      onClick={() => void handleRemoveSavedPhoto()}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-muted text-red border border-border hover:border-red cursor-pointer disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            {photoStatusMsg && (
              <p className="text-[11px] font-bold text-foreground">{photoStatusMsg}</p>
            )}
          </div>

          {/* Demo Profile Switcher */}
          <div className="rounded-2xl p-3.5 space-y-2.5 border-2 shadow-sm bg-card border-border">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                <span aria-hidden="true">⚡ </span>Demo Profiles
              </span>
              <span className="text-xs font-bold text-muted-foreground shrink-0">
                Try different needs
              </span>
            </div>

            <div className="grid grid-cols-1 min-[350px]:grid-cols-2 gap-2">
              {Object.values(PRESET_PERSONAS).map((p) => {
                const active = user.id === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Switch to profile ${p.name}, ${p.roleTitle}`}
                    onClick={() => switchUser(p.id)}
                    className={`p-2.5 min-h-[54px] rounded-2xl border-2 text-left flex items-center gap-2.5 transition-all hover:scale-[1.01] cursor-pointer ${
                      active
                        ? "bg-pink/15 border-pink shadow-md shadow-pink/20"
                        : "bg-muted border-border hover:border-turquoise"
                    }`}
                  >
                    <div
                      aria-hidden="true"
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 border-2 border-border"
                      style={{
                        background: p.avatarBg,
                        color: getContrastTextColor(p.avatarBg),
                      }}
                    >
                      {p.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-foreground truncate leading-tight">
                        {p.name.split(" ")[0]}
                      </p>
                      <p className="text-[11px] font-semibold text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                        {(
                          {
                            eliora: "Soft & Comfort",
                            areeba: "Business Classic",
                            ethan: "Events & Social",
                            jordan: "Simple & Calm",
                            josephine: "High Contrast & Audio",
                          } as Record<string, string>
                        )[p.id] ?? p.roleTitle}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Wardrobe Summary */}
          <div
            role="region"
            aria-labelledby="closet-analytics-heading"
            className="rounded-2xl p-3.5 space-y-2.5 border-2 shadow-sm bg-card border-border"
          >
            <span
              id="closet-analytics-heading"
              className="text-xs font-extrabold uppercase tracking-wider text-foreground block"
            >
              Closet Overview
            </span>

            <div className="grid grid-cols-2 min-[380px]:grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-2xl bg-muted border-2 border-border">
                <p className="text-lg font-black text-foreground">
                  {wardrobe.length}
                </p>
                <p className="text-[11px] font-bold text-muted-foreground leading-tight">
                  Total
                </p>
              </div>
              <div className="p-2.5 rounded-2xl bg-muted border-2 border-border">
                <p className="text-lg font-black text-green">{cleanItems}</p>
                <p className="text-[11px] font-bold text-muted-foreground leading-tight">
                  Clean
                </p>
              </div>
              <div className="p-2.5 rounded-2xl bg-muted border-2 border-border">
                <p className="text-lg font-black text-rose">{dirtyItems}</p>
                <p className="text-[11px] font-bold text-muted-foreground leading-tight">
                  Laundry
                </p>
              </div>
              <div className="p-2.5 rounded-2xl bg-muted border-2 border-border">
                <p className="text-lg font-black text-gold">{favItems}</p>
                <p className="text-[11px] font-bold text-muted-foreground leading-tight">
                  Favorites ♥
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-muted border-2 border-border flex items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-extrabold text-foreground">
                  Wear More of Your Closet
                </p>
                <p className="text-xs font-medium text-muted-foreground leading-snug mt-0.5">
                  {rarelyWorn} pieces worn under 5 times — AI suggests them
                  first.
                </p>
              </div>
              <span aria-hidden="true" className="text-xl shrink-0">
                ✨
              </span>
            </div>
          </div>
        </div>

        {/* Accessibility Settings & Profile Details */}
        <div className="space-y-3">
          {/* Accessibility & Comfort Toggles */}
          <div className="rounded-2xl p-3.5 space-y-3 border-2 shadow-sm bg-card border-border">
            <span className="text-xs font-extrabold uppercase tracking-wider text-foreground block">
              Vision &amp; Comfort Settings
            </span>

            {/* Dark / Light Mode Toggle */}
            <div className="flex items-center justify-between pb-2.5 border-b-2 border-border">
              <div className="pr-2">
                <p
                  id="a11y-dark-mode-label"
                  className="text-xs font-extrabold text-foreground"
                >
                  Dark Mode
                </p>
                <p className="text-xs text-muted-foreground">
                  Use dark colors instead of bright white.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                aria-labelledby="a11y-dark-mode-label"
                onClick={toggleTheme}
                className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors shrink-0 cursor-pointer ${
                  theme === "dark"
                    ? "bg-turquoise border-turquoise"
                    : "bg-muted border-foreground/40"
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    theme === "dark" ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="space-y-3">
              {/* Larger Text Toggle */}
              <div className="flex items-center justify-between">
                <div className="pr-2">
                  <p
                    id="a11y-large-text-label"
                    className="text-xs font-extrabold text-foreground"
                  >
                    Larger Text
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Make text and buttons bigger everywhere.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(user.accessibility.largeText)}
                  aria-labelledby="a11y-large-text-label"
                  onClick={() =>
                    updateAccessibility(
                      "largeText",
                      !user.accessibility.largeText
                    )
                  }
                  className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors shrink-0 cursor-pointer ${
                    user.accessibility.largeText
                      ? "bg-turquoise border-turquoise"
                      : "bg-muted border-foreground/40"
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      user.accessibility.largeText
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Vision Impairment Assistance Toggle */}
              <div className="flex items-center justify-between pt-2.5 border-t-2 border-border">
                <div className="pr-2">
                  <p
                    id="a11y-vision-label"
                    className="text-xs font-extrabold text-foreground"
                  >
                    Vision Impairment Assistance
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Show audio Listen buttons and speech assistance for low
                    vision.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(user.accessibility.visionImpairment)}
                  aria-labelledby="a11y-vision-label"
                  onClick={() =>
                    updateAccessibility(
                      "visionImpairment",
                      !user.accessibility.visionImpairment
                    )
                  }
                  className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors shrink-0 cursor-pointer ${
                    user.accessibility.visionImpairment
                      ? "bg-turquoise border-turquoise"
                      : "bg-muted border-foreground/40"
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      user.accessibility.visionImpairment
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Voice Read-Aloud Toggle */}
              <div className="flex items-center justify-between pt-2.5 border-t-2 border-border">
                <div className="pr-2">
                  <p
                    id="a11y-voice-label"
                    className="text-xs font-extrabold text-foreground"
                  >
                    Voice Read-Aloud
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Show Listen buttons to hear outfits spoken aloud.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={user.accessibility.voiceNarration}
                  aria-labelledby="a11y-voice-label"
                  onClick={() =>
                    updateAccessibility(
                      "voiceNarration",
                      !user.accessibility.voiceNarration
                    )
                  }
                  className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors shrink-0 cursor-pointer ${
                    user.accessibility.voiceNarration
                      ? "bg-pink border-pink"
                      : "bg-muted border-foreground/40"
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      user.accessibility.voiceNarration
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* High-Contrast Color Names */}
              <div className="flex items-center justify-between pt-2.5 border-t-2 border-border">
                <div className="pr-2">
                  <p className="text-xs font-extrabold text-foreground">
                    <span id="a11y-high-contrast-label">
                      High-Contrast Color Names
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Show color labels and thick outlines for clarity.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={user.accessibility.highContrastColors}
                  aria-labelledby="a11y-high-contrast-label"
                  onClick={() =>
                    updateAccessibility(
                      "highContrastColors",
                      !user.accessibility.highContrastColors
                    )
                  }
                  className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors shrink-0 cursor-pointer ${
                    user.accessibility.highContrastColors
                      ? "bg-turquoise border-turquoise"
                      : "bg-muted border-foreground/40"
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      user.accessibility.highContrastColors
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Simple Focus Mode */}
              <div className="flex items-center justify-between pt-2.5 border-t-2 border-border">
                <div className="pr-2">
                  <p
                    id="a11y-low-decision-label"
                    className="text-xs font-extrabold text-foreground"
                  >
                    Simple Focus Mode
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Highlight your #1 outfit first with fewer steps.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={user.accessibility.lowDecisionMode}
                  aria-labelledby="a11y-low-decision-label"
                  onClick={() =>
                    updateAccessibility(
                      "lowDecisionMode",
                      !user.accessibility.lowDecisionMode
                    )
                  }
                  className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors shrink-0 cursor-pointer ${
                    user.accessibility.lowDecisionMode
                      ? "bg-pink border-pink"
                      : "bg-muted border-foreground/40"
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      user.accessibility.lowDecisionMode
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Soft Fabric Filter */}
              <div className="flex items-center justify-between pt-2.5 border-t-2 border-border">
                <div className="pr-2">
                  <p
                    id="a11y-sensory-label"
                    className="text-xs font-extrabold text-foreground"
                  >
                    Soft Fabric Filter
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Highlight breathable cotton &amp; silk; flag structured or
                    scratchy fabrics.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={user.accessibility.sensorySensitive}
                  aria-labelledby="a11y-sensory-label"
                  onClick={() =>
                    updateAccessibility(
                      "sensorySensitive",
                      !user.accessibility.sensorySensitive
                    )
                  }
                  className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors shrink-0 cursor-pointer ${
                    user.accessibility.sensorySensitive
                      ? "bg-green border-green"
                      : "bg-muted border-foreground/40"
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      user.accessibility.sensorySensitive
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Profile Details List */}
          <div className="rounded-2xl overflow-hidden border-2 shadow-sm bg-card border-border">
            {[
              ["Preferred style", user.preferredStyle],
              ["Typical sizes", user.typicalSizes],
              ["Home climate", user.homeClimate],
              ["Stylist notes", user.stylistNotes],
            ].map(([label, value], index) => (
              <div
                key={label}
                className="px-3.5 py-2.5"
                style={{
                  borderTop: index ? "2px solid var(--border)" : undefined,
                }}
              >
                <p className="text-[11px] uppercase font-extrabold tracking-wider text-muted-foreground">
                  {label}
                </p>
                <p className="text-xs font-bold text-foreground mt-0.5">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Privacy Notice */}
          <div className="rounded-2xl p-3.5 border-2 leading-relaxed bg-turquoise/10 border-turquoise/45 text-foreground">
            <p className="text-xs font-black">Private to Your Device</p>
            <p className="text-xs mt-1 leading-snug text-muted-foreground">
              tAIlor adapts to your saves and swaps locally on your profile.
            </p>
          </div>
        </div>
      </div>

      {/* Confirm Logout Dialog */}
      {confirmLogout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setConfirmLogout(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-modal-title"
            className="rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border-2 bg-card border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="logout-modal-title"
              className="text-base font-black text-foreground"
            >
              Sign Out?
            </h2>
            <p className="text-xs text-muted-foreground">
              Your wardrobe and outfits stay saved for next time.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="min-h-[42px] py-2.5 rounded-xl text-xs font-extrabold text-foreground border-2 border-border bg-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmLogout(false)
                  logout()
                }}
                className="min-h-[42px] py-2.5 rounded-xl text-xs font-black text-white bg-pink border-2 border-[#0D0F18]/20 hover:brightness-110 shadow-md shadow-pink/20 transition-all cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Style Quiz Retake Modal */}
      {quizOpen && (
        <OnboardingQuiz
          onCancel={() => setQuizOpen(false)}
          onComplete={(result) => {
            setQuizOpen(false)
            if (result) applyQuizResult(result)
          }}
        />
      )}
    </div>
  )
}
