# tAIlor

AI-powered wardrobe assistant built with React + Vite + Tailwind CSS.

## Development

```bash
pnpm install   # or npm install
pnpm dev       # or npm run dev — starts Vite on http://localhost:5173
pnpm build     # production build into dist/
pnpm preview   # serve the production build locally
```

## Project Structure

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/tabs/` - Top-level screens (Home, Wardrobe, Generator, Try-On, Colors, Laundry, Profile, AI Components)
- `src/components/` - Shared components (login screen, AI UI components)
- `src/context/AppContext.tsx` - Global app state
- `src/types/` - Shared TypeScript types
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell (title, meta tags, `#root`, loads `src/main.tsx`)
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and the `@` alias for `src`
- `.mise.toml` - Optional toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. No Tailwind config file or PostCSS config is needed.

Global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.
