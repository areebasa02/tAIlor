/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-magenta': 'var(--brand-magenta)',
        'brand-rose': 'var(--brand-rose)',
        'brand-mustard': 'var(--brand-mustard)',
        'brand-orange': 'var(--brand-orange)',
        'brand-skyblue': 'var(--brand-skyblue)',
        'brand-teal': 'var(--brand-teal)',
        'brand-green': 'var(--brand-green)',
        'brand-mint': 'var(--brand-mint)',
        'surface': {
          DEFAULT: 'var(--surface)',
          muted: 'var(--surface-muted)',
          raised: 'var(--surface-raised)',
        },
        'content': {
          DEFAULT: 'var(--content)',
          muted: 'var(--content-muted)',
        },
        'border': 'var(--border-color)',
      },
    },
  },
  plugins: [],
}
