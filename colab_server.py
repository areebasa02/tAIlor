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
from contextlib import asynccontextmanager, contextmanager
import gc
import io
import json
import os
import re
import threading
from pathlib import Path
from typing import Any

import cv2
import numpy as np
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
# hf-xet can stall on Windows/certain networks during large multi-GB downloads; fall back to standard HTTPS unless opted in.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

from tryon_sdxl import (  # noqa: E402
    TRYON_SDXL_MODEL,
    generate_sdxl_tryon,
    is_tryon_loaded,
    render_openpose_from_keypoints,
)

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
TRYON_SDXL_MODEL = os.environ.get("TRYON_SDXL_MODEL", TRYON_SDXL_MODEL)
TRYON_VAE_MODEL = os.environ.get("TRYON_VAE_MODEL", "madebyollin/sdxl-vae-fp16-fix")
TRYON_CONTROLNET_MODEL = os.environ.get(
    "TRYON_CONTROLNET_MODEL", "xinsir/controlnet-openpose-sdxl-1.0"
)
TRYON_IP_ADAPTER_REPO = os.environ.get("TRYON_IP_ADAPTER_REPO", "h94/IP-Adapter")
TRYON_IP_ADAPTER_WEIGHT = os.environ.get(
    "TRYON_IP_ADAPTER_WEIGHT", "ip-adapter-plus_sdxl_vit-h.safetensors"
)
TRYON_IP_ADAPTER_FACE_WEIGHT = os.environ.get(
    "TRYON_IP_ADAPTER_FACE_WEIGHT", "ip-adapter-plus-face_sdxl_vit-h.safetensors"
)
# Optional — Qwen & RealVisXL weights download anonymously; only set if your mirror requires it.
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HF_API_KEY") or None

WARDROBE_CATEGORIES = ("Tops", "Bottoms", "Full Body", "Shoes", "Outerwear", "Accessories")
WARDROBE_SCAN_PROMPT = """Analyze this clothing item photo for a digital wardrobe app.
Return ONLY a single JSON object (no markdown fences, no extra text) with these keys:
- name: short garment name (string)
- category: one of Tops, Bottoms, Full Body, Shoes, Outerwear, Accessories (use Full Body for dresses, gowns, jumpsuits, rompers, boilersuits, coveralls, and overalls)
- color: dominant hue as #RRGGBB hex
- colorName: human color label (string)
- material: fabric / texture guess (string)
- careInstructions: brief care tip (string)
- storageLocation: suggested storage (string)
- sentimentalValue: one of Low, Medium, High
- cost: rough retail estimate like "$45" (string)
- confidence: 0-1 float for overall detection confidence
"""

text_tokenizer = None
text_model = None
text_model_device = "unloaded"
vision_processor = None
vision_model = None
vision_model_device = "unloaded"
gpu_lock = threading.Lock()
state_lock = threading.Lock()
model_load_state = "loading"
model_load_stage = "Initializing model loader"
model_load_error: str | None = None
active_task: str | None = None
queued_tasks = 0


def _set_load_status(state: str, stage: str, error: str | None = None) -> None:
    global model_load_state, model_load_stage, model_load_error
    with state_lock:
        model_load_state = state
        model_load_stage = stage
        model_load_error = error


def _load_models_worker() -> None:
    try:
        load_models()
        _set_load_status("ready", "Models ready")
        print("[GPU] All configured Qwen models are ready.", flush=True)
    except Exception as exc:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        _set_load_status("error", "Model initialization failed", str(exc))
        print(f"[GPU] Model loading failed: {exc}", flush=True)


@contextmanager
def _gpu_task(task_name: str):
    global active_task, queued_tasks
    with state_lock:
        queued_tasks += 1
    try:
        with gpu_lock:
            with state_lock:
                queued_tasks = max(0, queued_tasks - 1)
                active_task = task_name
            try:
                yield
            finally:
                with state_lock:
                    active_task = None
    except BaseException:
        with state_lock:
            if active_task is None and queued_tasks > 0:
                queued_tasks = max(0, queued_tasks - 1)
        raise


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    threading.Thread(target=_load_models_worker, name="model-loader", daemon=True).start()
    yield


