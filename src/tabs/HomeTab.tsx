import { useState } from 'react'
import {
  AnimatedStepProgress,
  UserControlBar,
  type ControlMode,
} from '../components/AIComponents'

type Direction = 'safe' | 'stylish' | 'rediscover'

const WEATHER = { temp: '68°F', condition: 'Partly Cloudy', icon: '⛅' }
const DATE = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

interface Outfit {
  direction: Direction
  label: string
  tagline: string
  rationale: string
  items: { type: string; desc: string; color: string }[]
  accent: string
  bg: string
}

const OUTFITS: Outfit[] = [
  {
    direction: 'safe',
    label: 'Safe',
    tagline: 'Familiar pieces, zero stress',
    rationale: 'These are your most-worn pieces. They work together based on your past outfit history and today\'s casual forecast.',
    accent: 'var(--sky)',
    bg: 'rgba(114,212,240,0.08)',
    items: [
      { type: 'Top', desc: 'Navy relaxed-fit crew tee', color: '#2B4B8C' },
      { type: 'Bottom', desc: 'Medium-wash slim jeans', color: '#4A6FA5' },
      { type: 'Shoes', desc: 'White leather low sneakers', color: '#F2F2F2' },
    ],
  },
  {
    direction: 'stylish',
    label: 'Stylish',
    tagline: 'A bolder combination',
    rationale: 'Magenta and camel are a warm complementary pairing. You haven\'t worn this blouse in over a week — worth revisiting.',
    accent: 'var(--magenta)',
    bg: 'rgba(212,0,103,0.08)',
    items: [
      { type: 'Top', desc: 'Magenta oversized button-down', color: '#D40067' },
      { type: 'Bottom', desc: 'Camel wide-leg trousers', color: '#C8965A' },
      { type: 'Shoes', desc: 'Tan leather loafers', color: '#B8825A' },
    ],
  },
  {
    direction: 'rediscover',
    label: 'Rediscover',
    tagline: 'Something you forgot you owned',
    rationale: 'The mint mock-neck hasn\'t been worn in over three weeks. The black and white base lets it stand out without clashing.',
    accent: 'var(--green)',
    bg: 'rgba(59,191,108,0.08)',
    items: [
      { type: 'Top', desc: 'Mint ribbed mock-neck', color: '#B4F0C0' },
      { type: 'Bottom', desc: 'Black wide-leg trousers', color: '#1A1A1A' },
      { type: 'Shoes', desc: 'White chunky platform sneakers', color: '#E8E8E8' },
    ],
  },
]

const GENERATION_STEPS = [
  'Reading wardrobe & weather',
  'Checking recent outfit history',
  'Building today\'s options',
  'Finalising suggestions',
]

