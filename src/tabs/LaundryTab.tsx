import { useState } from 'react'

type LaundryView = 'status' | 'care' | 'routine'
type LaundryState = 'clean' | 'dirty' | 'washing'

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
  { id: 1, name: 'Everyday hamper', sorting: 'Lights and colors together' },
  { id: 2, name: 'Delicates basket', sorting: 'Hand-wash and gentle-care pieces' },
]

const INITIAL_LOADS: LaundryLoad[] = [
  { id: 1, label: 'Everyday colors', detail: 'Cold wash', icon: '👕', count: 5, state: 'dirty' },
  { id: 2, label: 'Delicates', detail: 'Hand wash', icon: '🧶', count: 2, state: 'dirty' },
  { id: 3, label: 'Work tops', detail: 'Cold gentle cycle', icon: '👚', count: 4, state: 'clean' },
  { id: 4, label: 'Denim & trousers', detail: 'Cold wash inside out', icon: '👖', count: 6, state: 'clean' },
  { id: 5, label: 'Shoes', detail: 'Spot clean only', icon: '👟', count: 3, state: 'clean' },
]

const STATE_META: Record<LaundryState, { label: string; color: string }> = {
  clean: { label: 'Clean', color: 'var(--green)' },
  dirty: { label: 'In hamper', color: 'var(--pink)' },
  washing: { label: 'In progress', color: 'var(--sky)' },
}

const CARE_ITEMS = [
  ['🧥', 'Teal trench coat', 'Cold gentle cycle · hang dry · do not bleach'],
  ['👚', 'Magenta button-down', 'Cold wash with similar colors · low iron'],
  ['🧶', 'Mint mock-neck', 'Hand wash · reshape flat · avoid heat'],
  ['👖', 'Camel trousers', 'Cold gentle cycle · hang dry · steam if needed'],
]