app = FastAPI(title="tAIlor Qwen Model Server", version="2.0.0", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _hf_kwargs() -> dict[str, Any]:
    return {"token": HF_TOKEN} if HF_TOKEN else {}


def _dtype_kwarg(dtype: torch.dtype) -> dict[str, Any]:
    import transformers
    from packaging.version import Version

    if Version(transformers.__version__) >= Version("4.56.0"):
        return {"dtype": dtype}
    return {"torch_dtype": dtype}


def _model_is_quantized(model: Any) -> bool:
    return bool(
        model is not None
        and (
            getattr(model, "is_loaded_in_4bit", False)
            or getattr(model, "is_loaded_in_8bit", False)
            or getattr(model, "quantization_method", None) is not None
        )
    )


def _current_device_str(model: Any) -> str:
    if model is None:
        return "unloaded"
    try:
        return str(next(model.parameters()).device)
    except StopIteration:
        return "unknown"


def _move_unquantized(model: Any, target: str) -> str:
    if model is None:
        return "unloaded"
    if _model_is_quantized(model) or hasattr(model, "hf_device_map"):
        return _current_device_str(model)
    cur = _current_device_str(model)
    if cur == target or (target == "cuda" and cur.startswith("cuda")):
        return cur
    model.to(target)
    return _current_device_str(model)


def _free_cuda_vram(min_free_gb: float = 0.0, *, offload_text: bool = False, offload_vision: bool = False) -> None:
    global text_model_device, vision_model_device
    if not torch.cuda.is_available():
        return
    if offload_text and text_model is not None:
        text_model_device = _move_unquantized(text_model, "cpu")
    if offload_vision and vision_model is not None:
        vision_model_device = _move_unquantized(vision_model, "cpu")
    gc.collect()
    torch.cuda.empty_cache()
    if min_free_gb > 0:
        free_bytes, _ = torch.cuda.mem_get_info()
        if free_bytes < min_free_gb * (1024**3):
            if text_model is not None and not offload_text:
                text_model_device = _move_unquantized(text_model, "cpu")
            if vision_model is not None and not offload_vision:
                vision_model_device = _move_unquantized(vision_model, "cpu")
            gc.collect()
            torch.cuda.empty_cache()


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
    use_quant = QUANTIZE_MODELS and has_cuda and not text_on_cpu

    text_common: dict[str, Any] = {
        **_dtype_kwarg(torch.float32 if text_on_cpu else dtype),
        "low_cpu_mem_usage": True,
        **_hf_kwargs(),
    }
    if use_quant:
        from transformers import BitsAndBytesConfig

        text_common["device_map"] = "auto"
        if QUANT_BITS == 4:
            text_common["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=dtype,
                bnb_4bit_use_double_quant=True,
            )
        else:
            text_common["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)

    vision_common: dict[str, Any] = {
        **_dtype_kwarg(dtype),
        "low_cpu_mem_usage": True,
        **_hf_kwargs(),
    }

    from transformers import (
        AutoModelForCausalLM,
        AutoProcessor,
        AutoTokenizer,
        Qwen2_5_VLForConditionalGeneration,
    )

    if LOAD_MODE in {"both", "text"}:
        _set_load_status("loading", f"Loading text model {TEXT_MODEL_ID}")
        print(f"Loading text model {TEXT_MODEL_ID}…", flush=True)
        with gpu_lock:
            text_tokenizer = AutoTokenizer.from_pretrained(TEXT_MODEL_ID, **_hf_kwargs())
            text_model = AutoModelForCausalLM.from_pretrained(TEXT_MODEL_ID, **text_common)
            if not use_quant:
                text_model.to("cpu" if text_on_cpu or not has_cuda else "cuda:0")
            text_model_device = _current_device_str(text_model)
        print(f"Text model ready on {text_model_device} (dtype={dtype}, quantize={use_quant})", flush=True)

    if LOAD_MODE in {"both", "vision"}:
        _set_load_status("loading", f"Loading vision model {VISION_MODEL_ID}")
        print(f"Loading vision model {VISION_MODEL_ID}…", flush=True)
        with gpu_lock:
            vision_processor = AutoProcessor.from_pretrained(VISION_MODEL_ID, **_hf_kwargs())
            vision_model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                VISION_MODEL_ID, **vision_common
            )
            if has_cuda:
                vision_model.to("cuda:0")
            vision_model_device = _current_device_str(vision_model)
        print(f"Vision model ready on {vision_model_device} (dtype={dtype})", flush=True)


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


class TryOnGarmentInput(BaseModel):
    image_url: str | None = Field(default=None, alias="imageUrl")
    description: str = ""
    type: str = ""
    color: str = ""
    color_name: str = Field(default="", alias="colorName")
    material: str = ""

    model_config = {"populate_by_name": True}


class TryOnRequest(BaseModel):
    mannequin_image: str | None = Field(default=None, alias="mannequinImage")
    openpose_image: str | None = Field(default=None, alias="openposeImage")
    dressed_image: str | None = Field(default=None, alias="dressedImage")
    garments: list[TryOnGarmentInput] = Field(default_factory=list)
    keypoints: dict[str, list[float]] | None = None
    camera_preset: str | None = Field(default="front", alias="cameraPreset")
    backdrop_preset: str | None = Field(default="cyclorama", alias="backdropPreset")
    include_my_face: bool = Field(default=False, alias="includeMyFace")
    face_image: str | None = Field(default=None, alias="faceImage")
    pose_label: str | None = Field(default=None, alias="poseLabel")
    body_preset: str | None = Field(default=None, alias="bodyPreset")
    fit_style: str | None = Field(default="standard", alias="fitStyle")
    material_id: str | None = Field(default="porcelain", alias="materialId")
    seed: int | None = None

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
    name = str(raw.get("name") or "Detected garment").strip()[:80] or "Detected garment"
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
        "full body": "Full Body",
        "full_body": "Full Body",
        "full-body": "Full Body",
        "dresses / full body": "Full Body",
        "dress": "Full Body",
        "dresses": "Full Body",
        "gown": "Full Body",
        "jumpsuit": "Full Body",
        "romper": "Full Body",
        "boilersuit": "Full Body",
        "coverall": "Full Body",
        "coveralls": "Full Body",
        "overalls": "Full Body",
        "one-piece": "Full Body",
        "one piece": "Full Body",
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

    # Guard against vision model putting dresses/jumpsuits into Tops
    name_lower = name.lower()
    if category == "Tops" and not any(
        guard in name_lower
        for guard in ("dress shirt", "dress blouse", "dress top", "dress trouser", "dress pant", "dress oxford", "dress shoe", "dress coat")
    ):
        if any(
            kw in name_lower
            for kw in ("dress", "gown", "jumpsuit", "romper", "boilersuit", "coverall", "overalls")
        ):
            category = "Full Body"

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

    return {
        "name": name,
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


def _ensure_text_device() -> torch.device:
    global text_model_device
    if torch.cuda.is_available() and TEXT_DEVICE != "cpu" and not _model_is_quantized(text_model):
        cur = _current_device_str(text_model)
        if not cur.startswith("cuda"):
            _free_cuda_vram(min_free_gb=6.8, offload_vision=True)
            text_model_device = _move_unquantized(text_model, "cuda:0")
    return next(text_model.parameters()).device


def _ensure_vision_device() -> torch.device:
    global vision_model_device
    if torch.cuda.is_available() and not _model_is_quantized(vision_model):
        cur = _current_device_str(vision_model)
        if not cur.startswith("cuda"):
            _free_cuda_vram(min_free_gb=8.2, offload_text=True)
            vision_model_device = _move_unquantized(vision_model, "cuda:0")
    return next(vision_model.parameters()).device


def generate_text_only(messages: list[dict[str, Any]], max_tokens: int, temperature: float) -> str:
    if model_load_state == "loading" and text_model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Host PC models are still loading ({model_load_stage}). Try again shortly.",
        )
    if model_load_state == "error" and text_model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Host PC text model failed to load: {model_load_error or 'unknown error'}.",
        )
    if text_tokenizer is None or text_model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Text model is not loaded (LLM_LOAD_MODE={LOAD_MODE}).",
        )
    with _gpu_task("stylist"):
        target_device = _ensure_text_device()
        prompt = text_tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
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
    if model_load_state == "loading" and vision_model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Host PC models are still loading ({model_load_stage}). Try again shortly.",
        )
    if model_load_state == "error" and vision_model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Host PC vision model failed to load: {model_load_error or 'unknown error'}.",
        )
    if vision_processor is None or vision_model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Vision model is not loaded (LLM_LOAD_MODE={LOAD_MODE}).",
        )
    with _gpu_task("wardrobe-scan"):
        target_device = _ensure_vision_device()
        content: list[dict[str, Any]] = []
        if image is not None:
            content.append({"type": "image"})
        content.append({"type": "text", "text": user_text})
        messages = [{"role": "user", "content": content}]
        prompt = vision_processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        kwargs: dict[str, Any] = {"text": [prompt], "padding": True, "return_tensors": "pt"}
        if image is not None:
            kwargs["images"] = [image]
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
    with state_lock:
        load_state = model_load_state
        load_stage = model_load_stage
        load_err = model_load_error
        cur_task = active_task
        queued = queued_tasks
    health_status = "ok" if load_state == "ready" else ("error" if load_state == "error" else "loading")
    return {
        "status": health_status,
        "load_state": load_state,
        "loading_stage": load_stage,
        "load_error": load_err,
        "load_mode": LOAD_MODE,
        "active_task": cur_task,
        "queued_tasks": queued,
        "models": {
            "text": TEXT_MODEL_ID,
            "vision": VISION_MODEL_ID,
            "tryon": TRYON_SDXL_MODEL,
        },
        "loaded": {
            "text": text_model is not None,
            "vision": vision_model is not None,
            "tryon": is_tryon_loaded(),
        },
        "devices": {
            "text": _current_device_str(text_model),
            "vision": _current_device_str(vision_model),
        },
        "text_device_config": TEXT_DEVICE,
        "quantized": text_quantized,
        "quant_bits": QUANT_BITS if text_quantized else None,
        "text_quantized": text_quantized,
        "vision_quantized": False,
        "endpoints": ["/health", "/v1/models", "/v1/chat/completions", "/v1/wardrobe/scan", "/v1/try-on"],
    }


