import { useState } from 'react'
import {
  AnimatedStepProgress,
  AIStatusPill,
  UncertaintyBanner,
  UserControlBar,
  VoiceInputButton,
  AIErrorBanner,
  type ControlMode,
  type VoiceState,
} from '../components/AIComponents'

type Step = 'input' | 'loading' | 'results' | 'error'

interface GeneratedOutfit {
  id: number
  label: string
  rationale: string
  items: { type: string; desc: string; color: string }[]
}

const RESULTS: GeneratedOutfit[] = [
  {
    id: 1,
    label: 'Option A — Polished & Confident',
    rationale: 'A monochromatic warm-toned look reads as authoritative without being stiff — well-suited for a networking dinner where you want to leave an impression.',
    items: [
      { type: 'Top',    desc: 'Cream linen blouse',      color: '#F5EFD8' },
      { type: 'Bottom', desc: 'Camel wide-leg trousers', color: '#C8965A' },
      { type: 'Shoes',  desc: 'Tan loafers',             color: '#B8825A' },
    ],
    why: 'A monochromatic warm-toned look reads as authoritative without being stiff — ideal for a networking dinner where you want to leave an impression.',
  },
  {
    id: 2,
    label: 'Option B — Subtle Statement',
    rationale: 'The magenta-black-white triad is bold but grounded. The contrast stands out at an event full of navy and grey.',
    items: [
      { type: 'Top',    desc: 'Magenta button-down',    color: '#D40067' },
      { type: 'Bottom', desc: 'Black wide-leg trousers', color: '#1A1A2E' },
      { type: 'Shoes',  desc: 'White chunky platforms',  color: '#E8E8E8' },
    ],
  },
]

const GENERATION_STEPS = [
  'Reading event context',
  'Browsing your wardrobe',
  'Checking recent outfits',
  'Building options',
]

