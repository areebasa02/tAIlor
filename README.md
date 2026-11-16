# tAIlor

AI-powered wardrobe assistant built with React, Vite, TypeScript, and Tailwind CSS.

## Getting started

```bash
pnpm install   # or npm install
pnpm dev       # or npm run dev — starts Vite and the AI backend
pnpm build     # production build into dist/
pnpm preview   # serve the production build locally
```

Requires Node.js 22 (see `.node-version`).

## AI stylist + wardrobe photo scanner

The app talks to a local Node server (`server/server.mjs`) which proxies to an
OpenAI-compatible model server (local GPU or Google Colab via cloudflared).

| Endpoint | Purpose |
| --- | --- |
| `POST /api/stylist` | Outfit recommendations (text) |
| `POST /api/wardrobe/scan` | Photo → wardrobe JSON (Qwen2.5-VL or mock) |
| `GET /api/wardrobe/scan/health` | Scanner mock/live status |

Copy `.env.example` to `.env`.

### Mock mode (no GPU) — default for Try Live

With `WARDROBE_SCAN_MOCK=true` (or `LLM_BASE_URL` pointing at localhost),
Wardrobe → **Add Item** → **AI Photo Wardrobe Scanner** uses deterministic demo
JSON. Quick-test samples (teal trench / magenta blouse / gold cardigan) and
photo uploads both work without Colab.

### Live Qwen2.5-VL (Colab)

1. Open [`tailorbackend.ipynb`](./tailorbackend.ipynb) in
   [Google Colab](https://colab.research.google.com/) (or upload it).
2. **Runtime → Change runtime type → T4 GPU**.
3. Run the notebook cells in order. They install deps, start `colab_server.py`
   with `Qwen/Qwen2.5-VL-3B-Instruct`, and print a cloudflared URL.
4. Qwen weights download **anonymously** — no Hugging Face token required.
5. Set local `.env`:

   ```text
   LLM_BASE_URL=https://your-random-name.trycloudflare.com/v1
   LLM_MODEL=Qwen/Qwen2.5-VL-3B-Instruct
   WARDROBE_SCAN_MOCK=false
   ```

6. Restart with `pnpm dev`. Wardrobe photo uploads call Colab
   `POST /v1/wardrobe/scan`. If the tunnel drops, the Node proxy falls back to
   demo JSON so the UI stays usable.

### Colab server contract

`colab_server.py` exposes:

- `GET /health` → `{ status, model, vision, endpoints }`
- `POST /v1/chat/completions` → OpenAI-compatible chat (text or VL)
- `POST /v1/wardrobe/scan` → `{ image: base64, mimeType? }` →

  ```json
  {
    "item": {
      "name": "Teal Gabardine Trench",
      "category": "Outerwear",
      "color": "#007880",
      "colorName": "Deep Teal",
      "material": "Gabardine cotton blend",
      "careInstructions": "Dry clean or gentle cold wash",
      "storageLocation": "Closet · Main Rack",
      "sentimentalValue": "Medium",
      "cost": "$89",
      "confidence": 0.94
    },
    "model": "Qwen/Qwen2.5-VL-3B-Instruct",
    "source": "qwen-vl"
  }
  ```

`category` is one of `Tops | Bottoms | Shoes | Outerwear | Accessories`
(aligned with `WardrobeItem` in `src/types/index.ts`).

### Local GPU (optional)

```bash
pip install "torch" "transformers>=4.49.0" accelerate fastapi uvicorn pillow
export LLM_MODEL=Qwen/Qwen2.5-VL-3B-Instruct
export WARDROBE_SCAN_MOCK=false
python colab_server.py
```

Then point `.env` at `LLM_BASE_URL=http://127.0.0.1:8000/v1` and
`WARDROBE_SCAN_MOCK=false`.

Set `STYLIST_DEBUG=true` while diagnosing Stylist responses.
`.env` is ignored by git. `pnpm dev` starts the frontend and Node backend
automatically.

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

## Cat-VTON virtual try-on

The virtual try-on endpoint uses fal's `fal-ai/image-apps-v2/virtual-try-on`
model. Set these server
environment variables in the git-ignored `.env` file before starting the Node
server:

- `FAL_KEY` — fal API key
- `FAL_MANNEQUIN_IMAGE_URL` — publicly reachable neutral mannequin image URL

Garment photos uploaded through the wardrobe scanner are stored with the
wardrobe record in browser storage and are sent to the server only when a
try-on is requested. The server runs Cat-VTON once for the saved top or
outerwear item, then uses that returned image as the mannequin input for a
second run with the saved bottoms.

## Contributing

1. Create a branch from `main`.
2. Make your changes.
3. Open a pull request against `main`.

Please keep changes focused and match existing project patterns (see `AGENTS.md` for structure and styling notes).
