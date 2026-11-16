"""OpenAI-compatible Qwen server for local GPU or Google Colab.

Supports:
  - Text chat: POST /v1/chat/completions (stylist + general)
  - Wardrobe photo scan: POST /v1/wardrobe/scan (Qwen2.5-VL → wardrobe JSON)

Default model is Qwen2.5-VL-3B-Instruct (vision). Override with LLM_MODEL.
Qwen weights download anonymously; HF_TOKEN is optional and only used if set.

In Colab: install deps, run this file, tunnel port 8000, set LLM_BASE_URL in
tAIlor to the tunnel URL ending in /v1.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
from pathlib import Path
from typing import Any

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image


def load_local_env() -> None:
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = value.strip().strip("\"'")


load_local_env()

MODEL_ID = os.environ.get("LLM_MODEL", "Qwen/Qwen2.5-VL-3B-Instruct")
# Optional — Qwen2.5-VL downloads anonymously; only set if your mirror requires it.
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HF_API_KEY") or None
IS_VL = "VL" in MODEL_ID.upper() or "vision" in MODEL_ID.lower()

WARDROBE_CATEGORIES = ("Tops", "Bottoms", "Shoes", "Outerwear", "Accessories")
WARDROBE_SCAN_PROMPT = """Analyze this clothing item photo for a digital wardrobe app.
Return ONLY a single JSON object (no markdown fences, no extra text) with these keys:
- name: short garment name (string)
- category: one of Tops, Bottoms, Shoes, Outerwear, Accessories
- color: dominant hue as #RRGGBB hex
- colorName: human color label (string)
- material: fabric / texture guess (string)
- careInstructions: brief care tip (string)
- storageLocation: suggested storage (string)
- sentimentalValue: one of Low, Medium, High
- cost: rough retail estimate like "$45" (string)
- confidence: 0-1 float for overall detection confidence
"""

app = FastAPI(title="tAIlor Colab LLM", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

tokenizer = None
processor = None
model = None
model_device = "cpu"


def _hf_kwargs() -> dict[str, Any]:
    return {"token": HF_TOKEN} if HF_TOKEN else {}


def load_model() -> None:
    global tokenizer, processor, model, model_device
    print(f"Loading model {MODEL_ID} (vl={IS_VL})…")
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    common = {
        "torch_dtype": dtype,
        "device_map": "auto",
        **_hf_kwargs(),
    }
    if IS_VL:
        from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

        processor = AutoProcessor.from_pretrained(MODEL_ID, **_hf_kwargs())
        model = Qwen2_5_VLForConditionalGeneration.from_pretrained(MODEL_ID, **common)
    else:
        from transformers import AutoModelForCausalLM, AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, **_hf_kwargs())
        model = AutoModelForCausalLM.from_pretrained(MODEL_ID, **common)
    model_device = str(getattr(model, "device", "cuda" if torch.cuda.is_available() else "cpu"))
    print(f"Model ready on {model_device}")


load_model()


class Message(BaseModel):
    role: str
    content: Any


class CompletionRequest(BaseModel):
    model: str
    messages: list[Message]
    max_tokens: int = 300
    temperature: float = 0.7


class WardrobeScanRequest(BaseModel):
    image: str = Field(..., description="Base64-encoded image (raw or data-URL)")
    mime_type: str | None = Field(default="image/jpeg", alias="mimeType")
    mock_sample: str | None = Field(default=None, alias="mockSample")

    model_config = {"populate_by_name": True}


def decode_image(image_b64: str) -> Image.Image:
    raw = image_b64.strip()
    if raw.startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {exc}") from exc
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image exceeds 10 MB limit.")
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not decode image: {exc}") from exc
    return image


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fence:
        cleaned = fence.group(1).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("Model response did not contain a JSON object.")
    return json.loads(cleaned[start : end + 1])


def normalize_wardrobe_entry(raw: dict[str, Any]) -> dict[str, Any]:
    category = str(raw.get("category") or "Tops").strip()
    category_map = {
        "top": "Tops",
        "tops": "Tops",
        "shirt": "Tops",
        "blouse": "Tops",
        "bottom": "Bottoms",
        "bottoms": "Bottoms",
        "pants": "Bottoms",
        "jeans": "Bottoms",
        "skirt": "Bottoms",
        "shoe": "Shoes",
        "shoes": "Shoes",
        "outerwear": "Outerwear",
        "coat": "Outerwear",
        "jacket": "Outerwear",
        "accessory": "Accessories",
        "accessories": "Accessories",
    }
    category = category_map.get(category.lower(), category)
    if category not in WARDROBE_CATEGORIES:
        category = "Tops"

    color = str(raw.get("color") or "#888888").strip()
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
        color = "#888888"

    sentimental = str(raw.get("sentimentalValue") or raw.get("sentimental_value") or "Medium")
    if sentimental not in ("Low", "Medium", "High"):
        sentimental = "Medium"

    try:
        confidence = float(raw.get("confidence", 0.75))
    except (TypeError, ValueError):
        confidence = 0.75
    confidence = max(0.0, min(1.0, confidence))

    name = str(raw.get("name") or "Detected garment").strip() or "Detected garment"
    return {
        "name": name[:80],
        "category": category,
        "color": color.upper() if color.startswith("#") else color,
        "colorName": str(raw.get("colorName") or raw.get("color_name") or "Unknown").strip()[:40],
        "material": str(raw.get("material") or "Unknown fabric").strip()[:80],
        "careInstructions": str(
            raw.get("careInstructions") or raw.get("care_instructions") or "Gentle wash"
        ).strip()[:120],
        "storageLocation": str(
            raw.get("storageLocation") or raw.get("storage_location") or "Closet · Main Rack"
        ).strip()[:80],
        "sentimentalValue": sentimental,
        "cost": str(raw.get("cost") or "$40").strip()[:20],
        "confidence": confidence,
    }


def generate_text_only(messages: list[dict[str, Any]], max_tokens: int, temperature: float) -> str:
    assert tokenizer is not None and model is not None
    prompt = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.inference_mode():
        output = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temperature,
            do_sample=temperature > 0,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = output[0][inputs["input_ids"].shape[1] :]
    return tokenizer.decode(generated, skip_special_tokens=True).strip()


def generate_vl(
    user_text: str,
    image: Image.Image | None,
    max_tokens: int,
    temperature: float,
) -> str:
    assert processor is not None and model is not None
    content: list[dict[str, Any]] = []
    if image is not None:
        content.append({"type": "image"})
    content.append({"type": "text", "text": user_text})
    messages = [{"role": "user", "content": content}]
    prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    kwargs: dict[str, Any] = {"text": [prompt], "padding": True, "return_tensors": "pt"}
    if image is not None:
        kwargs["images"] = [image]
    inputs = processor(**kwargs)
    inputs = {key: value.to(model.device) if hasattr(value, "to") else value for key, value in inputs.items()}
    with torch.inference_mode():
        output = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temperature,
            do_sample=temperature > 0,
        )
    trimmed = [out[len(inp) :] for inp, out in zip(inputs["input_ids"], output)]
    text = processor.batch_decode(trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]
    return text.strip()


def flatten_message_content(content: Any) -> tuple[str, Image.Image | None]:
    """Extract plain text + optional first image from OpenAI-style multimodal content."""
    if isinstance(content, str):
        return content, None
    if not isinstance(content, list):
        return str(content), None
    texts: list[str] = []
    image: Image.Image | None = None
    for part in content:
        if not isinstance(part, dict):
            continue
        ptype = part.get("type")
        if ptype == "text":
            texts.append(str(part.get("text") or ""))
        elif ptype in ("image_url", "image") and image is None:
            url = part.get("image_url")
            if isinstance(url, dict):
                url = url.get("url")
            if isinstance(url, str) and url:
                image = decode_image(url)
            elif part.get("image"):
                image = decode_image(str(part["image"]))
    return "\n".join(texts).strip(), image


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "vision": IS_VL,
        "device": model_device,
        "endpoints": ["/health", "/v1/chat/completions", "/v1/wardrobe/scan"],
    }


@app.post("/v1/chat/completions")
def chat_completion(request: CompletionRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages is required.")

    if IS_VL:
        # Use the last user message; support multimodal image+text parts.
        last = next((m for m in reversed(request.messages) if m.role == "user"), request.messages[-1])
        text, image = flatten_message_content(last.content)
        if not text and image is None:
            raise HTTPException(status_code=400, detail="User message is empty.")
        result = generate_vl(text or "Describe this image.", image, request.max_tokens, request.temperature)
    else:
        plain = []
        for message in request.messages:
            text, _ = flatten_message_content(message.content)
            plain.append({"role": message.role, "content": text})
        result = generate_text_only(plain, request.max_tokens, request.temperature)

    if not result:
        raise HTTPException(status_code=502, detail="The model returned an empty response.")
    return {
        "id": "tAIlor-local-completion",
        "object": "chat.completion",
        "model": MODEL_ID,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": result}, "finish_reason": "stop"}],
    }


@app.post("/v1/wardrobe/scan")
def wardrobe_scan(request: WardrobeScanRequest):
    """Image → structured wardrobe entry JSON (silhouette, hue, fabric)."""
    if not IS_VL:
        raise HTTPException(
            status_code=501,
            detail=(
                f"Model {MODEL_ID} is text-only. "
                "Set LLM_MODEL=Qwen/Qwen2.5-VL-3B-Instruct and restart for wardrobe scan."
            ),
        )

    image = decode_image(request.image)
    raw_text = generate_vl(WARDROBE_SCAN_PROMPT, image, max_tokens=400, temperature=0.2)
    if not raw_text:
        raise HTTPException(status_code=502, detail="The vision model returned an empty response.")
    try:
        parsed = extract_json_object(raw_text)
        entry = normalize_wardrobe_entry(parsed)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Could not parse wardrobe JSON from model: {exc}. Raw: {raw_text[:400]}",
        ) from exc

    return {
        "item": entry,
        "model": MODEL_ID,
        "source": "qwen-vl",
        "raw": raw_text[:800],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
