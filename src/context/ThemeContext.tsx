import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

type BrandColors = {
  '--brand-magenta': string;
  '--brand-rose': string;
  '--brand-mustard': string;
  '--brand-orange': string;
  '--brand-skyblue': string;
  '--brand-teal': string;
  '--brand-green': string;
  '--brand-mint': string;
};

const defaultColors: BrandColors = {
  '--brand-magenta': '#C20050',
  '--brand-rose': '#DE838E',
  '--brand-mustard': '#F5C642',
  '--brand-orange': '#D9481E',
  '--brand-skyblue': '#69CFE6',
  '--brand-teal': '#00707B',
  '--brand-green': '#46AE69',
  '--brand-mint': '#7AD798',
};

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  brandColors: BrandColors;
  updateBrandColor: (key: keyof BrandColors, color: string) => void;
  resetColors: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [brandColors, setBrandColors] = useState<BrandColors>(() => {
    const saved = localStorage.getItem('brandColors');
    return saved ? JSON.parse(saved) : defaultColors;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const root = window.document.documentElement;
    (Object.keys(brandColors) as Array<keyof BrandColors>).forEach(key => {
      root.style.setProperty(key, brandColors[key]);
    });
    localStorage.setItem('brandColors', JSON.stringify(brandColors));
  }, [brandColors]);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);
  
  const updateBrandColor = (key: keyof BrandColors, color: string) => {
    setBrandColors(prev => ({ ...prev, [key]: color }));
  };

  const resetColors = () => setBrandColors(defaultColors);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode, brandColors, updateBrandColor, resetColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
