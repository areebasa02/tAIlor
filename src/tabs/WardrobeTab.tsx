import { useState } from 'react'
import { ImageUploadWidget, type UploadState } from '../components/AIComponents'
import ColorsTab from './ColorsTab'

type Category = 'All' | 'Tops' | 'Bottoms' | 'Shoes' | 'Outerwear' | 'Accessories'

const CATEGORY_EMOJI: Record<string, string> = {
  Tops: '👕',
  Bottoms: '👖',
  Shoes: '👟',
  Outerwear: '🧥',
  Accessories: '💍',
}

interface Item {
  id: number
  name: string
  category: string
  color: string
  worn: number
  favorite: boolean
}

const ITEMS: Item[] = [
  { id: 1,  name: 'Magenta button-down',  category: 'Tops',        color: '#D40067', worn: 12, favorite: true },
  { id: 2,  name: 'Navy crew tee',        category: 'Tops',        color: '#2B4B8C', worn: 34, favorite: false },
  { id: 3,  name: 'Mint ribbed mock-neck',category: 'Tops',        color: '#B4F0C0', worn: 4,  favorite: false },
  { id: 4,  name: 'Cream linen blouse',   category: 'Tops',        color: '#F5EFD8', worn: 8,  favorite: true },
  { id: 5,  name: 'Slim jeans',           category: 'Bottoms',     color: '#4A6FA5', worn: 45, favorite: true },
  { id: 6,  name: 'Camel trousers',       category: 'Bottoms',     color: '#C8965A', worn: 18, favorite: false },
  { id: 7,  name: 'Black wide-legs',      category: 'Bottoms',     color: '#1A1A2E', worn: 22, favorite: true },
  { id: 8,  name: 'White sneakers',       category: 'Shoes',       color: '#F2F2F2', worn: 60, favorite: true },
  { id: 9,  name: 'Tan loafers',          category: 'Shoes',       color: '#B8825A', worn: 15, favorite: false },
  { id: 10, name: 'Chunky platforms',     category: 'Shoes',       color: '#E8E8E8', worn: 7,  favorite: false },
  { id: 11, name: 'Teal trench coat',     category: 'Outerwear',   color: '#007A8A', worn: 9,  favorite: true },
  { id: 12, name: 'Gold hoops',           category: 'Accessories', color: '#FFD83D', worn: 50, favorite: true },
]

const CATS: Category[] = ['All', 'Tops', 'Bottoms', 'Shoes', 'Outerwear', 'Accessories']

type AddStep = 'closed' | 'photo' | 'manual'

export default function WardrobeTab() {
  const [section, setSection] = useState<'wardrobe' | 'colors'>('wardrobe')
  const [cat, setCat] = useState<Category>('All')
  const [search, setSearch] = useState('')
  const [favorites, setFavorites] = useState<Set<number>>(
    new Set(ITEMS.filter((i) => i.favorite).map((i) => i.id))
  )
  const [addStep, setAddStep] = useState<AddStep>('closed')
  const [uploadState, setUploadState] = useState<UploadState>('empty')
  const [uploadProgress, setUploadProgress] = useState(0)

  const filtered = ITEMS.filter((item) => {
    const matchCat = cat === 'All' || item.category === cat
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const toggleFav = (id: number) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Simulate the upload → analyze → success flow
  const startUpload = () => {
    setUploadState('uploading')
    setUploadProgress(0)
    const tick = setInterval(() => {
      setUploadProgress((p) => {
        if (p >= 100) {
          clearInterval(tick)
          setUploadState('analyzing')
          setTimeout(() => setUploadState('success'), 2000)
          return 100
        }
        return Math.min(100, p + 18)
      })
    }, 300)
  }

  if (section === 'colors') {
    return (
      <div>
        <div className="px-5 pb-2">
          <button
            type="button"
            onClick={() => setSection('wardrobe')}
            className="text-xs font-semibold"
            style={{ color: 'var(--sky)' }}
          >
            ← Back to wardrobe
          </button>
        </div>
        <ColorsTab />
      </div>
    )
  }

  return (
    <div className="px-5 pt-2 pb-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>Eliora's wardrobe</h2>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {ITEMS.length} items · {ITEMS.filter((i) => i.worn < 5).length} rarely worn
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSection('colors')}
            className="h-8 rounded-full px-3 flex items-center justify-center gap-1.5 text-xs font-semibold"
            style={{ background: 'var(--muted)', color: 'var(--sky)', border: '1px solid var(--border)' }}
          >
            <span aria-hidden="true">🎨</span>
            Colors
          </button>
          <button
            onClick={() => { setAddStep('photo'); setUploadState('empty') }}
            aria-label="Add wardrobe item"
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg"
            style={{ background: 'var(--magenta)', color: '#fff' }}
          >
            +
          </button>
        </div>
      </div>

      {/* Add item — photo flow */}
      {addStep === 'photo' && (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>Add new item</p>
            <button onClick={() => setAddStep('closed')} className="text-xs" style={{ color: 'var(--muted-foreground)' }}>✕</button>
          </div>

          <ImageUploadWidget
            state={uploadState}
            progress={uploadProgress}
            result={
              uploadState === 'success'
                ? { name: 'Deep Teal', hex: '#007A8A', category: 'Outerwear · Cool-neutral' }
                : undefined
            }
            onRetake={() => {
              if (uploadState === 'empty' || uploadState === 'error') {
                startUpload()
              } else {
                setUploadState('empty')
              }
            }}
            onManual={() => setAddStep('manual')}
            onSave={() => setAddStep('closed')}
            onCorrect={() => {}}
          />

          {uploadState === 'empty' && (
            <button
              onClick={() => setAddStep('manual')}
              className="w-full py-2 rounded-xl text-xs"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Enter details manually instead
            </button>
          )}
        </div>
      )}

      {/* Add item — manual form */}
      {addStep === 'manual' && (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>Add manually</p>
            <button onClick={() => setAddStep('closed')} className="text-xs" style={{ color: 'var(--muted-foreground)' }}>✕</button>
          </div>
          {['Name', 'Category', 'Color'].map((field) => (
            <div key={field}>
              <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ color: 'var(--muted-foreground)' }}>
                {field}
              </label>
              <input
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                placeholder={field === 'Color' ? 'e.g. Dusty rose' : ''}
              />
            </div>
          ))}
          <button
            onClick={() => setAddStep('closed')}
            className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--magenta)', color: '#fff' }}
          >
            Save item
          </button>
        </div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or color…"
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
        style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
      />

      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: cat === c ? 'var(--magenta)' : 'var(--muted)',
              color: cat === c ? '#fff' : 'var(--muted-foreground)',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="h-20 relative flex items-center justify-center" style={{ background: item.color }}>
              <span className="text-2xl drop-shadow-sm select-none" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
                {CATEGORY_EMOJI[item.category] ?? '👗'}
              </span>
              <button
                onClick={() => toggleFav(item.id)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                style={{ background: 'rgba(0,0,0,0.3)' }}
              >
                {favorites.has(item.id) ? '♥' : '♡'}
              </button>
            </div>
            <div className="p-2">
              <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--foreground)' }}>
                {item.name}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                Worn {item.worn}×
              </p>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10">
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No items match your search.</p>
        </div>
      )}
    </div>
  )
}
