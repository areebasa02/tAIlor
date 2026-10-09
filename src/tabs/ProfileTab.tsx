export default function ProfileTab({ onBack }: { onBack: () => void }) {
  return (
    <div className="px-5 pt-2 pb-4 space-y-5">
      <button type="button" onClick={onBack} className="text-xs font-semibold" style={{ color: 'var(--sky)' }}>
        ← Back to Today
      </button>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: 'var(--magenta)', color: '#fff' }}>
          EB
        </div>
        <div>
          <h2 className="text-xl font-semibold">Eliora Browning</h2>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>eliora.browning@example.com</p>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        {[
          ['Preferred style', 'Polished · colorful · comfortable'],
          ['Typical sizes', 'Tops M · Bottoms 8 · Shoes 8'],
          ['Home climate', 'Mild and changeable'],
          ['Stylist notes', 'Likes bold color with grounded neutrals'],
        ].map(([label, value], index) => (
          <div
            key={label}
            className="px-4 py-3"
            style={{ borderTop: index ? '1px solid var(--border)' : undefined }}
          >
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
            <p className="text-sm mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-4" style={{ background: 'rgba(114,212,240,0.08)', border: '1px solid rgba(114,212,240,0.2)' }}>
        <p className="text-xs font-bold" style={{ color: 'var(--sky)' }}>AI personalization</p>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          tAIlor uses these preferences and your corrections to explain suggestions more clearly. You can update or remove them at any time.
        </p>
      </div>
    </div>
  )
}
