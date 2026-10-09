import { useState } from 'react'
import {
  ImageUploadWidget,
  AIErrorBanner,
  type UploadState,
} from '../components/AIComponents'

type Mode = 'identify' | 'compare'

interface IdentifiedColor {
  name: string
  hex: string
  category: string
  compatible: { name: string; hex: string; reason: string }[]
}

const IDENTIFIED: IdentifiedColor = {
  name: 'Deep Teal',
  hex: '#007A8A',
  category: 'Cool · Neutral',
  compatible: [
    { name: 'Camel',     hex: '#C8965A', reason: 'Warm-cool contrast creates visual balance.' },
    { name: 'Off-white', hex: '#F5EFD8', reason: 'Classic neutral pairing — clean and timeless.' },
    { name: 'Coral',     hex: '#E84B1A', reason: 'Complementary hue, high-energy combination.' },
    { name: 'Soft gold', hex: '#FFD83D', reason: "Analogous warmth amplifies teal's depth." },
  ],
}

const SAMPLE_ITEMS = [
  { name: 'Teal trench coat', color: '#007A8A', emoji: '🧥', description: 'Water-resistant outerwear · cool teal' },
  { name: 'Magenta blouse', color: '#D40067', emoji: '👚', description: 'Oversized button-down · vivid magenta' },
  { name: 'Camel trousers', color: '#C8965A', emoji: '👖', description: 'Wide-leg bottoms · warm camel' },
  { name: 'Navy tee', color: '#2B4B8C', emoji: '👕', description: 'Relaxed crew top · deep navy' },
  { name: 'Mint mock-neck', color: '#B4F0C0', emoji: '🧶', description: 'Ribbed knit top · soft mint' },
]

type IdentifyStep = 'select' | 'uploading' | 'analyzing' | 'result' | 'error' | 'correct'

function isCompatible(a: string, b: string) {
  const clashes = [['#D40067', '#E84B1A']]
  return !clashes.some((pair) => pair.includes(a) && pair.includes(b))
}

