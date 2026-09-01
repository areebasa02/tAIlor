import { X, RotateCcw } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useEffect, useRef } from 'react';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { brandColors, updateBrandColor, resetColors } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const colorLabels: Record<keyof typeof brandColors, string> = {
    '--brand-teal': 'Primary (Teal)',
    '--brand-magenta': 'Secondary (Magenta)',
    '--brand-mustard': 'Accent (Mustard)',
    '--brand-orange': 'Warning (Orange)',
    '--brand-skyblue': 'Info (Sky Blue)',
    '--brand-green': 'Success (Green)',
    '--brand-mint': 'Light Success (Mint)',
    '--brand-rose': 'Light Accent (Rose)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        ref={modalRef}
        className="bg-surface w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="flex items-center justify-between p-4 border-b border-border">
          <h2 id="modal-title" className="text-xl font-bold text-content">Theme Customization</h2>
          <button 
            onClick={onClose}
            className="p-2 text-content-muted hover:bg-surface-raised rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-teal"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-semibold text-content-muted uppercase tracking-wider">Brand Colors</h3>
            <button 
              onClick={resetColors}
              className="flex items-center gap-1 text-sm text-brand-teal hover:text-brand-teal/80 focus:outline-none focus:underline"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {(Object.entries(brandColors) as [keyof typeof brandColors, string][]).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-2">
                <label htmlFor={key} className="text-sm font-medium text-content">
                  {colorLabels[key] || key}
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    id={key}
                    value={value}
                    onChange={(e) => updateBrandColor(key, e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border-0 p-0 bg-transparent"
                  />
                  <span className="text-xs text-content-muted font-mono">{value.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