export default function LaundryTab() {
  const [view, setView] = useState<LaundryView>('status')
  const [loads, setLoads] = useState(INITIAL_LOADS)
  const [hampers, setHampers] = useState(INITIAL_HAMPERS)
  const [routineEnabled, setRoutineEnabled] = useState(true)
  const [openAction, setOpenAction] = useState<'hamper' | 'quick' | null>(null)
  const [hamperName, setHamperName] = useState('')
  const [hamperSorting, setHamperSorting] = useState('Lights and colors together')
  const [quickOccasion, setQuickOccasion] = useState('')
  const [quickCount, setQuickCount] = useState('1')
  const [quickDeadline, setQuickDeadline] = useState('Tonight')

  const cleanCount = loads.filter((load) => load.state === 'clean').reduce((sum, load) => sum + load.count, 0)
  const dirtyCount = loads.filter((load) => load.state === 'dirty').reduce((sum, load) => sum + load.count, 0)

  const updateState = (id: number, state: LaundryState) => {
    setLoads((current) => current.map((load) => load.id === id ? { ...load, state } : load))
  }

  const addHamper = () => {
    if (!hamperName.trim()) return
    setHampers((current) => [
      ...current,
      { id: Date.now(), name: hamperName.trim(), sorting: hamperSorting },
    ])
    setHamperName('')
    setOpenAction(null)
  }

  const addQuickLoad = () => {
    if (!quickOccasion.trim()) return
    setLoads((current) => [
      {
        id: Date.now(),
        label: quickOccasion.trim(),
        detail: `Quick Load · needed ${quickDeadline.toLowerCase()}`,
        icon: '⚡',
        count: Math.max(1, Number.parseInt(quickCount, 10) || 1),
        state: 'dirty',
      },
      ...current,
    ])
    setQuickOccasion('')
    setQuickCount('1')
    setOpenAction(null)
  }

  return (
    <div className="px-5 pt-2 pb-4 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Laundry</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          Track clean and dirty pieces, check care instructions, and plan routines
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl p-1" style={{ background: 'var(--muted)' }}>
        {([
          ['status', 'Status'],
          ['care', 'Care guide'],
          ['routine', 'Routines'],
        ] as [LaundryView, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className="py-2 rounded-lg text-xs font-semibold"
            style={{
              background: view === id ? 'var(--card)' : 'transparent',
              color: view === id ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'status' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOpenAction(openAction === 'hamper' ? null : 'hamper')}
              className="rounded-xl px-3 py-2.5 text-xs font-semibold"
              style={{ background: 'var(--magenta)', color: '#fff' }}
            >
              + Add hamper
            </button>
            <button
              type="button"
              onClick={() => setOpenAction(openAction === 'quick' ? null : 'quick')}
              className="rounded-xl px-3 py-2.5 text-xs font-semibold"
              style={{ background: 'var(--sky)', color: 'var(--accent-foreground)' }}
            >
              ⚡ Quick Load
            </button>
          </div>

          {openAction === 'hamper' && (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm font-semibold">Set up a hamper</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  Add the baskets you use at home and how you sort them.
                </p>
              </div>
              <input
                value={hamperName}
                onChange={(event) => setHamperName(event.target.value)}
                placeholder="Hamper name, e.g. Bedroom basket"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              />
              <select
                value={hamperSorting}
                onChange={(event) => setHamperSorting(event.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              >
                <option>Lights and colors together</option>
                <option>Lights only</option>
                <option>Darks and colors</option>
                <option>Delicates and hand wash</option>
                <option>Towels and linens</option>
              </select>
              <button
                type="button"
                onClick={addHamper}
                disabled={!hamperName.trim()}
                className="w-full rounded-xl py-2.5 text-xs font-semibold"
                style={{
                  background: hamperName.trim() ? 'var(--magenta)' : 'var(--muted)',
                  color: hamperName.trim() ? '#fff' : 'var(--muted-foreground)',
                }}
              >
                Save hamper
              </button>
            </div>
          )}

          {openAction === 'quick' && (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(114,212,240,0.08)', border: '1px solid rgba(114,212,240,0.25)' }}>
              <div>
                <p className="text-sm font-semibold">Start a Quick Load</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  Make a one-off load for an event, trip, interview, or other deadline.
                </p>
              </div>
              <input
                value={quickOccasion}
                onChange={(event) => setQuickOccasion(event.target.value)}
                placeholder="What is it for? e.g. Friday wedding"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="1"
                  value={quickCount}
                  onChange={(event) => setQuickCount(event.target.value)}
                  aria-label="Number of items"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                />
                <select
                  value={quickDeadline}
                  onChange={(event) => setQuickDeadline(event.target.value)}
                  aria-label="Needed by"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                >
                  <option>Tonight</option>
                  <option>Tomorrow</option>
                  <option>This weekend</option>
                  <option>Next week</option>
                </select>
              </div>
              <button
                type="button"
                onClick={addQuickLoad}
                disabled={!quickOccasion.trim()}
                className="w-full rounded-xl py-2.5 text-xs font-semibold"
                style={{
                  background: quickOccasion.trim() ? 'var(--sky)' : 'var(--muted)',
                  color: quickOccasion.trim() ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                }}
              >
                Add to laundry
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(59,191,108,0.1)', border: '1px solid rgba(59,191,108,0.25)' }}>
              <p className="text-2xl font-bold" style={{ color: 'var(--green)' }}>{cleanCount}</p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Clean pieces</p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'rgba(248,160,184,0.1)', border: '1px solid rgba(248,160,184,0.25)' }}>
              <p className="text-2xl font-bold" style={{ color: 'var(--pink)' }}>{dirtyCount}</p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>In the hamper</p>
            </div>
          </div>

          <div className="rounded-2xl p-3 space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                Your hamper setup
              </p>
              <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{hampers.length} hampers</span>
            </div>
            {hampers.map((hamper) => (
              <div key={hamper.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--muted)' }}>
                <span aria-hidden="true">🧺</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{hamper.name}</p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>{hamper.sorting}</p>
                </div>
              </div>
            ))}
          </div>

          {loads.map((load) => {
            const meta = STATE_META[load.state]
            return (
              <div key={load.id} className="rounded-2xl p-3 space-y-2.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'var(--muted)' }}>
                    {load.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{load.label}</p>
                    <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{load.count} items · {load.detail}</p>
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['dirty', 'washing', 'clean'] as LaundryState[]).map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => updateState(load.id, state)}
                      className="py-1.5 rounded-lg text-[10px] font-semibold"
                      style={{
                        background: load.state === state ? STATE_META[state].color : 'var(--muted)',
                        color: load.state === state ? '#fff' : 'var(--muted-foreground)',
                      }}
                    >
                      {STATE_META[state].label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'care' && (
        <div className="space-y-3">
          {CARE_ITEMS.map(([icon, item, care]) => (
            <div key={item} className="flex gap-3 rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <span className="text-2xl" aria-hidden="true">{icon}</span>
              <div>
                <p className="text-sm font-semibold">{item}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{care}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'routine' && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--yellow)' }}>Sunday reset</p>
                <p className="text-lg font-semibold mt-1">6:00 PM</p>
              </div>
              <button
                type="button"
                onClick={() => setRoutineEnabled((enabled) => !enabled)}
                className="w-12 h-7 rounded-full p-1"
                aria-pressed={routineEnabled}
                style={{ background: routineEnabled ? 'var(--green)' : 'var(--muted)' }}
              >
                <span
                  className={`block w-5 h-5 rounded-full transition-transform ${routineEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  style={{ background: '#fff' }}
                />
              </button>
            </div>
            <p className="text-xs mt-3" style={{ color: 'var(--muted-foreground)' }}>
              Colors, delicates, then outfit prep for Monday. Reminder is {routineEnabled ? 'on' : 'off'}.
            </p>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'rgba(114,212,240,0.08)', border: '1px solid rgba(114,212,240,0.2)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--sky)' }}>AI routine note</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              Your work tops are running low. A small cold-color load before Thursday should keep planned outfits available.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
