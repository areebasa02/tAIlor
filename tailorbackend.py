# -*- coding: utf-8 -*-
"""tAIlor Colab helper — dual-model Qwen backend.

Paste cells from tailorbackend.ipynb in Colab, or run the equivalent steps
below after uploading colab_server.py.

No Hugging Face token is required for Qwen/Qwen2.5-VL-3B-Instruct.
"""

# ### Step 1: Confirm GPU allocation
# !nvidia-smi

# ### Step 2: Install dependencies
# !pip install -q "torch" "transformers>=4.49.0" "accelerate" "bitsandbytes" "fastapi" "uvicorn" "pillow"

# ### Step 3: Start the VL server
import os

os.environ["LLM_TEXT_MODEL"] = "Qwen/Qwen2.5-3B-Instruct"
os.environ["LLM_VISION_MODEL"] = "Qwen/Qwen2.5-VL-3B-Instruct"
os.environ["LLM_QUANTIZE"] = "true"
# !nohup python -u colab_server.py > /content/stylist-server.log 2>&1 &

# ### Step 4: Monitor server health until status is "ok"
# import time, requests
# for _ in range(90):
#     try:
#         print(requests.get("http://127.0.0.1:8000/health", timeout=2).json())
#         break
#     except Exception:
#         time.sleep(5)

# ### Step 5: Start the Cloudflare Tunnel
# !wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /content/cloudflared
# !chmod +x /content/cloudflared
# !nohup /content/cloudflared tunnel --url http://127.0.0.1:8000 --no-autoupdate > /content/cloudflared.log 2>&1 &

# ### Step 6: Print the public tunnel URL
# import re, time
# for _ in range(30):
#     log = open("/content/cloudflared.log", encoding="utf-8").read()
#     match = re.search(r"https://[-a-z0-9]+\.trycloudflare\.com", log)
#     if match:
#         print(match.group(0))
#         print(f"LLM_BASE_URL={match.group(0)}/v1")
#         print("WARDROBE_SCAN_MOCK=false")
#         break
#     time.sleep(2)

print(
    "Use tailorbackend.ipynb in Colab for the interactive flow. "
    "This file documents the same steps for reference."
)