@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [
            {"id": TEXT_MODEL_ID, "object": "model", "owned_by": "local"},
            {"id": VISION_MODEL_ID, "object": "model", "owned_by": "local"},
            {"id": TRYON_SDXL_MODEL, "object": "model", "owned_by": "local"},
        ],
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


def decode_image_fullres(image_b64: str) -> Image.Image:
    raw = image_b64.strip()
    if raw.startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw, validate=False)
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid try-on image: {exc}") from exc


PUBLIC_WARDROBE_DIR = Path(__file__).resolve().parent / "public" / "wardrobe"


def _slugify_garment(name: str) -> str:
    s = name.lower().strip().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def load_garment_rgba(garment: TryOnGarmentInput) -> tuple[np.ndarray, np.ndarray] | None:
    """Resolve a garment's RGB image + clean foreground alpha mask [0..1] from local assets or data URL."""
    img_pil: Image.Image | None = None
    slug = _slugify_garment(garment.description)
    if slug:
        local_path = PUBLIC_WARDROBE_DIR / f"{slug}.png"
        if local_path.exists():
            img_pil = Image.open(local_path).convert("RGBA")

    if img_pil is None and garment.image_url:
        url = garment.image_url.strip()
        if "/wardrobe/" in url and not url.startswith("data:"):
            fname = url.split("/wardrobe/", 1)[1].split("?", 1)[0].strip("/")
            candidate = PUBLIC_WARDROBE_DIR / fname
            if candidate.exists():
                img_pil = Image.open(candidate).convert("RGBA")
        elif url.startswith("data:"):
            raw = url.split(",", 1)[1] if "," in url else url
            try:
                img_pil = Image.open(io.BytesIO(base64.b64decode(raw, validate=False))).convert("RGBA")
            except Exception:  # noqa: BLE001
                img_pil = None

    if img_pil is None:
        return None

    arr = np.array(img_pil)
    rgb = arr[:, :, :3].astype(np.float32) / 255.0
    alpha_ch = arr[:, :, 3].astype(np.float32) / 255.0
    if float(alpha_ch.min()) < 0.96:
        return rgb, alpha_ch

    # Floating flood-fill from studio corners separates even crisp white tees/sneakers cleanly
    h, w = arr.shape[:2]
    bgr_u8 = arr[:, :, :3].copy()
    ff_mask = np.zeros((h + 2, w + 2), np.uint8)
    for sx, sy in ((3, 3), (w - 4, 3), (3, h - 4), (w - 4, h - 4)):
        cv2.floodFill(
            bgr_u8,
            ff_mask,
            (sx, sy),
            (0, 0, 0),
            (2, 2, 2),
            (2, 2, 2),
            4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY,
        )
    fg = (ff_mask[1:-1, 1:-1] == 0).astype(np.float32)
    area = float(fg.mean())
    if area < 0.015 or area > 0.90:
        corner = np.median(
            np.concatenate([rgb[:12, :12], rgb[:12, -12:], rgb[-12:, :12], rgb[-12:, -12:]]),
            axis=(0, 1),
        )
        dist = np.linalg.norm(rgb - corner[None, None, :], axis=2)
        fg = np.clip((dist - 0.05) / 0.06, 0.0, 1.0)

    fg_bin = (fg > 0.4).astype(np.uint8) * 255
    fg_bin = cv2.morphologyEx(fg_bin, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(fg_bin.astype(np.float32) / 255.0, (3, 3), 0.7)
    return rgb, np.clip(alpha, 0.0, 1.0)


@app.post("/v1/try-on")
def virtual_try_on(request: TryOnRequest):
    """Local RTX GPU try-on studio generator (SDXL + OpenPose ControlNet + IP-Adapter)."""
    if model_load_state == "loading":
        raise HTTPException(
            status_code=503,
            detail=f"Host PC is still loading startup models ({model_load_stage}). Try again in a moment.",
        )
    is_back_view = (request.camera_preset or "").strip().lower() == "back"
    if request.openpose_image:
        openpose_img = decode_image_fullres(request.openpose_image)
    elif request.keypoints:
        openpose_img = render_openpose_from_keypoints(
            request.keypoints,
            include_face_features=bool(request.include_my_face and request.face_image and not is_back_view),
            is_back_view=is_back_view,
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="openposeImage or keypoints is required for pose-conditioned try-on generation.",
        )

    face_img = (
        decode_image_fullres(request.face_image)
        if (request.include_my_face and request.face_image and not is_back_view)
        else None
    )

    with _gpu_task("try-on"):
        # Offload Qwen text/vision weights to system RAM before running SDXL + ControlNet + IP-Adapter
        # so diffusion stays well inside 24 GB VRAM without OOM.
        _free_cuda_vram(offload_text=True, offload_vision=True)
        try:
            rendered = generate_sdxl_tryon(
                openpose_img=openpose_img,
                garments=request.garments,
                load_rgba_fn=load_garment_rgba,
                camera_preset=request.camera_preset,
                backdrop_preset=request.backdrop_preset,
                pose_label=request.pose_label,
                body_preset=request.body_preset,
                fit_style=request.fit_style,
                material_id=request.material_id,
                include_my_face=request.include_my_face and not is_back_view,
                face_img=face_img,
                seed=request.seed,
                hf_token=HF_TOKEN,
            )
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            import traceback

            traceback.print_exc()
            raise HTTPException(
                status_code=502,
                detail=f"Local SDXL Try-On generation failed: {exc}",
            ) from exc

    buf = io.BytesIO()
    rendered.save(buf, format="JPEG", quality=93, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return {
        "imageUrl": f"data:image/jpeg;base64,{b64}",
        "model": TRYON_SDXL_MODEL,
        "runs": max(1, len(request.garments)),
    }


if __name__ == "__main__":
    bind_host = os.environ.get("AI_SERVER_HOST", "127.0.0.1")
    bind_port = int(os.environ.get("AI_SERVER_PORT", "8000"))
    uvicorn.run(app, host=bind_host, port=bind_port)
