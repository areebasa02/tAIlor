import { WashingMachine, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

const laundryItems = [
  { id: 1, name: 'Mustard Knit Sweater', status: 'needs-wash', care: 'Cold wash, lay flat to dry. High shrinkage risk.', lastWorn: '2 days ago' },
  { id: 2, name: 'Charcoal Elastic Joggers', status: 'clean', care: 'Machine wash warm, tumble dry low.', lastWorn: '5 days ago' },
  { id: 3, name: 'Rose Silk Scarf', status: 'washing', care: 'Hand wash only or dry clean.', lastWorn: 'Yesterday' },
];

export default function Laundry() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl md:text-4xl font-bold text-content">Laundry Care</h2>
        <p className="text-lg text-content-muted">Optimized routines to save your favorite pieces.</p>
      </header>

      {/* AI Recommendation */}
      <section 
        className="bg-brand-skyblue/10 border-2 border-brand-skyblue/30 p-6 rounded-2xl flex gap-4 items-start"
        aria-label="AI Laundry Recommendation"
      >
        <WashingMachine className="w-8 h-8 text-brand-teal flex-shrink-0 mt-1" />
        <div>
          <h3 className="text-xl font-bold text-content mb-2">Ready for a load?</h3>
          <p className="text-content leading-relaxed">
            You have 4 items that can be washed together in a <strong>Cold, Delicate cycle</strong>. 
            Remember to remove the Mustard Knit Sweater before tumble drying!
          </p>
          <button className="mt-4 px-6 py-2 bg-brand-teal text-white font-bold rounded-lg hover:bg-brand-teal/90 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-teal">
            Start AI Routine
          </button>
        </div>
      </section>

      {/* Status Columns */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Needs Wash */}
        <div className="bg-surface-raised rounded-2xl p-6">
          <h3 className="font-bold text-lg text-content flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-brand-orange" />
            Needs Wash (1)
          </h3>
          <div className="space-y-4">
            {laundryItems.filter(item => item.status === 'needs-wash').map(item => (
              <div key={item.id} className="bg-surface p-4 rounded-xl shadow-sm border border-border">
                <h4 className="font-bold text-content">{item.name}</h4>
                <p className="text-sm text-content-muted mb-2">Worn {item.lastWorn}</p>
                <div className="bg-surface-muted p-3 rounded-lg text-sm text-content border border-border">
                  {item.care}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-surface-raised rounded-2xl p-6">
          <h3 className="font-bold text-lg text-content flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-brand-skyblue" />
            In Progress (1)
          </h3>
          <div className="space-y-4">
            {laundryItems.filter(item => item.status === 'washing').map(item => (
              <div key={item.id} className="bg-surface p-4 rounded-xl shadow-sm border border-border">
                <h4 className="font-bold text-content">{item.name}</h4>
                <div className="mt-3 flex gap-2">
                  <span className="bg-brand-skyblue/20 text-brand-teal text-xs font-bold px-2 py-1 rounded">Hand Wash</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Clean */}
        <div className="bg-surface-raised rounded-2xl p-6">
          <h3 className="font-bold text-lg text-content flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-brand-green" />
            Clean
          </h3>
          <div className="space-y-4">
            {laundryItems.filter(item => item.status === 'clean').map(item => (
              <div key={item.id} className="bg-surface p-4 rounded-xl shadow-sm border border-border opacity-60">
                <h4 className="font-bold text-content">{item.name}</h4>
                <p className="text-sm text-content-muted">Ready to wear</p>
              </div>
            ))}
          </div>
        </div>

      </section>
    </div>
  );
}
