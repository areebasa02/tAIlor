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
  items: { type: string; desc: string; color: string; emoji: string; reason: string }[]
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
      { type: 'Top', desc: 'Navy relaxed-fit crew tee', color: '#2B4B8C', emoji: '👕', reason: 'A reliable, breathable base.' },
      { type: 'Bottom', desc: 'Medium-wash slim jeans', color: '#4A6FA5', emoji: '👖', reason: 'Easy structure for a casual day.' },
      { type: 'Shoes', desc: 'White leather low sneakers', color: '#F2F2F2', emoji: '👟', reason: 'Comfortable for time on your feet.' },
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
      { type: 'Top', desc: 'Magenta oversized button-down', color: '#D40067', emoji: '👚', reason: 'Adds a confident focal color.' },
      { type: 'Bottom', desc: 'Camel wide-leg trousers', color: '#C8965A', emoji: '👖', reason: 'Balances the bright top with warmth.' },
      { type: 'Shoes', desc: 'Tan leather loafers', color: '#B8825A', emoji: '👞', reason: 'Polishes the look without feeling formal.' },
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
      { type: 'Top', desc: 'Mint ribbed mock-neck', color: '#B4F0C0', emoji: '🧶', reason: 'Brings a rarely worn piece forward.' },
      { type: 'Bottom', desc: 'Black wide-leg trousers', color: '#1A1A1A', emoji: '👖', reason: 'Keeps the mint color grounded.' },
      { type: 'Shoes', desc: 'White chunky platform sneakers', color: '#E8E8E8', emoji: '👟', reason: 'Echoes the light, fresh palette.' },
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
        className="rounded-2xl px-4 py-3.5 space-y-3"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{DATE}</p>
            <p className="font-semibold text-base mt-0.5 whitespace-nowrap" style={{ color: 'var(--foreground)' }}>
              Good morning, Eliora
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-2xl leading-none">{WEATHER.icon}</p>
            <p className="w-max whitespace-nowrap text-[10px] leading-none" style={{ color: 'var(--muted-foreground)' }}>
              {WEATHER.temp} · {WEATHER.condition}
            </p>
          </div>
        </div>
        <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(114,212,240,0.07)' }}>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
            Mild and dry through evening. Layers will keep you comfortable from errands to dinner.
          </p>
        </div>
      </div>

      {/* Section header */}
      <div className="-mt-2">
        <h2 className="text-xl font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>Today's outfit</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          Choose a direction — your AI stylist will handle the rest
        </p>
      </div>

      {/* Direction pills */}
      <div className="flex gap-3">
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
          <div className="-mt-2 h-11 flex flex-col justify-center">
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
                className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl px-3 py-3 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(7rem,0.8fr)]"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: ctrlMode === 'editing' ? '1px solid rgba(114,212,240,0.3)' : '1px solid transparent',
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl row-span-2 sm:row-span-1"
                  style={{ background: item.color, border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  <span aria-hidden="true">{item.emoji}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                    {item.type}
                  </p>
                  <p className="text-sm font-medium leading-snug" style={{ color: 'var(--foreground)' }}>
                    {item.desc}
                  </p>
                </div>
                <div className="min-w-0 pt-2 border-t border-border sm:pt-0 sm:pl-3 sm:border-t-0 sm:border-l">
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                    {item.reason}
                  </p>
                  {ctrlMode === 'editing' && (
                    <button className="mt-1 text-[10px]" style={{ color: 'var(--sky)' }}>swap →</button>
                  )}
                </div>
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
            showWhy={false}
          />
        </div>
      )}

      {/* Recent looks — 8 days, full-width grid */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Recent looks</h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { day: 'Wednesday', color: '#007A8A', items: ['Teal trench', 'Black wide-legs', 'White sneakers'] },
            { day: 'Tuesday', color: '#D40067', items: ['Magenta blouse', 'Camel trousers', 'Tan loafers'] },
            { day: 'Monday', color: '#2B4B8C', items: ['Navy tee', 'Slim jeans', 'White sneakers'] },
            { day: 'Sunday', color: '#C8965A', items: ['Cream blouse', 'Camel trousers', 'Tan loafers'] },
            { day: 'Saturday', color: '#B4F0C0', items: ['Mint mock-neck', 'Black wide-legs', 'Platforms'] },
            { day: 'Friday', color: '#FFD83D', items: ['Gold tee', 'Slim jeans', 'White sneakers'] },
            { day: 'Thursday', color: '#4A6FA5', items: ['Denim jacket', 'Slim jeans', 'White sneakers'] },
            { day: 'Wednesday', color: '#1A1A2E', items: ['Black wide-legs', 'Cream blouse', 'Tan loafers'] },
          ].map((r, index) => (
            <div
              key={`${r.day}-${index}`}
              className="flex flex-col rounded-2xl overflow-hidden"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="h-20 w-full" style={{ background: r.color }} />
              <div className="p-2 space-y-0.5">
                <p className="text-[10px] font-bold leading-tight" style={{ color: 'var(--foreground)' }}>{r.day}</p>
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