export default function GeneratorTab() {
  const [step, setStep] = useState<Step>('input')
  const [eventDesc, setEventDesc] = useState('')
  const [dresscode, setDresscode] = useState('')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [saved, setSaved] = useState<Set<number>>(new Set())
  const [ctrlMode, setCtrlMode] = useState<Record<number, ControlMode>>({ 1: 'default', 2: 'default' })
  const [serviceError, setServiceError] = useState(false)

  const inputTooVague = eventDesc.trim().length > 0 && eventDesc.trim().length < 18
  const inputReady = eventDesc.trim().length >= 18

  const handleGenerate = () => {
    if (!inputReady) return
    setStep('loading')
    setServiceError(false)
  }

  const handleLoadingComplete = () => {
    // 10% chance of simulated error for demo
    setStep('results')
  }

  const cycleVoice = () => {
    if (voiceState === 'idle' || voiceState === 'error') {
      setVoiceState('listening')
    } else if (voiceState === 'listening') {
      // user pressed to stop — start 1s transcription countdown
      setVoiceState('processing')
      setTimeout(() => setVoiceState('captured'), 1000)
    }
  }

  return (
    <div className="px-5 pt-2 pb-4 space-y-5">
      <div>
        <h2 className="text-xl font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>Outfit generator</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          Describe the event — your AI stylist finds the right look from your wardrobe
        </p>
      </div>

      {/* Input form */}
      {step === 'input' && (
        <div className="space-y-3">
          {/* Text input with embedded voice button */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted-foreground)' }}>
              Describe the event
            </label>
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--muted)',
                border: inputTooVague
                  ? '1px solid rgba(255,211,61,0.5)'
                  : inputReady
                  ? '1px solid rgba(59,191,108,0.5)'
                  : '1px solid var(--border)',
              }}
            >
              <textarea
                value={eventDesc}
                onChange={(e) => setEventDesc(e.target.value)}
                placeholder="e.g. Networking dinner at a rooftop venue, 7pm Thursday, business-casual"
                rows={3}
                className="w-full px-4 pt-3 pb-1 text-sm outline-none resize-none"
                style={{ background: 'transparent', color: 'var(--foreground)' }}
              />
              {/* Voice button bar inside the textarea box */}
              <div
                className="flex items-center gap-2 px-3 pb-2 pt-1"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                {voiceState === 'captured' ? (
                  <>
                    <span className="text-[10px] flex-1 truncate italic" style={{ color: 'var(--muted-foreground)' }}>
                      "Networking dinner, rooftop, 7pm Thursday, business-casual"
                    </span>
                    <button
                      onClick={() => { setEventDesc('Networking dinner at a rooftop venue, 7pm Thursday, business-casual'); setVoiceState('idle') }}
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                      style={{ background: 'rgba(59,191,108,0.2)', color: '#3BBF6C' }}
                    >
                      Use
                    </button>
                    <button
                      onClick={() => setVoiceState('idle')}
                      className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                    >
                      Discard
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={cycleVoice}
                      disabled={voiceState === 'processing'}
                      className="relative flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full"
                      style={{
                        background: voiceState === 'listening' ? 'rgba(212,0,103,0.15)' : 'var(--muted)',
                        color: voiceState === 'listening' ? 'var(--magenta)' : voiceState === 'error' ? '#E84B1A' : voiceState === 'processing' ? '#72D4F0' : 'var(--muted-foreground)',
                        border: `1px solid ${voiceState === 'listening' ? 'rgba(212,0,103,0.5)' : voiceState === 'processing' ? 'rgba(114,212,240,0.4)' : 'var(--border)'}`,
                      }}
                    >
                      {voiceState === 'listening' && (
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--magenta)' }} />
                      )}
                      {voiceState === 'processing' && (
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#72D4F0' }} />
                      )}
                      <span>{voiceState === 'processing' ? '⧖' : '🎙'}</span>
                      <span>
                        {voiceState === 'idle' ? 'Speak' : voiceState === 'listening' ? 'Tap to stop' : voiceState === 'processing' ? 'Transcribing…' : 'Error — retry'}
                      </span>
                    </button>
                    <span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>or type above</span>
                  </>
                )}
              </div>
            </div>
            {/* Input state feedback */}
            {inputTooVague && (
              <div className="mt-2">
                <UncertaintyBanner message="Not enough context — include venue, time, and dress code for better results." />
              </div>
            )}
            {inputReady && (
              <div className="mt-1.5">
                <AIStatusPill state="success" label="Context accepted" />
              </div>
            )}
          </div>

          {/* Dress code chips */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted-foreground)' }}>
              Dress code (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {['Casual', 'Smart-casual', 'Business', 'Formal', 'Creative'].map((dc) => (
                <button
                  key={dc}
                  onClick={() => setDresscode(dresscode === dc ? '' : dc)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    background: dresscode === dc ? 'var(--magenta)' : 'var(--muted)',
                    color: dresscode === dc ? '#fff' : 'var(--muted-foreground)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {dc}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!inputReady}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{
              background: inputReady ? 'var(--magenta)' : 'var(--muted)',
              color: inputReady ? '#fff' : 'var(--muted-foreground)',
            }}
          >
            ✧ Generate outfits
          </button>
        </div>
      )}

      {/* Loading */}
      {step === 'loading' && (
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Reviewing your wardrobe and weather…
          </p>
          <AnimatedStepProgress
            steps={GENERATION_STEPS}
            intervalMs={900}
            onComplete={handleLoadingComplete}
          />
          <button
            onClick={() => setStep('input')}
            className="w-full py-2 rounded-xl text-xs"
            style={{ color: 'var(--muted-foreground)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Service error */}
      {step === 'error' && (
        <div className="space-y-3">
          <AIErrorBanner
            title="Service unavailable"
            message="The AI stylist is temporarily offline. Your wardrobe is still available to browse manually."
            actions={[
              { label: 'Retry', primary: true, onClick: () => { setStep('loading') } },
              { label: 'Browse wardrobe', onClick: () => {} },
            ]}
          />
        </div>
      )}

      {/* Results */}
      {step === 'results' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>
              2 outfits for your event
            </p>
            <button
              onClick={() => { setStep('input'); setEventDesc(''); setDresscode('') }}
              className="text-xs"
              style={{ color: 'var(--muted-foreground)' }}
            >
              ← New event
            </button>
          </div>

          {/* Event summary */}
          <div
            className="rounded-xl px-3 py-2 text-xs leading-relaxed"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            <span style={{ color: 'var(--sky)' }}>⛅ {dresscode || 'Business-casual'} · </span>
            {eventDesc}
          </div>

          {RESULTS.map((outfit) => (
            <div
              key={outfit.id}
              className="rounded-2xl p-4 space-y-3"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              {/* Header */}
              <p className="text-sm font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>
                {outfit.label}
              </p>

              {/* Items */}
              <div className="space-y-2">
                {outfit.items.map((item) => (
                  <div
                    key={item.type}
                    className="flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{
                      background: 'var(--muted)',
                      border: ctrlMode[outfit.id] === 'editing' ? '1px solid rgba(114,212,240,0.3)' : '1px solid transparent',
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-lg shrink-0"
                      style={{ background: item.color, border: '1px solid rgba(255,255,255,0.12)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                        {item.type}
                      </p>
                      <p className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>{item.desc}</p>
                    </div>
                    {ctrlMode[outfit.id] === 'editing' && (
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--sky)' }}>swap →</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Rationale — always shown */}
              {(
                <div
                  className="rounded-xl px-3 py-2.5 text-xs leading-relaxed"
                  style={{
                    background: 'rgba(114,212,240,0.08)',
                    color: 'var(--muted-foreground)',
                    border: '1px solid rgba(114,212,240,0.15)',
                  }}
                >
                  {outfit.rationale}
                </div>
              )}

              {/* Control bar */}
              <UserControlBar
                mode={ctrlMode[outfit.id]}
                approveLabel={saved.has(outfit.id) ? '✓ Saved' : 'Approve & save'}
                onApprove={() => {
                  setSaved((s) => new Set([...s, outfit.id]))
                  setCtrlMode((m) => ({ ...m, [outfit.id]: 'default' }))
                }}
                onEdit={() =>
                  setCtrlMode((m) => ({
                    ...m,
                    [outfit.id]: m[outfit.id] === 'editing' ? 'default' : 'editing',
                  }))
                }
                onReject={() => setCtrlMode((m) => ({ ...m, [outfit.id]: 'rejected' }))}
                onRegenerate={() => {
                  setCtrlMode((m) => ({ ...m, [outfit.id]: 'regenerating' }))
                  setTimeout(() => setCtrlMode((m) => ({ ...m, [outfit.id]: 'default' })), 2200)
                }}
                onUndo={() => setCtrlMode((m) => ({ ...m, [outfit.id]: 'undone' }))}
                onWhy={() => {}}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
