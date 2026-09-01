import { useState } from 'react';
import { CloudRain, Thermometer, RefreshCw, ThumbsUp, ThumbsDown, Info } from 'lucide-react';

export default function Dashboard() {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 1500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col gap-2">
        <h2 className="text-3xl md:text-4xl font-bold text-content">Today's Outfit</h2>
        <p className="text-lg text-content-muted">Context-aware styling based on your needs.</p>
      </header>

      {/* Context Bar */}
      <section 
        className="bg-surface p-6 rounded-2xl shadow-sm border border-border"
        aria-label="Current Context"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-content">Current Context</h3>
          <button className="text-brand-teal hover:text-brand-teal/80 p-2 rounded-full hover:bg-brand-teal/10 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-teal" aria-label="Edit Context">
            Edit
          </button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col items-center p-4 bg-surface-muted rounded-xl">
            <Thermometer className="w-8 h-8 text-brand-orange mb-2" aria-hidden="true" />
            <span className="font-semibold">68°F</span>
            <span className="text-sm text-content-muted">Chilly</span>
          </div>
          <div className="flex flex-col items-center p-4 bg-surface-muted rounded-xl">
            <CloudRain className="w-8 h-8 text-brand-skyblue mb-2" aria-hidden="true" />
            <span className="font-semibold">40%</span>
            <span className="text-sm text-content-muted">Rain Chance</span>
          </div>
          <div className="flex flex-col items-center p-4 bg-surface-muted rounded-xl">
            <div className="w-8 h-8 rounded-full bg-brand-mustard flex items-center justify-center mb-2 shadow-sm text-white font-bold" aria-hidden="true">
              V
            </div>
            <span className="font-semibold">Casual</span>
            <span className="text-sm text-content-muted">Vibe</span>
          </div>
          <div className="flex flex-col items-center p-4 bg-surface-muted rounded-xl">
            <div className="w-8 h-8 bg-brand-magenta rounded-full mb-2" aria-label="Magenta color preference"></div>
            <span className="font-semibold">Magenta</span>
            <span className="text-sm text-content-muted">Color Palette</span>
          </div>
        </div>
      </section>

      {/* Main Generator Area */}
      <section aria-label="Outfit Suggestion">
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Virtual Mannequin / Outfit Display */}
          <div className="flex-1 bg-surface p-6 rounded-2xl shadow-sm border border-border flex flex-col items-center justify-center min-h-[400px] relative">
            {isGenerating ? (
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="w-12 h-12 text-brand-teal animate-spin" />
                <p className="text-lg font-medium text-content-muted">Curating your accessible outfit...</p>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center">
                {/* Outfit Visualizer Placeholder */}
                <div className="w-full max-w-sm flex flex-col gap-4">
                  {/* Top */}
                  <div className="bg-brand-mustard/20 border-2 border-brand-mustard p-6 rounded-xl flex items-center gap-4">
                    <div className="bg-brand-mustard w-16 h-16 rounded-lg flex-shrink-0" aria-hidden="true"></div>
                    <div>
                      <h4 className="font-bold text-lg">Mustard Knit Sweater</h4>
                      <p className="text-content-muted text-sm">Soft cotton, tagless, sensory-friendly.</p>
                    </div>
                  </div>
                  {/* Bottom */}
                  <div className="bg-slate-800/10 border-2 border-slate-800 p-6 rounded-xl flex items-center gap-4">
                    <div className="bg-slate-800 w-16 h-16 rounded-lg flex-shrink-0" aria-hidden="true"></div>
                    <div>
                      <h4 className="font-bold text-lg">Charcoal Elastic Joggers</h4>
                      <p className="text-content-muted text-sm">Stretchy waist, easy to put on, deep pockets.</p>
                    </div>
                  </div>
                  {/* Shoes */}
                  <div className="bg-brand-magenta/20 border-2 border-brand-magenta p-4 rounded-xl flex items-center gap-4">
                    <div className="bg-brand-magenta w-12 h-12 rounded-lg flex-shrink-0" aria-hidden="true"></div>
                    <div>
                      <h4 className="font-bold">Magenta Slip-on Sneakers</h4>
                      <p className="text-content-muted text-sm">No laces required.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="w-full md:w-80 flex flex-col gap-4">
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-4 px-6 bg-brand-teal hover:bg-brand-teal/90 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-brand-teal/50 disabled:opacity-50"
              aria-live="polite"
            >
              <RefreshCw className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Generating...' : 'Generate New Outfit'}
            </button>
            
            <div className="grid grid-cols-2 gap-4">
              <button 
                className="py-4 bg-brand-green/10 text-brand-green hover:bg-brand-green/20 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-brand-green"
                aria-label="Approve this outfit"
              >
                <ThumbsUp className="w-5 h-5" />
                Approve
              </button>
              <button 
                className="py-4 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-brand-orange"
                aria-label="Reject this outfit"
              >
                <ThumbsDown className="w-5 h-5" />
                Reject
              </button>
            </div>

            <div className="bg-surface-raised p-4 rounded-xl mt-auto">
              <h4 className="font-bold text-content flex items-center gap-2 mb-2">
                <Info className="w-4 h-4 text-brand-teal" />
                AI Reasoning
              </h4>
              <p className="text-sm text-content-muted leading-relaxed">
                Chosen for the chilly weather and chance of rain. The mustard sweater offers a bright pop that contrasts nicely with the magenta shoes (color theory adherence). All items match your sensory preference for soft, stretchy materials without tags or complex fasteners.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
