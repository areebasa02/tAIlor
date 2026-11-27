import { useState } from "react"
import { useApp } from "../context/AppContext"
import type { LaundryMachineProfile } from "../types"

type LaundryView = "status" | "care" | "routine"
type LaundryState = "clean" | "dirty" | "washing"

interface LaundryLoad {
  id: number
  label: string
  detail: string
  icon: string
  count: number
  state: LaundryState
}

interface Hamper {
  id: number
  name: string
  sorting: string
}

const INITIAL_HAMPERS: Hamper[] = [
  { id: 1, name: "Everyday hamper", sorting: "Lights and colors together" },
  {
    id: 2,
    name: "Delicates basket",
    sorting: "Hand-wash and gentle-care pieces",
  },
]

const INITIAL_LOADS: LaundryLoad[] = [
  {
    id: 1,
    label: "Everyday colors",
    detail: "Cold wash · 30 mins",
    icon: "👕",
    count: 5,
    state: "dirty",
  },
  {
    id: 2,
    label: "Delicates & knitwear",
    detail: "Hand wash / gentle cycle",
    icon: "🧶",
    count: 2,
    state: "dirty",
  },
  {
    id: 3,
    label: "Work tops & blouses",
    detail: "Cold gentle cycle · hang dry",
    icon: "👚",
    count: 4,
    state: "clean",
  },
  {
    id: 4,
    label: "Denim & trousers",
    detail: "Cold wash inside out",
    icon: "👖",
    count: 6,
    state: "clean",
  },
  {
    id: 5,
    label: "Sneakers & shoes",
    detail: "Spot clean only",
    icon: "👟",
    count: 3,
    state: "clean",
  },
]

const STATE_META: Record<
  LaundryState,
  {
    label: string
    color: string
    textClass: string
    bgClass: string
    borderClass: string
  }
> = {
  clean: {
    label: "Clean",
    color: "var(--green)",
    textClass: "text-green",
    bgClass: "bg-green",
    borderClass: "border-green/30",
  },
  dirty: {
    label: "In Hamper",
    color: "var(--rose)",
    textClass: "text-rose",
    bgClass: "bg-rose",
    borderClass: "border-rose/30",
  },
  washing: {
    label: "Washing…",
    color: "var(--turquoise)",
    textClass: "text-turquoise",
    bgClass: "bg-turquoise",
    borderClass: "border-turquoise/30",
  },
}

const CARE_ITEMS = [
  [
    "🧥",
    "Teal trench coat",
    "Cold gentle cycle (30°C) · hang dry · do not bleach · cool iron if needed",
  ],
  [
    "👚",
    "Magenta button-down",
    "Cold wash with similar colors · low tumble or hang dry · avoid high heat",
  ],
  [
    "🧶",
    "Mint ribbed mock-neck",
    "Hand wash cold or gentle wool cycle · reshape flat on towel · never wring",
  ],
  [
    "👖",
    "Camel wide trousers",
    "Cold gentle cycle · hang dry to preserve drape · steam rather than iron",
  ],
]

const LAUNDRY_SYMBOLS: { symbol: string; label: string; desc: string }[] = [
  {
    symbol: "🫧 30°",
    label: "Machine Wash Cold",
    desc: "Max 30°C (85°F). Protects colors, synthetics, and knits from shrinking.",
  },
  {
    symbol: "△ ✕",
    label: "Do Not Bleach",
    desc: "Chlorine bleach will dissolve rayon fibers and fade dyes.",
  },
  {
    symbol: "◻ ⊚",
    label: "Tumble Dry Low",
    desc: "Gentle heat cycle only. Remove while slightly damp to prevent wrinkles.",
  },
  {
    symbol: "▯ ||",
    label: "Line / Hang Dry",
    desc: "Drip dry on hanger. Preserves wool, linen, and delicate shapes.",
  },
  {
    symbol: "☡ •",
    label: "Low Iron (110°C)",
    desc: "Steam gently or press with pressing cloth. High iron melts blends.",
  },
  {
    symbol: "◯ ✕",
    label: "Do Not Dry Clean",
    desc: "Chemical solvents will break down the fabric coating or waterproofing.",
  },
]

