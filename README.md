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

## AI stylist backend

The Stylist page sends requests to the local `/api/stylist` endpoint. The Node
backend forwards prompts to an OpenAI-compatible model server running locally or
in Google Colab. Hugging Face is used only to download the gated model weights;
inference does not use a Hugging Face Inference Provider.

Copy `.env.example` to `.env`. For a local GPU server, use vLLM:

```bash
pip install vllm
vllm serve Qwen/Qwen2.5-3B-Instruct --host 127.0.0.1 --port 8000
```

For Google Colab, run this first:

```python
!pip install -q torch transformers fastapi uvicorn
```

### Detailed Google Colab setup

Colab runs the model on a temporary cloud GPU. Your computer runs the React
frontend and Node backend, and the tunnel connects the Node backend to Colab.
Keep the Colab tab and its server cell running while using the Stylist.

1. Open [Google Colab](https://colab.research.google.com/) and create a new
   notebook.
2. Select **Runtime → Change runtime type → T4 GPU** (or another GPU), then
   click **Save**.
3. Run this cell to confirm that Colab assigned a GPU:

   ```python
   !nvidia-smi
   ```

4. Run this install cell:

   ```python
   !pip install -q torch transformers fastapi uvicorn
   ```

5. Upload `colab_server.py` from this repository using the folder icon on the
   left side of Colab, or run this cell after replacing the URL with your raw
   GitHub file URL:

   ```python
   !wget -q https://raw.githubusercontent.com/areebasa02/tAIlor/main/colab_server.py
   ```

6. Set the model name and start the server in the background:

   ```python
   import os
   os.environ["LLM_MODEL"] = "Qwen/Qwen2.5-3B-Instruct"
   !nohup python colab_server.py > /content/stylist-server.log 2>&1 &
   ```

7. Wait for the model to finish loading, then check it:

   ```python
   import time, requests
   for _ in range(60):
       try:
           print(requests.get("http://127.0.0.1:8000/health", timeout=2).json())
           break
       except Exception:
           time.sleep(5)
   ```

   Do not continue until the response contains `"status": "ok"`.

8. Create a temporary public tunnel. Run this cell:

   ```python
   !wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /content/cloudflared
   !chmod +x /content/cloudflared
   !nohup /content/cloudflared tunnel --url http://127.0.0.1:8000 --no-autoupdate > /content/cloudflared.log 2>&1 &
   ```

9. Run this cell to print the tunnel URL:

   ```python
   import re, time
   for _ in range(30):
       log = open("/content/cloudflared.log", encoding="utf-8").read()
       match = re.search(r"https://[-a-z0-9]+\.trycloudflare\.com", log)
       if match:
           print(match.group(0))
           break
       time.sleep(2)
   ```

10. Copy the printed URL and set `LLM_BASE_URL` in your local `.env` to that
    URL plus `/v1`, for example:

    ```text
    LLM_BASE_URL=https://your-random-name.trycloudflare.com/v1
    LLM_MODEL=Qwen/Qwen2.5-3B-Instruct
    ```

11. Restart the local backend with `pnpm dev`. The Node backend will now send
    Stylist requests through the tunnel to the Colab GPU.

If the Stylist stops responding, first check the Colab health cell, then make
sure both the server and tunnel cells are still running. Colab sessions can
disconnect or be reclaimed when idle; repeat steps 6–10 after reconnecting.

Set `STYLIST_DEBUG=true` while diagnosing Stylist responses. The backend logs a request
ID, model response summary, parse/fallback status, and the final card items to the
backend terminal; set it to `false` to disable those logs.
Set `HF_TOKEN` in Colab for gated model access; it is not sent to the browser.
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

## Contributing

1. Create a branch from `main`.
2. Make your changes.
3. Open a pull request against `main`.

Please keep changes focused and match existing project patterns (see `AGENTS.md` for structure and styling notes).
