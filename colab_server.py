"""OpenAI-compatible dual-model Qwen server for a local GPU or Google Colab.

Supports:
  - Text chat: POST /v1/chat/completions (Qwen2.5-3B-Instruct)
  - Wardrobe photo scan: POST /v1/wardrobe/scan (Qwen2.5-VL → wardrobe JSON)

Both models are loaded at startup. Override them with LLM_TEXT_MODEL and
LLM_VISION_MODEL. Qwen weights download anonymously; HF_TOKEN is optional.

In Colab: install deps, run this file, tunnel port 8000, and set LLM_BASE_URL
in tAIlor to the tunnel URL ending in /v1. Locally, point LLM_BASE_URL at
http://127.0.0.1:8000/v1 or the GPU computer's private address.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import threading
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

TEXT_MODEL_ID = os.environ.get("LLM_TEXT_MODEL", "Qwen/Qwen2.5-3B-Instruct")
VISION_MODEL_ID = os.environ.get("LLM_VISION_MODEL", "Qwen/Qwen2.5-VL-3B-Instruct")
QUANTIZE_MODELS = os.environ.get("LLM_QUANTIZE", "false").lower() in {"1", "true", "yes"}
QUANT_BITS = int(os.environ.get("LLM_QUANT_BITS", "8"))
LOAD_MODE = os.environ.get("LLM_LOAD_MODE", "both").lower()
if LOAD_MODE not in {"both", "text", "vision"}:
    LOAD_MODE = "both"
TEXT_DEVICE = os.environ.get(
    "LLM_TEXT_DEVICE",
    "cuda" if torch.cuda.is_available() else "cpu",
).lower()
# Optional — Qwen models download anonymously; only set if your mirror requires it.
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HF_API_KEY") or None

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

app = FastAPI(title="tAIlor Qwen Model Server", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

text_tokenizer = None
text_model = None
text_model_device = "unloaded"
vision_processor = None
vision_model = None
vision_model_device = "unloaded"
gpu_lock = threading.Lock()


def _hf_kwargs() -> dict[str, Any]:
    return {"token": HF_TOKEN} if HF_TOKEN else {}


def load_models() -> None:
    global text_tokenizer, text_model, text_model_device
    global vision_processor, vision_model, vision_model_device
    has_cuda = torch.cuda.is_available()
    dtype = (
        (torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16)
        if has_cuda
        else torch.float32
    )
    text_on_cpu = TEXT_DEVICE == "cpu"
    common = {
        "torch_dtype": dtype,
        "device_map": "auto",
        **_hf_kwargs(),
    }
    text_common = dict(common)
    if QUANTIZE_MODELS and has_cuda and not text_on_cpu:
        from transformers import BitsAndBytesConfig

        if QUANT_BITS == 4:
            text_common["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=dtype,
                bnb_4bit_use_double_quant=True,
            )
        else:
            text_common["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)
    text_common = (
        {
            **text_common,
            "device_map": {"": "cpu"},
            "torch_dtype": torch.float32,
        }
        if text_on_cpu
        else text_common
    )
    vision_common = common
    from transformers import (
        AutoModelForCausalLM,
        AutoProcessor,
        AutoTokenizer,
        Qwen2_5_VLForConditionalGeneration,
    )

    if LOAD_MODE in {"both", "text"}:
        print(f"Loading text model {TEXT_MODEL_ID}…")
        text_tokenizer = AutoTokenizer.from_pretrained(TEXT_MODEL_ID, **_hf_kwargs())
        text_model = AutoModelForCausalLM.from_pretrained(TEXT_MODEL_ID, **text_common)
        text_model_device = str(next(text_model.parameters()).device)
        print(f"Text model ready on {text_model_device} (dtype={dtype}, quantize={QUANTIZE_MODELS and has_cuda and not text_on_cpu})")

    if LOAD_MODE in {"both", "vision"}:
        print(f"Loading vision model {VISION_MODEL_ID}…")
        vision_processor = AutoProcessor.from_pretrained(VISION_MODEL_ID, **_hf_kwargs())
        vision_model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            VISION_MODEL_ID, **vision_common
        )
        vision_model_device = str(next(vision_model.parameters()).device)
        print(f"Vision model ready on {vision_model_device} (dtype={dtype})")


load_models()


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
    image.thumbnail((768, 768))
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
    if text_tokenizer is None or text_model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Text model is not loaded (LLM_LOAD_MODE={LOAD_MODE}).",
        )
    with gpu_lock:
        prompt = text_tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        target_device = next(text_model.parameters()).device
        inputs = text_tokenizer(prompt, return_tensors="pt").to(target_device)
        do_sample = (not QUANTIZE_MODELS) and temperature > 0.35
        gen_kwargs: dict[str, Any] = {
            **inputs,
            "max_new_tokens": max_tokens,
            "do_sample": do_sample,
            "pad_token_id": text_tokenizer.eos_token_id,
        }
        if do_sample:
            gen_kwargs["temperature"] = temperature
        with torch.inference_mode():
            output = text_model.generate(**gen_kwargs)
        generated = output[0][inputs["input_ids"].shape[1] :]
        return text_tokenizer.decode(generated, skip_special_tokens=True).strip()


def generate_vl(
    user_text: str,
    image: Image.Image | None,
    max_tokens: int,
    temperature: float,
) -> str:
    if vision_processor is None or vision_model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Vision model is not loaded (LLM_LOAD_MODE={LOAD_MODE}).",
        )
    with gpu_lock:
        content: list[dict[str, Any]] = []
        if image is not None:
            content.append({"type": "image"})
        content.append({"type": "text", "text": user_text})
        messages = [{"role": "user", "content": content}]
        prompt = vision_processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        kwargs: dict[str, Any] = {"text": [prompt], "padding": True, "return_tensors": "pt"}
        if image is not None:
            kwargs["images"] = [image]
        target_device = next(vision_model.parameters()).device
        inputs = vision_processor(**kwargs)
        inputs = {
            key: value.to(target_device) if hasattr(value, "to") else value
            for key, value in inputs.items()
        }
        do_sample = temperature > 0
        gen_kwargs: dict[str, Any] = {
            **inputs,
            "max_new_tokens": max_tokens,
            "do_sample": do_sample,
        }
        if do_sample:
            gen_kwargs["temperature"] = temperature
        with torch.inference_mode():
            output = vision_model.generate(**gen_kwargs)
        trimmed = [out[len(inp) :] for inp, out in zip(inputs["input_ids"], output)]
        text = vision_processor.batch_decode(
            trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
        )[0]
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
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
    has_cuda = torch.cuda.is_available()
    text_quantized = (
        QUANTIZE_MODELS
        and has_cuda
        and text_model is not None
        and TEXT_DEVICE != "cpu"
    )
    return {
        "status": "ok",
        "load_mode": LOAD_MODE,
        "models": {
            "text": TEXT_MODEL_ID,
            "vision": VISION_MODEL_ID,
        },
        "loaded": {
            "text": text_model is not None,
            "vision": vision_model is not None,
        },
        "devices": {
            "text": text_model_device,
            "vision": vision_model_device,
        },
        "text_device_config": TEXT_DEVICE,
        "quantized": text_quantized,
        "quant_bits": QUANT_BITS if text_quantized else None,
        "text_quantized": text_quantized,
        "vision_quantized": False,
        "endpoints": ["/health", "/v1/chat/completions", "/v1/wardrobe/scan"],
    }


@app.post("/v1/chat/completions")
def chat_completion(request: CompletionRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages is required.")

    last = next((m for m in reversed(request.messages) if m.role == "user"), request.messages[-1])
    text, image = flatten_message_content(last.content)
    if not text and image is None:
        raise HTTPException(status_code=400, detail="User message is empty.")
    if image is not None:
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
        "model": VISION_MODEL_ID if image is not None else TEXT_MODEL_ID,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": result}, "finish_reason": "stop"}],
    }


@app.post("/v1/wardrobe/scan")
def wardrobe_scan(request: WardrobeScanRequest):
    """Image → structured wardrobe entry JSON (silhouette, hue, fabric)."""
    image = decode_image(request.image)
    try:
        raw_text = generate_vl(WARDROBE_SCAN_PROMPT, image, max_tokens=400, temperature=0.2)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Vision model inference failed: {exc}. Check Colab GPU memory and the server log.",
        ) from exc
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
        "model": VISION_MODEL_ID,
        "source": "qwen-vl",
        "raw": raw_text[:800],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
