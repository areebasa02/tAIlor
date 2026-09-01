import { Search, Plus, Filter, Tag } from 'lucide-react';

const wardrobeItems = [
  { id: 1, name: 'Mustard Knit Sweater', category: 'Tops', color: '#F5C642', material: 'Soft Cotton', tags: ['Tagless', 'Winter', 'Sensory-Friendly'] },
  { id: 2, name: 'Charcoal Elastic Joggers', category: 'Bottoms', color: '#334155', material: 'Polyester Blend', tags: ['Stretchy', 'Easy-On', 'Deep Pockets'] },
  { id: 3, name: 'Magenta Slip-on Sneakers', category: 'Shoes', color: '#C20050', material: 'Canvas', tags: ['No-Laces', 'Comfort'] },
  { id: 4, name: 'Sky Blue Rain Jacket', category: 'Outerwear', color: '#69CFE6', material: 'Nylon', tags: ['Waterproof', 'Lightweight', 'Zipper'] },
  { id: 5, name: 'Rose Silk Scarf', category: 'Accessories', color: '#DE838E', material: 'Silk', tags: ['Sensory-Friendly', 'Formal'] },
];

export default function Wardrobe() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-content">Digital Wardrobe</h2>
          <p className="text-lg text-content-muted">Manage your logged items and custom tags.</p>
        </div>
        <button 
          className="bg-brand-teal text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-teal/90 transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-brand-teal/50 shadow-md"
          aria-label="Add new clothing item"
        >
          <Plus className="w-5 h-5" />
          Add Item
        </button>
      </header>

      {/* Toolbar */}
      <section className="flex flex-col md:flex-row gap-4 bg-surface p-4 rounded-xl shadow-sm border border-border" aria-label="Wardrobe tools">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-muted w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search items, colors, or tags..." 
            className="w-full pl-10 pr-4 py-3 bg-surface-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal transition-all"
            aria-label="Search wardrobe"
          />
        </div>
        <button 
          className="flex items-center gap-2 px-6 py-3 bg-surface-raised hover:bg-slate-200 text-content font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
          aria-label="Filter wardrobe"
        >
          <Filter className="w-5 h-5" />
          Filter
        </button>
      </section>

      {/* Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="Wardrobe items list">
        {wardrobeItems.map(item => (
          <article key={item.id} className="bg-surface rounded-2xl p-5 shadow-sm border border-border hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-brand-teal">
            <div className="flex justify-between items-start mb-4">
              <div 
                className="w-16 h-16 rounded-xl shadow-inner" 
                style={{ backgroundColor: item.color }}
                aria-label={`Color swatch for ${item.name}`}
              ></div>
              <span className="text-xs font-bold uppercase tracking-wider text-content-muted bg-surface-raised px-2 py-1 rounded-md">
                {item.category}
              </span>
            </div>
            
            <h3 className="font-bold text-xl text-content mb-1">
              {/* Anchor for focus-within */}
              <a href="#" className="focus:outline-none">
                {item.name}
              </a>
            </h3>
            <p className="text-content-muted mb-4">{item.material}</p>
            
            <div className="flex flex-wrap gap-2">
              {item.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 bg-surface-muted border border-border text-content-muted text-xs px-2 py-1 rounded-full">
                  <Tag className="w-3 h-3" />
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
