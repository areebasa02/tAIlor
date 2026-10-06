import { useState } from 'react'
import HomeTab from './tabs/HomeTab'
import WardrobeTab from './tabs/WardrobeTab'
import GeneratorTab from './tabs/GeneratorTab'
import ColorsTab from './tabs/ColorsTab'
import TryOnTab from './tabs/TryOnTab'

type Tab = 'home' | 'wardrobe' | 'generator' | 'colors' | 'tryon'

const NAV = [
  { id: 'home' as Tab, label: 'Today', icon: '✦' },
  { id: 'wardrobe' as Tab, label: 'Wardrobe', icon: '👔' },
  { id: 'generator' as Tab, label: 'Stylist', icon: '✧' },
  { id: 'colors' as Tab, label: 'Colors', icon: '🎨' },
  { id: 'tryon' as Tab, label: 'Try-On', icon: '🪞' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('home')

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <div>
          <span
            className="text-3xl italic leading-none"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--magenta)' }}
          >
            t
          </span>
          <span
            className="text-3xl font-bold leading-none"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--sky)' }}
          >
            AI
          </span>
          <span
            className="text-3xl italic leading-none"
            style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--magenta)' }}
          >
            lor
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{ background: 'var(--magenta)', color: '#fff' }}
          >
            EB
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {tab === 'home' && <HomeTab />}
        {tab === 'wardrobe' && <WardrobeTab />}
        {tab === 'generator' && <GeneratorTab />}
        {tab === 'colors' && <ColorsTab />}
        {tab === 'tryon' && <TryOnTab />}
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex items-stretch"
        style={{
          background: 'rgba(13,15,24,0.96)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {NAV.map((n) => {
          const active = tab === n.id
          return (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-medium"
              style={{
                color: active ? 'var(--magenta)' : 'rgba(255,255,255,0.65)',
              }}
            >
              <span className="text-base leading-none">{n.icon}</span>
              <span className="text-[10px] tracking-wide uppercase">{n.label}</span>
              {active && (
                <span
                  className="absolute bottom-0 w-8 h-0.5 rounded-full"
                  style={{ background: 'var(--magenta)' }}
                />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