export default function ColorsTab() {
  const [mode, setMode] = useState<Mode>('identify')

  // Identify mode state
  const [identifyStep, setIdentifyStep] = useState<IdentifyStep>('select')
  const [selectedItem, setSelectedItem] = useState<typeof SAMPLE_ITEMS[0] | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [corrected, setCorrected] = useState(false)

  // Compare mode state
  const [compareA, setCompareA] = useState<typeof SAMPLE_ITEMS[0] | null>(null)
  const [compareB, setCompareB] = useState<typeof SAMPLE_ITEMS[0] | null>(null)
  const [pickingFor, setPickingFor] = useState<'A' | 'B'>('A')

  const uploadState: UploadState =
    identifyStep === 'select' ? 'empty'
    : identifyStep === 'uploading' ? 'uploading'
    : identifyStep === 'analyzing' ? 'analyzing'
    : identifyStep === 'result' ? 'success'
    : identifyStep === 'error' ? 'error'
    : 'empty'

  const startAnalysis = (item: typeof SAMPLE_ITEMS[0]) => {
    setSelectedItem(item)
    setIdentifyStep('uploading')
    setUploadProgress(0)
    const tick = setInterval(() => {
      setUploadProgress((p) => {
        if (p >= 100) {
          clearInterval(tick)
          setIdentifyStep('analyzing')
          setTimeout(() => setIdentifyStep('result'), 2000)
          return 100
        }
        return Math.min(100, p + 20)
      })
    }, 250)
  }

  return (
    <div className="px-5 pt-2 pb-4 space-y-5">
      <div>
        <h2 className="text-xl font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>Color matcher</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          Identify a color from your wardrobe or compare two pieces for compatibility
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl p-1" style={{ background: 'var(--muted)' }}>
        {(['identify', 'compare'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setIdentifyStep('select'); setCompareA(null); setCompareB(null) }}
            className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize"
            style={{
              background: mode === m ? 'var(--card)' : 'transparent',
              color: mode === m ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {m === 'identify' ? 'Identify color' : 'Compare two items'}
          </button>
        ))}
      </div>

      {/* ── Identify mode ── */}
      {mode === 'identify' && (
        <div className="space-y-4">
          {/* The ImageUploadWidget drives steps: empty → uploading → analyzing → success/error */}
          <ImageUploadWidget
            state={uploadState}
            progress={uploadProgress}
            result={
              identifyStep === 'result' && selectedItem
                ? { name: IDENTIFIED.name, hex: IDENTIFIED.hex, category: IDENTIFIED.category }
                : undefined
            }
            onRetake={() => {
              if (identifyStep === 'select' || identifyStep === 'error') {
                // simulate taking a photo
                startAnalysis(SAMPLE_ITEMS[0])
              } else {
                setIdentifyStep('select')
                setSelectedItem(null)
              }
            }}
            onManual={() => setIdentifyStep('select')}
            onSave={() => { setIdentifyStep('select'); setSelectedItem(null) }}
            onCorrect={() => setCorrected(true)}
          />

          {/* Confidence on success */}
          {identifyStep === 'result' && (
            <div className="space-y-3">
              <div
                className="rounded-xl px-3 py-2 text-[10px] leading-snug"
                style={{ background: 'rgba(59,191,108,0.1)', color: '#3BBF6C', border: '1px solid rgba(59,191,108,0.25)' }}
              >
                ✓ Color recognized — verify it looks right and correct if needed
              </div>

              {corrected && (
                <div className="space-y-1.5">
                  <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Correct the color:</p>
                  <div className="flex flex-wrap gap-2">
                    {['Navy', 'Teal', 'Green', 'Blue-green', 'Midnight'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setCorrected(false)}
                        className="px-3 py-1.5 rounded-full text-xs"
                        style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Compatible colors */}
              <div>
                <p className="text-sm font-semibold mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Works well with</p>
                <div className="space-y-2">
                  {IDENTIFIED.compatible.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg shrink-0"
                        style={{ background: c.hex, border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{c.name}</p>
                        <p className="text-[10px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>{c.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => { setIdentifyStep('select'); setSelectedItem(null); setCorrected(false) }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
              >
                ← Try another
              </button>
            </div>
          )}

          {/* Wardrobe picker (shown when empty) */}
          {identifyStep === 'select' && (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Or pick from your wardrobe:
              </p>
              {SAMPLE_ITEMS.map((item) => (
                <button
                  key={item.name}
                  onClick={() => startAnalysis(item)}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                    style={{ background: item.color, border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <span aria-hidden="true">{item.emoji}</span>
                  </div>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium" style={{ color: 'var(--foreground)' }}>{item.name}</span>
                    <span className="block text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>{item.description}</span>
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Analyze →</span>
                </button>
              ))}
            </div>
          )}

          {/* Error state with recovery */}
          {identifyStep === 'error' && (
            <AIErrorBanner
              title="Color not recognized"
              message="The photo may be too dark or the item isn't a standard garment. Try retaking or enter the color name manually."
              actions={[
                { label: '📷 Retake', primary: true, onClick: () => startAnalysis(SAMPLE_ITEMS[0]) },
                { label: 'Enter manually', onClick: () => setIdentifyStep('select') },
              ]}
            />
          )}
        </div>
      )}

      {/* ── Compare mode ── */}
      {mode === 'compare' && (
        <div className="space-y-4">
          {/* Two item slots */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { slot: 'A' as const, item: compareA },
              { slot: 'B' as const, item: compareB },
            ].map(({ slot, item }) => (
              <div key={slot}>
                <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: (!compareA || !compareB) && pickingFor === slot ? 'var(--magenta)' : 'var(--muted-foreground)' }}>
                  Item {slot} {(!compareA || !compareB) && pickingFor === slot ? '← picking' : ''}
                </p>
                {item ? (
                  <div
                    className="rounded-2xl overflow-hidden cursor-pointer"
                    style={{ border: (!compareA || !compareB) && pickingFor === slot ? '2px solid var(--magenta)' : '1px solid var(--border)' }}
                    onClick={() => {
                      if (slot === 'A') setCompareA(null)
                      else setCompareB(null)
                      setPickingFor(slot)
                    }}
                  >
                    <div className="h-16" style={{ background: item.color }} />
                    <div className="p-2 text-center">
                      <p className="text-[10px] font-medium truncate" style={{ color: 'var(--foreground)' }}>{item.name}</p>
                      <p className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>tap to change</p>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setPickingFor(slot)}
                    className="w-full h-24 rounded-2xl border-2 border-dashed flex items-center justify-center text-xs font-semibold"
                    style={{
                      borderColor: pickingFor === slot ? 'var(--magenta)' : 'var(--border)',
                      color: pickingFor === slot ? 'var(--magenta)' : 'var(--muted-foreground)',
                      background: pickingFor === slot ? 'rgba(212,0,103,0.06)' : 'transparent',
                    }}
                  >
                    Pick item {slot}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Item picker list */}
          {(!compareA || !compareB) && (
            <div className="space-y-2">
              <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                Picking for:</p>
              <div className="flex gap-2 mb-1">
                {(['A', 'B'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setPickingFor(s)}
                    className="flex-1 py-1.5 rounded-xl text-xs font-semibold"
                    style={{
                      background: pickingFor === s ? 'var(--magenta)' : 'var(--muted)',
                      color: pickingFor === s ? '#fff' : 'var(--muted-foreground)',
                      border: pickingFor === s ? '2px solid var(--magenta)' : '2px solid transparent',
                    }}
                  >
                    Item {s} {s === 'A' ? (compareA ? `· ${compareA.name}` : '· empty') : (compareB ? `· ${compareB.name}` : '· empty')}
                  </button>
                ))}
              </div>
              {/* below label kept for screen reader context */}
              <p className="sr-only">
                Picking for item {pickingFor}:
              </p>
              {SAMPLE_ITEMS.map((item) => {
                const alreadyPicked = item === compareA || item === compareB
                return (
                  <button
                    key={item.name}
                    disabled={alreadyPicked}
                    onClick={() => {
                      if (pickingFor === 'A') { setCompareA(item); if (!compareB) setPickingFor('B') }
                      else { setCompareB(item) }
                    }}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-left"
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      opacity: alreadyPicked ? 0.4 : 1,
                    }}
                  >
                    <div className="w-7 h-7 rounded-lg" style={{ background: item.color, border: '1px solid rgba(255,255,255,0.1)' }} />
                    <span className="text-sm font-medium flex-1" style={{ color: 'var(--foreground)' }}>{item.name}</span>
                    {alreadyPicked && <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>selected</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* Compatibility result */}
          {compareA && compareB && (
            <div className="space-y-3">
              {(() => {
                const compatible = isCompatible(compareA.color, compareB.color)
                return (
                  <>
                    <div
                      className="rounded-2xl p-4 text-center"
                      style={{
                        background: compatible ? 'rgba(59,191,108,0.1)' : 'rgba(232,75,26,0.1)',
                        border: `1px solid ${compatible ? 'rgba(59,191,108,0.3)' : 'rgba(232,75,26,0.3)'}`,
                      }}
                    >
                      <p
                        className="text-base font-semibold"
                        style={{
                          fontFamily: 'Nunito, sans-serif',
                          color: compatible ? '#3BBF6C' : '#E84B1A',
                        }}
                      >
                        {compatible ? '✓ These work well together' : '⚠ High-energy clash'}
                      </p>
                      <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                        {compatible
                          ? 'The tones complement each other — use one as the hero and the other as accent.'
                          : 'Both are warm-dominant saturated hues. Consider adding a neutral to separate them.'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                        style={{ background: '#3BBF6C', color: '#fff' }}
                      >
                        Use this combination
                      </button>
                      <button
                        onClick={() => { setCompareA(null); setCompareB(null); setPickingFor('A') }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                        style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
                      >
                        Try another
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