export default function HomeTab() {
  const [selected, setSelected] = useState<Direction>('stylish')
  const [loading, setLoading] = useState(false)
  const [ctrlMode, setCtrlMode] = useState<ControlMode>('default')

  const outfit = OUTFITS.find((o) => o.direction === selected)!

  const handleRegenerate = () => {
    setCtrlMode('regenerating')
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setCtrlMode('default')
    }, GENERATION_STEPS.length * 900 + 200)
  }

  const handleApprove = () => {
    setCtrlMode('default')
  }

  return (
    <div className="px-5 pt-2 pb-4 space-y-5">
      {/* Date + weather */}
      <div
        className="flex items-center justify-between rounded-2xl px-4 py-3"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{DATE}</p>
          <p className="font-semibold text-sm mt-0.5" style={{ color: 'var(--foreground)' }}>Good morning, Eliora</p>
        </div>
        <div className="text-right">
          <p className="text-2xl">{WEATHER.icon}</p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {WEATHER.temp} · {WEATHER.condition}
          </p>
        </div>
      </div>

      {/* Section header */}
      <div>
        <h2 className="text-xl font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>Today's outfit</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          Choose a direction — your AI stylist will handle the rest
        </p>
      </div>

      {/* Direction pills */}
      <div className="flex gap-2">
        {OUTFITS.map((o) => (
          <button
            key={o.direction}
            onClick={() => { setSelected(o.direction); setCtrlMode('default') }}
            className="flex-1 py-2 rounded-xl text-xs font-semibold tracking-wide uppercase"
            style={{
              background: selected === o.direction ? o.accent : 'var(--muted)',
              color: selected === o.direction ? (o.direction === 'safe' ? '#0D0F18' : '#fff') : 'var(--muted-foreground)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <AnimatedStepProgress
            steps={GENERATION_STEPS}
            intervalMs={900}
            onComplete={() => setLoading(false)}
          />
        </div>
      )}

      {/* Outfit card */}
      {!loading && (
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{ background: outfit.bg, border: `1px solid ${outfit.accent}30` }}
        >
          {/* Header */}
          <div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: outfit.accent }}>
              {outfit.label}
            </span>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {outfit.tagline}
            </p>
          </div>

          {/* Items */}
          <div className="space-y-2">
            {outfit.items.map((item) => (
              <div
                key={item.type}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: ctrlMode === 'editing' ? '1px solid rgba(114,212,240,0.3)' : '1px solid transparent',
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg shrink-0"
                  style={{ background: item.color, border: '1px solid rgba(255,255,255,0.15)' }}
                />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                    {item.type}
                  </p>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                    {item.desc}
                  </p>
                </div>
                {ctrlMode === 'editing' && (
                  <button className="ml-auto text-xs shrink-0" style={{ color: 'var(--sky)' }}>swap →</button>
                )}
              </div>
            ))}
          </div>

          {/* Rationale — always shown; explains the suggestion in plain language */}
          <div
            className="rounded-xl px-3 py-2.5 text-xs leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted-foreground)' }}
          >
            {outfit.rationale}
          </div>

          {/* User control bar */}
          <UserControlBar
            mode={ctrlMode}
            approveLabel="Approve & wear today"
            onApprove={handleApprove}
            onEdit={() => setCtrlMode(ctrlMode === 'editing' ? 'default' : 'editing')}
            onReject={() => setCtrlMode('rejected')}
            onRegenerate={handleRegenerate}
            onUndo={() => setCtrlMode('undone')}
            onWhy={() => {}}
          />
        </div>
      )}

      {/* Recent looks — 8 days, full-width grid */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Recent looks</h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { relative: 'Today',  day: 'Wednesday', color: '#007A8A', items: ['Teal trench', 'Black wide-legs', 'White sneakers'] },
            { relative: 'Tue',    day: 'Tuesday',   color: '#D40067', items: ['Magenta blouse', 'Camel trousers', 'Tan loafers'] },
            { relative: 'Mon',    day: 'Monday',    color: '#2B4B8C', items: ['Navy tee', 'Slim jeans', 'White sneakers'] },
            { relative: 'Sun',    day: 'Sunday',    color: '#C8965A', items: ['Cream blouse', 'Camel trousers', 'Tan loafers'] },
            { relative: 'Sat',    day: 'Saturday',  color: '#B4F0C0', items: ['Mint mock-neck', 'Black wide-legs', 'Platforms'] },
            { relative: 'Fri',    day: 'Friday',    color: '#FFD83D', items: ['Gold tee', 'Slim jeans', 'White sneakers'] },
            { relative: 'Thu',    day: 'Thursday',  color: '#4A6FA5', items: ['Denim jacket', 'Slim jeans', 'White sneakers'] },
            { relative: '8d ago', day: 'Wednesday', color: '#1A1A2E', items: ['Black wide-legs', 'Cream blouse', 'Tan loafers'] },
          ].map((r) => (
            <div
              key={r.relative}
              className="flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="h-10 w-full" style={{ background: r.color }} />
              <div className="p-2 space-y-0.5">
                <p className="text-[10px] font-bold leading-tight" style={{ color: 'var(--foreground)' }}>{r.relative}</p>
                <p className="text-[9px] leading-tight" style={{ color: 'var(--muted-foreground)' }}>{r.day}</p>
                <ul className="mt-1 space-y-0.5">
                  {r.items.map((item) => (
                    <li key={item} className="text-[9px] leading-tight" style={{ color: 'var(--muted-foreground)' }}>
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