function getLaundryRoutineAdvice(
  dirtyCount: number,
  profile: LaundryMachineProfile
): string {
  const loaderLabel =
    profile.loaderType === "front"
      ? "front-loader drum"
      : profile.loaderType === "top_impeller"
        ? "impeller top-loader"
        : "agitator top-loader"

  const agitationHint =
    profile.loaderType === "top_agitator"
      ? "Use Delicate/Hand-Wash mode so the center post doesn't stretch knit collars."
      : "Tumbling gently protects soft cotton, silk, and structured hems."

  const meshTip = profile.delicateMeshBag
    ? "Mesh bags enabled for knits and buttons."
    : "Consider enabling mesh wash bags to protect knits and fasteners."

  if (dirtyCount === 0) {
    return `Hamper is empty! Your ${loaderLabel} is ready on ${profile.waterTemp} wash · ${profile.spinSpeed} spin. ${meshTip}`
  }

  return `${dirtyCount} items queued for ${profile.waterTemp} water and ${profile.spinSpeed} spin in your ${loaderLabel}. ${agitationHint} ${meshTip}`
}

export default function LaundryTab() {
  const { showToast } = useApp()
  const [view, setView] = useState<LaundryView>("status")
  const [loads, setLoads] = useState<LaundryLoad[]>(INITIAL_LOADS)
  const [hampers, setHampers] = useState<Hamper[]>(INITIAL_HAMPERS)
  const [routineEnabled, setRoutineEnabled] = useState(true)
  const [openAction, setOpenAction] = useState<
    "hamper" | "quick" | "symbols" | null
  >(null)
  const [hamperName, setHamperName] = useState("")
  const [hamperSorting, setHamperSorting] = useState(
    "Lights and colors together"
  )
  const [quickOccasion, setQuickOccasion] = useState("")
  const [quickCount, setQuickCount] = useState("1")
  const [quickDeadline, setQuickDeadline] = useState("Tonight")
  const [machineProfile, setMachineProfile] = useState<LaundryMachineProfile>({
    loaderType: "front",
    waterTemp: "cold",
    spinSpeed: "medium",
    delicateMeshBag: true,
    notes:
      "Spin max 800 RPM to protect knit fibers; gentle eco-detergent only.",
  })

  const cleanCount = loads
    .filter((load) => load.state === "clean")
    .reduce((sum, load) => sum + load.count, 0)
  const dirtyCount = loads
    .filter((load) => load.state === "dirty")
    .reduce((sum, load) => sum + load.count, 0)

  const updateState = (id: number, state: LaundryState) => {
    setLoads((current) =>
      current.map((load) => (load.id === id ? { ...load, state } : load))
    )
    const target = loads.find((l) => l.id === id)
    if (target) {
      showToast(
        "Load Updated",
        `${target.label} marked as ${STATE_META[state].label}.`,
        "info"
      )
    }
  }

  const handleWashAllDirty = () => {
    setLoads((current) =>
      current.map((load) =>
        load.state === "dirty" ? { ...load, state: "clean" } : load
      )
    )
    showToast(
      "Laundry Completed!",
      `Moved ${dirtyCount} dirty pieces to clean wardrobe.`,
      "success"
    )
  }

  const addHamper = () => {
    if (!hamperName.trim()) return
    setHampers((current) => [
      ...current,
      { id: Date.now(), name: hamperName.trim(), sorting: hamperSorting },
    ])
    showToast("Hamper Added", `${hamperName.trim()} created.`, "success")
    setHamperName("")
    setOpenAction(null)
  }

  const addQuickLoad = () => {
    if (!quickOccasion.trim()) return
    const newCount = Math.max(1, Number.parseInt(quickCount, 10) || 1)
    setLoads((current) => [
      {
        id: Date.now(),
        label: quickOccasion.trim(),
        detail: `Quick Load · needed ${quickDeadline.toLowerCase()}`,
        icon: "⚡",
        count: newCount,
        state: "dirty",
      },
      ...current,
    ])
    showToast(
      "Quick Load Queued",
      `Added ${newCount} item(s) needed for ${quickDeadline}.`,
      "info"
    )
    setQuickOccasion("")
    setQuickCount("1")
    setOpenAction(null)
  }

  return (
    <div className="pt-2 pb-4 space-y-3.5">
      {/* Header */}
      <div className="px-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Garment Care &amp; Hampers
        </p>
        <h1 className="font-editorial text-[26px] font-bold text-foreground leading-tight mt-0.5">
          Laundry &amp; Care
        </h1>
        <p className="text-xs mt-0.5 text-muted-foreground leading-snug">
          Track hampers, dirty clothes, and washing tags.
        </p>
      </div>

      {/* Slim Segmented Navigation Pills */}
      <div
        role="tablist"
        aria-label="Laundry and care views"
        className="grid grid-cols-3 gap-1 rounded-2xl p-1 bg-muted/80 border border-border"
      >
        {(
          [
            ["status", "Loads"],
            ["care", "Care Tags"],
            ["routine", "Washer"],
          ] as [LaundryView, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`min-h-[38px] py-1.5 rounded-xl text-xs font-extrabold transition-all border-2 cursor-pointer ${
              view === id
                ? "bg-card text-foreground shadow-sm border-border"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "status" && (
        <div className="space-y-3">
          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              aria-expanded={openAction === "hamper"}
              onClick={() =>
                setOpenAction(openAction === "hamper" ? null : "hamper")
              }
              className="min-h-[42px] rounded-xl px-2 py-2 text-xs font-black leading-tight border-2 border-[#0D0F18]/20 transition-all active:scale-98 bg-pink text-white hover:brightness-110 shadow-md shadow-pink/20 cursor-pointer"
            >
              + Hamper
            </button>
            <button
              type="button"
              aria-expanded={openAction === "quick"}
              onClick={() =>
                setOpenAction(openAction === "quick" ? null : "quick")
              }
              className="min-h-[42px] rounded-xl px-2 py-2 text-xs font-black leading-tight border-2 border-[#0D0F18]/25 transition-all active:scale-98 bg-turquoise text-[#0D0F18] hover:brightness-105 shadow-md shadow-turquoise/20 cursor-pointer"
            >
              Quick Wash
            </button>
            <button
              type="button"
              onClick={handleWashAllDirty}
              disabled={dirtyCount === 0}
              className="min-h-[42px] rounded-xl px-2 py-2 text-xs font-black leading-tight border-2 border-[#0D0F18]/20 transition-all active:scale-98 disabled:opacity-40 bg-green text-white hover:brightness-110 shadow-md shadow-green/20 cursor-pointer"
            >
              <span aria-hidden="true">✓ </span>Wash ({dirtyCount})
            </button>
          </div>

          {/* Add Hamper drawer */}
          {openAction === "hamper" && (
            <div
              className="rounded-3xl p-4 space-y-3 shadow-xl border-2 animate-in fade-in duration-150"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div>
                <h2 className="text-sm font-black text-foreground">
                  New Hamper
                </h2>
                <p className="text-xs text-muted-foreground">
                  Name it and choose a sorting rule.
                </p>
              </div>
              <input
                aria-label="Hamper name"
                value={hamperName}
                onChange={(event) => setHamperName(event.target.value)}
                placeholder="e.g. Bedroom Basket"
                className="w-full min-h-[42px] rounded-xl px-3.5 py-2 text-xs font-semibold outline-none bg-muted text-foreground border-2 border-border focus:border-pink transition-colors"
              />
              <select
                aria-label="Hamper sorting rule"
                value={hamperSorting}
                onChange={(event) => setHamperSorting(event.target.value)}
                className="w-full min-h-[42px] rounded-xl px-3.5 py-2 text-xs font-semibold outline-none bg-muted text-foreground border-2 border-border focus:border-pink transition-colors"
              >
                <option>Lights and colors together</option>
                <option>Lights only (whites &amp; pastels)</option>
                <option>Darks and heavy denim</option>
                <option>Delicates and wool knits</option>
                <option>Towels and bed linens</option>
              </select>
              <button
                type="button"
                onClick={addHamper}
                disabled={!hamperName.trim()}
                className="w-full min-h-[44px] rounded-xl py-2.5 text-xs font-black text-white bg-pink border-2 border-[#0D0F18]/20 hover:brightness-110 transition-all shadow-md shadow-pink/20 disabled:opacity-50 cursor-pointer"
              >
                Save
              </button>
            </div>
          )}

          {/* Quick load drawer */}
          {openAction === "quick" && (
            <div className="rounded-3xl p-4 space-y-3 shadow-xl border-2 border-turquoise bg-turquoise/10 animate-in fade-in duration-150">
              <div>
                <h2 className="text-sm font-black text-foreground">
                  Priority Quick Wash
                </h2>
                <p className="text-xs text-muted-foreground">
                  Need clothes clean by tonight or tomorrow?
                </p>
              </div>
              <input
                aria-label="Quick load occasion"
                value={quickOccasion}
                onChange={(event) => setQuickOccasion(event.target.value)}
                placeholder="e.g. Thursday Dinner"
                className="w-full min-h-[42px] rounded-xl px-3.5 py-2 text-xs font-semibold outline-none bg-card text-foreground border-2 border-border focus:border-turquoise transition-colors"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Quick load item count"
                  type="number"
                  min="1"
                  value={quickCount}
                  onChange={(event) => setQuickCount(event.target.value)}
                  placeholder="Count"
                  className="w-full min-h-[42px] rounded-xl px-3 py-2 text-xs font-semibold outline-none bg-card text-foreground border-2 border-border focus:border-turquoise transition-colors"
                />
                <select
                  aria-label="Quick load deadline"
                  value={quickDeadline}
                  onChange={(event) => setQuickDeadline(event.target.value)}
                  className="w-full min-h-[42px] rounded-xl px-3 py-2 text-xs font-semibold outline-none bg-card text-foreground border-2 border-border focus:border-turquoise transition-colors"
                >
                  <option>Tonight</option>
                  <option>Tomorrow morning</option>
                  <option>This Friday</option>
                  <option>This weekend</option>
                </select>
              </div>
              <button
                type="button"
                onClick={addQuickLoad}
                disabled={!quickOccasion.trim()}
                className="w-full min-h-[44px] rounded-xl py-2.5 text-xs font-black text-[#0D0F18] bg-turquoise border-2 border-[#0D0F18]/25 hover:brightness-105 transition-all shadow-md shadow-turquoise/20 disabled:opacity-50 cursor-pointer"
              >
                Add Load
              </button>
            </div>
          )}

          {/* Clean vs Dirty Overview Badges */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl p-3 border-2 border-green/50 bg-green/10 flex items-center gap-2.5">
              <p className="text-2xl font-black text-green leading-none shrink-0">
                {cleanCount}
              </p>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-foreground leading-tight">
                  Clean ready
                </p>
                <p className="text-[11px] font-semibold text-muted-foreground leading-tight mt-0.5">
                  In closet
                </p>
              </div>
            </div>
            <div className="rounded-2xl p-3 border-2 border-rose/50 bg-rose/10 flex items-center gap-2.5">
              <p className="text-2xl font-black text-rose leading-none shrink-0">
                {dirtyCount}
              </p>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-foreground leading-tight">
                  In hamper
                </p>
                <p className="text-[11px] font-semibold text-muted-foreground leading-tight mt-0.5">
                  Held from outfits
                </p>
              </div>
            </div>
          </div>

          {/* Hampers List */}
          <div
            className="rounded-2xl p-3 space-y-2 border-2"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                Hampers
              </span>
              <span className="text-xs text-muted-foreground font-extrabold">
                {hampers.length} active
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {hampers.map((hamper) => (
                <div
                  key={hamper.id}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 border-2 border-border bg-muted"
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    🧺
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-foreground leading-snug">
                      {hamper.name}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground leading-snug">
                      {hamper.sorting}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Loads List */}
          <div className="space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-foreground block">
              Laundry Loads
            </span>
            <div className="grid grid-cols-1 gap-2.5">
              {loads.map((load) => {
                const meta = STATE_META[load.state]
                return (
                  <div
                    key={load.id}
                    className="rounded-2xl p-3 space-y-2.5 border-2 shadow-sm border-border bg-card"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        aria-hidden="true"
                        className="w-9 h-9 rounded-xl border-2 border-border flex items-center justify-center text-base shrink-0 bg-muted"
                      >
                        {load.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-foreground leading-snug">
                          {load.label}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground leading-snug">
                          {load.count} items · {load.detail}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-black shrink-0 ${meta.textClass}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <div
                      role="group"
                      aria-label={`Set status for ${load.label}`}
                      className="grid grid-cols-3 gap-2"
                    >
                      {(["dirty", "washing", "clean"] as LaundryState[]).map(
                        (state) => {
                          const stateStyle = STATE_META[state]
                          const isCurrent = load.state === state
                          return (
                            <button
                              key={state}
                              type="button"
                              aria-pressed={isCurrent}
                              onClick={() => updateState(load.id, state)}
                              className={`min-h-[38px] py-2 rounded-xl text-xs font-extrabold transition-all border-2 cursor-pointer ${
                                isCurrent
                                  ? `${stateStyle.bgClass} ${
                                      state === "washing"
                                        ? "text-[#0D0F18] border-[#0D0F18]/25"
                                        : "text-white border-[#0D0F18]/20 dark:border-white/25"
                                    } shadow-md`
                                  : "bg-muted text-foreground border-border hover:border-turquoise"
                              }`}
                            >
                              {stateStyle.label}
                            </button>
                          )
                        }
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Care Guide & Interactive Symbol Decoder */}
      {view === "care" && (
        <div className="space-y-4">
          <div className="rounded-3xl p-4 border-2 border-turquoise/50 bg-turquoise/10">
            <p className="text-xs font-extrabold text-foreground">
              🔍 Care Tag Decoder
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plain-English rules for common laundry symbols:
            </p>

            <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-2.5 mt-3">
              {LAUNDRY_SYMBOLS.map((sym) => (
                <div
                  key={sym.label}
                  className="p-3 rounded-2xl bg-card border-2 border-border space-y-1.5 shadow-2xs"
                >
                  <div
                    aria-hidden="true"
                    className="w-fit min-w-[44px] h-10 px-2.5 rounded-xl bg-muted border-2 border-border flex items-center justify-center font-mono text-xs font-black text-dark-teal dark:text-turquoise"
                  >
                    {sym.symbol}
                  </div>
                  <p className="text-xs min-[380px]:text-[13px] font-extrabold text-foreground leading-snug">
                    {sym.label}
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {sym.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <span className="text-xs font-extrabold uppercase tracking-wider text-foreground block">
            Saved Care Notes
          </span>

          <div className="space-y-2.5">
            {CARE_ITEMS.map(([icon, item, care]) => (
              <div
                key={item}
                className="flex gap-3 rounded-2xl p-3.5 border-2 border-border bg-card"
              >
                <span className="text-2xl" aria-hidden="true">
                  {icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-foreground">
                    {item}
                  </p>
                  <p className="text-xs mt-1 leading-relaxed text-muted-foreground">
                    {care}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Routine & Machine Setup */}
      {view === "routine" && (
        <div className="space-y-4">
          <div
            className="rounded-3xl p-4 border-2 space-y-4"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="text-xl">
                ⚙️
              </span>
              <div>
                <h2 className="text-sm font-black text-foreground">
                  Your Washing Machine
                </h2>
                <p className="text-xs text-muted-foreground">
                  Set your machine details for safer wash tips
                </p>
              </div>
            </div>

            {/* Washer Type */}
            <div className="space-y-1.5">
              <span
                id="washer-drum-label"
                className="text-xs font-extrabold uppercase tracking-wider text-foreground block"
              >
                Washer Style
              </span>
              <div
                role="group"
                aria-labelledby="washer-drum-label"
                className="grid grid-cols-1 gap-2"
              >
                {(
                  [
                    {
                      id: "front",
                      label: "Front Loader",
                      hint: "Gentle tumbling",
                    },
                    {
                      id: "top_impeller",
                      label: "Top Loader (Impeller)",
                      hint: "No center post",
                    },
                    {
                      id: "top_agitator",
                      label: "Top Loader (Agitator)",
                      hint: "Center post",
                    },
                  ] as const
                ).map((opt) => {
                  const selected = machineProfile.loaderType === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setMachineProfile((prev) => ({
                          ...prev,
                          loaderType: opt.id,
                        }))
                      }
                      className={`w-full min-h-[44px] text-left px-3.5 py-2.5 rounded-2xl border-2 transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        selected
                          ? "bg-pink/15 border-pink text-foreground font-extrabold"
                          : "bg-muted border-border text-foreground hover:border-turquoise"
                      }`}
                    >
                      <span className="text-xs font-extrabold">
                        {opt.label}
                      </span>
                      <span className="text-[11px] font-semibold text-muted-foreground shrink-0">
                        {opt.hint}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Water Temp & Spin Speed */}
            <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span
                  id="water-temp-label"
                  className="text-xs font-extrabold uppercase tracking-wider text-foreground block"
                >
                  Water Temp
                </span>
                <div
                  role="group"
                  aria-labelledby="water-temp-label"
                  className="grid grid-cols-3 gap-1.5"
                >
                  {(["cold", "cool", "warm"] as const).map((temp) => (
                    <button
                      key={temp}
                      type="button"
                      aria-pressed={machineProfile.waterTemp === temp}
                      onClick={() =>
                        setMachineProfile((prev) => ({
                          ...prev,
                          waterTemp: temp,
                        }))
                      }
                      className={`min-h-[40px] py-2 rounded-xl text-xs font-extrabold capitalize border-2 transition-all cursor-pointer ${
                        machineProfile.waterTemp === temp
                          ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/25 shadow-sm"
                          : "bg-muted text-foreground border-border hover:border-turquoise"
                      }`}
                    >
                      {temp}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span
                  id="spin-speed-label"
                  className="text-xs font-extrabold uppercase tracking-wider text-foreground block"
                >
                  Spin Speed
                </span>
                <div
                  role="group"
                  aria-labelledby="spin-speed-label"
                  className="grid grid-cols-3 gap-1.5"
                >
                  {(["low", "medium", "high"] as const).map((spin) => (
                    <button
                      key={spin}
                      type="button"
                      aria-pressed={machineProfile.spinSpeed === spin}
                      onClick={() =>
                        setMachineProfile((prev) => ({
                          ...prev,
                          spinSpeed: spin,
                        }))
                      }
                      className={`min-h-[40px] py-2 rounded-xl text-xs font-extrabold capitalize border-2 transition-all cursor-pointer ${
                        machineProfile.spinSpeed === spin
                          ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/25 shadow-sm"
                          : "bg-muted text-foreground border-border hover:border-turquoise"
                      }`}
                    >
                      {spin === "medium" ? "Med" : spin}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Delicate Mesh Bag Toggle */}
            <div className="flex items-center justify-between pt-1">
              <div className="pr-2">
                <p
                  id="mesh-bag-label"
                  className="text-xs font-extrabold text-foreground"
                >
                  Use Delicate Mesh Bags
                </p>
                <p className="text-xs text-muted-foreground">
                  Protects knits and delicate fabrics
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-labelledby="mesh-bag-label"
                aria-checked={machineProfile.delicateMeshBag}
                onClick={() =>
                  setMachineProfile((prev) => ({
                    ...prev,
                    delicateMeshBag: !prev.delicateMeshBag,
                  }))
                }
                className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors shrink-0 cursor-pointer ${
                  machineProfile.delicateMeshBag
                    ? "bg-green border-green"
                    : "bg-muted border-foreground/40"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    machineProfile.delicateMeshBag
                      ? "translate-x-5"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Custom Notes */}
            <div className="space-y-1">
              <label
                htmlFor="laundry-machine-quirks"
                className="text-xs font-extrabold uppercase tracking-wider text-foreground block"
              >
                Machine Notes
              </label>
              <textarea
                id="laundry-machine-quirks"
                value={machineProfile.notes}
                onChange={(e) =>
                  setMachineProfile((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                rows={2}
                className="w-full rounded-2xl p-3 text-xs font-medium outline-none resize-none bg-muted text-foreground border-2 border-border focus:border-turquoise transition-colors"
              />
            </div>

            {/* Machine Advice Banner */}
            <div className="rounded-2xl p-3 border-2 border-turquoise/50 bg-turquoise/10 space-y-1">
              <p className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                <span aria-hidden="true">✦ </span>Care Tip
              </p>
              <p className="text-xs text-foreground leading-relaxed">
                {getLaundryRoutineAdvice(dirtyCount, machineProfile)}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                showToast(
                  "Washer Profile Saved",
                  `Updated settings for ${machineProfile.loaderType.replace("_", " ")} (${machineProfile.waterTemp} wash).`,
                  "success"
                )
              }
              className="w-full min-h-[46px] py-2.5 rounded-xl text-sm font-black bg-turquoise text-[#0D0F18] border-2 border-[#0D0F18]/25 hover:brightness-105 transition-all shadow-sm cursor-pointer"
            >
              Save Settings
            </button>
          </div>

          {/* Sunday Reset Notification Schedule */}
          <div
            className="rounded-3xl p-4 border-2 space-y-3"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p
                  id="sunday-reset-label"
                  className="text-xs font-extrabold uppercase tracking-widest text-gold"
                >
                  Sunday Reset
                </p>
                <p className="text-lg font-black text-foreground mt-0.5">
                  6:00 PM Weekly
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-labelledby="sunday-reset-label"
                aria-checked={routineEnabled}
                onClick={() => {
                  setRoutineEnabled((enabled) => !enabled)
                  showToast(
                    "Reminder Updated",
                    `Sunday wash routine ${
                      !routineEnabled ? "enabled" : "disabled"
                    }.`,
                    "info"
                  )
                }}
                className={`w-12 h-7 rounded-full p-0.5 border-2 transition-colors shrink-0 cursor-pointer ${
                  routineEnabled
                    ? "bg-green border-green"
                    : "bg-muted border-foreground/40"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    routineEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              Batches weekly loads so outfits stay clean and ready.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
