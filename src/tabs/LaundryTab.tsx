import { useState } from "react"
import { useApp } from "../context/AppContext"

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
  { label: string; color: string; textClass: string; bgClass: string; borderClass: string }
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

const LAUNDRY_SYMBOLS = [
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

export default function LaundryTab() {
  const { showToast } = useApp()
  const [view, setView] = useState<LaundryView>("status")
  const [loads, setLoads] = useState<LaundryLoad[]>(INITIAL_LOADS)
  const [hampers, setHampers] = useState<Hamper[]>(INITIAL_HAMPERS)
  const [routineEnabled, setRoutineEnabled] = useState(true)
  const [openAction, setOpenAction] =
    useState<"hamper" | "quick" | "symbols" | null>(null)
  const [hamperName, setHamperName] = useState("")
  const [hamperSorting, setHamperSorting] = useState(
    "Lights and colors together",
  )
  const [quickOccasion, setQuickOccasion] = useState("")
  const [quickCount, setQuickCount] = useState("1")
  const [quickDeadline, setQuickDeadline] = useState("Tonight")
  const [machineNotes, setMachineNotes] = useState(
    "Front loader: spin speed max 800 RPM to protect knit fibers; gentle eco-detergent only.",
  )

  const cleanCount = loads
    .filter((load) => load.state === "clean")
    .reduce((sum, load) => sum + load.count, 0)
  const dirtyCount = loads
    .filter((load) => load.state === "dirty")
    .reduce((sum, load) => sum + load.count, 0)

  const updateState = (id: number, state: LaundryState) => {
    setLoads((current) =>
      current.map((load) => (load.id === id ? { ...load, state } : load)),
    )
    const target = loads.find((l) => l.id === id)
    if (target) {
      showToast(
        "Load Updated",
        `${target.label} marked as ${STATE_META[state].label}.`,
        "info",
      )
    }
  }

  const handleWashAllDirty = () => {
    setLoads((current) =>
      current.map((load) =>
        load.state === "dirty" ? { ...load, state: "clean" } : load,
      ),
    )
    showToast(
      "Laundry Completed! 🎉",
      `Moved ${dirtyCount} dirty pieces to clean wardrobe.`,
      "success",
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
      "info",
    )
    setQuickOccasion("")
    setQuickCount("1")
    setOpenAction(null)
  }

  return (
    <div className="px-5 pt-2 pb-6 space-y-5">
      {/* Header */}
      <div>
        <h2
          className="text-xl font-bold text-white"
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          Laundry & Fabric Care
        </h2>
        <p className="text-xs mt-0.5 text-muted-foreground">
          Track clean vs. dirty pieces, decode care symbols, and protect your
          wardrobe
        </p>
      </div>

      {/* Navigation Pills */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl p-1 bg-muted">
        {([
          ["status", "Status & Loads"],
          ["care", "Care Decoder"],
          ["routine", "AI Routine & Machine"],
        ] as [LaundryView, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
              view === id
                ? "bg-card text-white shadow-md shadow-black/40"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "status" && (
        <div className="space-y-4">
          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() =>
                setOpenAction(openAction === "hamper" ? null : "hamper")
              }
              className="rounded-2xl px-3 py-2.5 text-xs font-bold transition-all active:scale-98 bg-pink text-white hover:brightness-110 shadow-md shadow-pink/20"
            >
              + Add Hamper
            </button>
            <button
              type="button"
              onClick={() =>
                setOpenAction(openAction === "quick" ? null : "quick")
              }
              className="rounded-2xl px-3 py-2.5 text-xs font-bold transition-all active:scale-98 bg-turquoise text-[#0D0F18] hover:brightness-110 shadow-md shadow-turquoise/20"
            >
              ⚡ Quick Load
            </button>
            <button
              type="button"
              onClick={handleWashAllDirty}
              disabled={dirtyCount === 0}
              className="rounded-2xl px-2 py-2.5 text-[11px] font-bold transition-all active:scale-98 disabled:opacity-40 bg-green text-white hover:brightness-110 shadow-md shadow-green/20"
            >
              ✓ Wash All ({dirtyCount})
            </button>
          </div>

          {/* Add Hamper drawer */}
          {openAction === "hamper" && (
            <div
              className="rounded-3xl p-5 space-y-3 shadow-xl border animate-in fade-in duration-150"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div>
                <p className="text-sm font-bold text-white">
                  Set up a New Hamper
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Define where clothes are placed and how they are sorted.
                </p>
              </div>
              <input
                value={hamperName}
                onChange={(event) => setHamperName(event.target.value)}
                placeholder="Hamper name, e.g. Bedroom Closet Basket"
                className="w-full rounded-xl px-3.5 py-2.5 text-xs outline-none bg-muted text-white border border-border focus:border-pink transition-colors"
              />
              <select
                value={hamperSorting}
                onChange={(event) => setHamperSorting(event.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-xs outline-none bg-muted text-white border border-border focus:border-pink transition-colors"
              >
                <option>Lights and colors together</option>
                <option>Lights only (whites & pastels)</option>
                <option>Darks and heavy denim</option>
                <option>Delicates and wool knits</option>
                <option>Towels and bed linens</option>
              </select>
              <button
                type="button"
                onClick={addHamper}
                disabled={!hamperName.trim()}
                className="w-full rounded-xl py-2.5 text-xs font-bold text-white bg-pink hover:brightness-110 transition-all shadow-md shadow-pink/20 disabled:opacity-50"
              >
                Save Hamper
              </button>
            </div>
          )}

          {/* Quick load drawer */}
          {openAction === "quick" && (
            <div className="rounded-3xl p-5 space-y-3 shadow-xl border border-turquoise/30 bg-turquoise/5 animate-in fade-in duration-150">
              <div>
                <p className="text-sm font-bold text-white">
                  Start a Priority Quick Load
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Fast-track garments needed for a specific event or trip.
                </p>
              </div>
              <input
                value={quickOccasion}
                onChange={(event) => setQuickOccasion(event.target.value)}
                placeholder="Occasion, e.g. Thursday Networking Dinner"
                className="w-full rounded-xl px-3.5 py-2.5 text-xs outline-none bg-card text-white border border-border focus:border-turquoise transition-colors"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="1"
                  value={quickCount}
                  onChange={(event) => setQuickCount(event.target.value)}
                  placeholder="Item count"
                  className="w-full rounded-xl px-3 py-2 text-xs outline-none bg-card text-white border border-border focus:border-turquoise transition-colors"
                />
                <select
                  value={quickDeadline}
                  onChange={(event) => setQuickDeadline(event.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-xs outline-none bg-card text-white border border-border focus:border-turquoise transition-colors"
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
                className="w-full rounded-xl py-2.5 text-xs font-bold text-[#0D0F18] bg-turquoise hover:brightness-110 transition-all shadow-md shadow-turquoise/20 disabled:opacity-50"
              >
                Queue Quick Load
              </button>
            </div>
          )}

          {/* Clean vs Dirty Overview Badges */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl p-4 border border-green/30 bg-green/10">
              <p className="text-3xl font-extrabold text-green">
                {cleanCount}
              </p>
              <p className="text-xs font-semibold text-white/90 mt-0.5">
                Clean pieces ready
              </p>
              <p className="text-[10px] text-muted-foreground">
                Ready to wear in wardrobe
              </p>
            </div>
            <div className="rounded-3xl p-4 border border-rose/30 bg-rose/10">
              <p className="text-3xl font-extrabold text-rose">
                {dirtyCount}
              </p>
              <p className="text-xs font-semibold text-white/90 mt-0.5">
                In hamper / dirty
              </p>
              <p className="text-[10px] text-muted-foreground">
                Excluded from outfit generation
              </p>
            </div>
          </div>

          {/* Hampers List */}
          <div
            className="rounded-3xl p-4 space-y-2.5 border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Assigned Hampers
              </span>
              <span className="text-[10px] text-turquoise font-semibold">
                {hampers.length} active
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {hampers.map((hamper) => (
                <div
                  key={hamper.id}
                  className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 border border-border bg-muted"
                >
                  <span className="text-lg">🧺</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">
                      {hamper.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {hamper.sorting}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Loads List */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Tracked Laundry Loads
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {loads.map((load) => {
                const meta = STATE_META[load.state]
                return (
                  <div
                    key={load.id}
                    className="rounded-3xl p-4 space-y-3 border shadow-sm border-border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0 bg-muted">
                        {load.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {load.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {load.count} items · {load.detail}
                        </p>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${meta.textClass}`}>
                        {meta.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(["dirty", "washing", "clean"] as LaundryState[]).map(
                        (state) => {
                          const stateStyle = STATE_META[state]
                          const isCurrent = load.state === state
                          return (
                            <button
                              key={state}
                              type="button"
                              onClick={() => updateState(load.id, state)}
                              className={`py-2 rounded-xl text-[10px] font-bold transition-all ${
                                isCurrent
                                  ? `${stateStyle.bgClass} ${
                                      state === "washing"
                                        ? "text-[#0D0F18]"
                                        : "text-white"
                                    } shadow-md`
                                  : "bg-muted text-muted-foreground hover:text-white"
                              }`}
                            >
                              {stateStyle.label}
                            </button>
                          )
                        },
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
          <div className="rounded-3xl p-4 border border-turquoise/25 bg-turquoise/10">
            <p className="text-xs font-bold text-turquoise">
              🔍 AI Care Tag Symbol Decoder
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Confused by confusing laundry tags? Tap any universal tag symbol
              below for plain English washing rules:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-3">
              {LAUNDRY_SYMBOLS.map((sym) => (
                <div
                  key={sym.label}
                  className="p-2.5 rounded-2xl bg-card border border-white/5 space-y-1"
                >
                  <span className="text-base font-bold text-white block">
                    {sym.symbol}
                  </span>
                  <p className="text-[11px] font-bold text-turquoise">
                    {sym.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-snug">
                    {sym.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Saved Garment Care Instructions
          </span>

          <div className="space-y-2.5">
            {CARE_ITEMS.map(([icon, item, care]) => (
              <div
                key={item}
                className="flex gap-3 rounded-2xl p-4 border border-border bg-card"
              >
                <span className="text-2xl" aria-hidden="true">
                  {icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">{item}</p>
                  <p className="text-xs mt-1 leading-relaxed text-muted-foreground">
                    {care}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Routine & Machine Eccentricities */}
      {view === "routine" && (
        <div className="space-y-4">
          <div
            className="rounded-3xl p-5 border space-y-3"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">⚙️</span>
              <div>
                <p className="text-sm font-bold text-white">
                  Washing Machine Eccentricities
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Save your washer's quirks so AI prevents garment accidents
                </p>
              </div>
            </div>

            <textarea
              value={machineNotes}
              onChange={(e) => setMachineNotes(e.target.value)}
              rows={2}
              className="w-full rounded-2xl p-3 text-xs outline-none resize-none bg-muted text-white border border-border focus:border-turquoise transition-colors"
            />
            <button
              type="button"
              onClick={() =>
                showToast(
                  "Washer Quirks Saved",
                  "AI will optimize future wash cycles according to this machine.",
                  "success",
                )
              }
              className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-turquoise text-[#0D0F18] hover:brightness-110 transition-all shadow-sm"
            >
              Save Machine Profile
            </button>
          </div>

          {/* Sunday Reset Notification Schedule */}
          <div
            className="rounded-3xl p-5 border space-y-3"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gold">
                  Sunday Wardrobe Reset
                </p>
                <p className="text-lg font-bold text-white mt-0.5">
                  6:00 PM Weekly
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRoutineEnabled((enabled) => !enabled)
                  showToast(
                    "Reminder Updated",
                    `Sunday wash routine ${
                      !routineEnabled ? "enabled" : "disabled"
                    }.`,
                    "info",
                  )
                }}
                className={`w-12 h-7 rounded-full p-1 transition-colors ${
                  routineEnabled ? "bg-green" : "bg-muted"
                }`}
                aria-pressed={routineEnabled}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                    routineEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              AI batches darks, lights, and delicates so your week of curated
              looks is completely clean and ready by Monday morning.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}