import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Shirt, MessageCircle, WashingMachine, Home, Menu, X, Moon, Sun, Palette } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Wardrobe from './pages/Wardrobe';
import Stylist from './pages/Stylist';
import Laundry from './pages/Laundry';
import { useTheme } from './context/ThemeContext';
import SettingsModal from './components/SettingsModal';

function Navigation() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { isDarkMode, toggleDarkMode } = useTheme();

  const navItems = [
    { path: '/', name: 'Generator', icon: <Home className="w-6 h-6" /> },
    { path: '/wardrobe', name: 'Wardrobe', icon: <Shirt className="w-6 h-6" /> },
    { path: '/stylist', name: 'AI Stylist', icon: <MessageCircle className="w-6 h-6" /> },
    { path: '/laundry', name: 'Laundry', icon: <WashingMachine className="w-6 h-6" /> },
  ];

  return (
    <>
      {/* Mobile Header */}
      <header className="md:hidden bg-surface text-content p-4 flex justify-between items-center sticky top-0 z-20 border-b border-border">
        <h1 className="text-xl font-bold tracking-wider text-brand-teal">tAIlor</h1>
        <div className="flex items-center gap-2">
          <button onClick={toggleDarkMode} className="p-2 focus:outline-none focus:ring-2 focus:ring-brand-teal rounded-md" aria-label="Toggle dark mode">
            {isDarkMode ? <Sun className="w-5 h-5 text-brand-mustard" /> : <Moon className="w-5 h-5 text-content-muted" />}
          </button>
          <button 
            onClick={() => setIsOpen(!isOpen)} 
            aria-label="Toggle navigation menu"
            aria-expanded={isOpen}
            className="p-2 focus:outline-none focus:ring-2 focus:ring-brand-teal rounded-md"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Navigation Menu */}
      <nav 
        className={`${isOpen ? 'block' : 'hidden'} md:flex flex-col fixed md:sticky top-[69px] md:top-0 left-0 h-[calc(100vh-69px)] md:h-screen w-full md:w-64 bg-surface md:bg-surface border-r border-border z-10`}
        aria-label="Main Navigation"
      >
        <div className="hidden md:block p-6">
          <h1 className="text-3xl font-bold text-brand-teal tracking-wider">tAIlor</h1>
          <p className="text-sm text-content-muted mt-1 font-medium">Your Accessible AI Stylist</p>
        </div>
        
        <ul className="p-4 space-y-2 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-4 p-4 rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-teal ${
                    isActive 
                      ? 'bg-brand-teal text-white shadow-md' 
                      : 'text-content-muted hover:bg-surface-raised'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.icon}
                  <span className="font-semibold text-lg">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        
        {/* Bottom Actions */}
        <div className="p-4 border-t border-border flex gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 p-3 text-content-muted hover:bg-surface-raised rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-brand-teal font-semibold"
            aria-label="Open Theme Settings"
          >
            <Palette className="w-5 h-5" />
            <span className="hidden md:inline">Theme</span>
          </button>
          <button
            onClick={toggleDarkMode}
            className="flex-1 flex items-center justify-center gap-2 p-3 text-content-muted hover:bg-surface-raised rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-brand-teal font-semibold"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-brand-mustard" /> : <Moon className="w-5 h-5" />}
            <span className="hidden md:inline">{isDarkMode ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </nav>
      
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </>
  );
}

function App() {
  return (
    <Router>
      <div className="flex flex-col md:flex-row min-h-screen bg-surface-muted">
        <Navigation />
        <main className="flex-1 overflow-x-hidden p-4 md:p-8 w-full max-w-7xl mx-auto" id="main-content">
          {/* Skip to main content link for accessibility */}
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-brand-teal text-white p-2 rounded z-50">
            Skip to main content
          </a>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/wardrobe" element={<Wardrobe />} />
            <Route path="/stylist" element={<Stylist />} />
            <Route path="/laundry" element={<Laundry />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
