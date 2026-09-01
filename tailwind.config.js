/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-magenta': '#C20050',
        'brand-rose': '#DE838E',
        'brand-mustard': '#F5C642',
        'brand-orange': '#D9481E',
        'brand-skyblue': '#69CFE6',
        'brand-teal': '#00707B',
        'brand-green': '#46AE69',
        'brand-mint': '#7AD798',
      },
    },
  },
  plugins: [],
}
