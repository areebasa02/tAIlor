# tAIlor

AI-powered wardrobe assistant built with React, Vite, TypeScript, and Tailwind CSS.

## Getting started

```bash
pnpm install   # or npm install
pnpm dev       # or npm run dev — starts Vite on http://localhost:5173
pnpm build     # production build into dist/
pnpm preview   # serve the production build locally
```

Requires Node.js 22 (see `.node-version`).

## Project structure

- `src/main.tsx` — React entrypoint; imports `src/index.css` and mounts `src/App.tsx`
- `src/App.tsx` — Primary application component
- `src/tabs/` — Top-level screens (Home, Wardrobe, Generator, Try-On, Colors, Laundry, Profile, AI Components)
- `src/components/` — Shared components (login screen, AI UI components)
- `src/context/AppContext.tsx` — Global app state
- `src/types/` — Shared TypeScript types
- `src/index.css` — Global CSS and Tailwind CSS v4 import
- `index.html` — Vite HTML shell
- `vite.config.ts` — Vite config (React, Tailwind CSS v4, `@` → `src` alias)

## Stack

- React 19 + React DOM 19
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Vite 8, TypeScript 5.7, `@vitejs/plugin-react`
- Package manager: **pnpm** (lockfile included; npm also works)

## Deployment

Deployed as a **Render Static Site**.

| Setting | Value |
| --- | --- |
| Build command | `pnpm install && pnpm build` |
| Publish directory | `dist` |

You can also use `npm install && npm run build` if you prefer npm.

A minimal Blueprint is provided in [`render.yaml`](./render.yaml) so Render can pick up the same static-site settings from the repo.

## Contributing

1. Create a branch from `main`.
2. Make your changes.
3. Open a pull request against `main`.

Please keep changes focused and match existing project patterns (see `AGENTS.md` for structure and styling notes).
