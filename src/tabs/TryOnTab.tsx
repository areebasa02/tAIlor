import { useState } from 'react'
import { PulseOrb, AIErrorBanner, AIStatusPill } from '../components/AIComponents'

type Step = 'outfit' | 'consent' | 'uploading' | 'processing' | 'preview' | 'error'

const OUTFITS = [
  {
    id: 1,
    label: 'Magenta & Black',
    items: ['Magenta button-down', 'Black wide-legs', 'White platforms'],
    colors: ['#D40067', '#1A1A2E', '#E8E8E8'],
  },
  {
    id: 2,
    label: 'Camel Tonal',
    items: ['Cream linen blouse', 'Camel trousers', 'Tan loafers'],
    colors: ['#F5EFD8', '#C8965A', '#B8825A'],
  },
  {
    id: 3,
    label: 'Teal Statement',
    items: ['Teal trench coat', 'Black wide-legs', 'White sneakers'],
    colors: ['#007A8A', '#1A1A2E', '#F2F2F2'],
  },
]

export default function TryOnTab() {
  const [step, setStep] = useState<Step>('outfit')
  const [selectedOutfit, setSelectedOutfit] = useState<typeof OUTFITS[0] | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processingLabel, setProcessingLabel] = useState('Preparing images')

  const handleSelectOutfit = (o: typeof OUTFITS[0]) => {
    setSelectedOutfit(o)
    setStep('consent')
  }

  const handleConsent = () => {
    window.alert('Camera features have not been added yet. This is where your image will show up when they are available.')
  }

  const reset = () => { setStep('outfit'); setSelectedOutfit(null); setUploadProgress(0) }

  return (
    <div className="px-5 pt-2 pb-4 space-y-5">
      <div>
        <h2 className="text-xl font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>Virtual try-on</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          See how a saved outfit looks on you before getting dressed
        </p>
      </div>

      {/* AI disclosure — always visible */}
      <div
        className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
        style={{
          background: 'rgba(114,212,240,0.08)',
          border: '1px solid rgba(114,212,240,0.2)',
          color: 'var(--muted-foreground)',
        }}
      >
        <span style={{ color: 'var(--sky)' }}>ℹ</span>
        <span>Previews are AI-generated and may misrepresent fit, fabric, or proportions. Use as a guide only.</span>
      </div>

      {/* Step: choose outfit */}
      {step === 'outfit' && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Choose an outfit to try on
          </p>
          {OUTFITS.map((o) => (
            <button
              key={o.id}
              onClick={() => handleSelectOutfit(o)}
              className="w-full text-left rounded-2xl p-4 space-y-2.5"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{o.label}</p>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Try on →</span>
              </div>
              <div className="flex gap-1.5">
                {o.colors.map((c, i) => (
                  <div key={i} className="w-6 h-6 rounded-lg" style={{ background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {o.items.map((item) => (
                  <span
                    key={item}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step: consent */}
      {step === 'consent' && selectedOutfit && (
        <div className="space-y-4">
          <div
            className="rounded-2xl p-4 space-y-2"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Trying on: {selectedOutfit.label}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              To generate a preview, tAIlor needs a photo of you. This photo is used only to create the preview and is deleted immediately after — it is never stored or shared.
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              Consent is specific to this outfit and this photo only.
            </p>
          </div>
          <button
            onClick={handleConsent}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--magenta)', color: '#fff' }}
          >
            📷 I agree — take photo
          </button>
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Step: uploading */}
      {step === 'uploading' && (
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm font-semibold text-center" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Uploading your photo…
          </p>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              <span>Uploading</span><span>{Math.min(100, Math.max(0, uploadProgress))}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ background: 'var(--magenta)', width: `${Math.min(100, Math.max(0, uploadProgress))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step: AI processing — uses PulseOrb for long-running task */}
      {step === 'processing' && (
        <div
          className="rounded-2xl p-5 space-y-1"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <PulseOrb label={`${processingLabel} — this may take up to 30 seconds`} color="var(--magenta)" />
          <p className="text-[10px] text-center" style={{ color: 'var(--muted-foreground)' }}>
            Generating preview · cat-VTON model
          </p>
          <button
            onClick={reset}
            className="w-full mt-3 py-2 rounded-xl text-xs"
            style={{ color: 'var(--muted-foreground)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Step: preview result */}
      {step === 'preview' && selectedOutfit && (
        <div className="space-y-4">
          <AIStatusPill state="success" label="Preview ready" />

          {/* Mock preview canvas */}
          <div
            className="rounded-2xl overflow-hidden relative"
            style={{
              aspectRatio: '3/4',
              background: 'linear-gradient(160deg, #1E2133 0%, #0D0F18 100%)',
            }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-10">
              <div className="w-20 h-20 rounded-full" style={{ background: '#B8825A', border: '3px solid rgba(255,255,255,0.15)' }} />
              <div className="w-32 h-24 rounded-2xl" style={{ background: selectedOutfit.colors[0] }} />
              <div className="w-28 h-32 rounded-2xl" style={{ background: selectedOutfit.colors[1] }} />
              <div className="w-20 h-10 rounded-xl" style={{ background: selectedOutfit.colors[2] }} />
            </div>
            <div
              className="absolute bottom-3 left-3 right-3 rounded-xl px-3 py-2 text-[10px]"
              style={{ background: 'rgba(13,15,24,0.85)', color: 'var(--muted-foreground)' }}
            >
              AI-generated · {selectedOutfit.label} · cat-VTON
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="py-2.5 rounded-xl text-xs font-semibold"
              style={{ background: '#3BBF6C', color: '#fff' }}
            >
              Keep outfit
            </button>
            <button
              className="py-2.5 rounded-xl text-xs font-semibold"
              style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
            >
              Change an item
            </button>
            <button
              onClick={() => { setStep('consent') }}
              className="py-2.5 rounded-xl text-xs font-semibold"
              style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
            >
              Regenerate
            </button>
            <button
              onClick={reset}
              className="py-2.5 rounded-xl text-xs font-semibold"
              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
            >
              Delete preview
            </button>
          </div>
        </div>
      )}

      {/* Step: error */}
      {step === 'error' && (
        <div className="space-y-3">
          <AIErrorBanner
            title="Preview unavailable"
            message="We couldn't generate a preview this time. You can still choose this outfit from your wardrobe."
            actions={[
              { label: 'Try again', primary: true, onClick: () => setStep('consent') },
              { label: 'Continue without preview', onClick: reset },
            ]}
          />
        </div>
      )}
    </div>
  )
}
