"""OpenAI-compatible multi-model GPU server for tAIlor (Local 24 GB+ RTX or Colab).

Supports:
  - Text chat:          POST /v1/chat/completions (Qwen2.5-3B-Instruct, 8-bit co-resident on 24 GB+ GPUs)
  - Wardrobe photo scan: POST /v1/wardrobe/scan   (Qwen2.5-VL-3B-Instruct, bf16)
  - Hybrid 2-Stage Try-On: POST /v1/try-on        (RealVisXL V5.0 Lightning + ControlNet Union + FastFit-MR-1024)
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
import time
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
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

from fastfit_vton import (  # noqa: E402
    ContentFilterViolation,
    encode_jpeg_with_ai_disclosure,
    validate_tryon_content_safety,
)
TRYON_ENGINE = os.environ.get("TRYON_ENGINE", "firered").strip().lower()
if TRYON_ENGINE == "legacy":
    from tryon_sdxl import (  # noqa: E402
        generate_sdxl_tryon,
        get_tryon_model_summary,
        is_tryon_loaded,
        render_openpose_from_keypoints,
        warmup_tryon_pipelines,
    )
else:
    from tryon_v2 import (  # noqa: E402
        generate_sdxl_tryon,
        get_tryon_model_summary,
        is_tryon_loaded,
        render_openpose_from_keypoints,
        warmup_tryon_pipelines,
    )


def _gpu_total_gb() -> float:
    if not torch.cuda.is_available():
        return 0.0
    return float(torch.cuda.get_device_properties(0).total_memory) / (1024**3)


def _bitsandbytes_available() -> bool:
    try:
        import bitsandbytes  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


TOTAL_VRAM_GB = _gpu_total_gb()
IS_HIGH_VRAM_GPU = TOTAL_VRAM_GB >= 22.0
TRYON_PRELOAD = os.environ.get(
    "TRYON_PRELOAD", "true" if IS_HIGH_VRAM_GPU else "false"
).lower() in {"1", "true", "yes"}

TEXT_MODEL_ID = os.environ.get("LLM_TEXT_MODEL", "Qwen/Qwen2.5-3B-Instruct")
VISION_MODEL_ID = os.environ.get("LLM_VISION_MODEL", "Qwen/Qwen2.5-VL-3B-Instruct")

# On 24 GB+ GPUs with co-resident Try-On enabled, default Qwen2.5-3B text (~2.0 GB) and
# Qwen2.5-VL-3B vision (~2.6 GB) to 4-bit NF4 when bitsandbytes is available unless
# explicitly forced unquantized via LLM_FORCE_UNQUANTIZED=true.
_force_unquant = os.environ.get("LLM_FORCE_UNQUANTIZED", "false").lower() in {"1", "true", "yes"}
_raw_quant = os.environ.get("LLM_QUANTIZE", "").lower()
QUANTIZE_MODELS = (
    (not _force_unquant)
    and _bitsandbytes_available()
    and (
        _raw_quant in {"1", "true", "yes"}
        or (IS_HIGH_VRAM_GPU and TRYON_PRELOAD)
    )
)
QUANT_BITS = int(os.environ.get("LLM_QUANT_BITS", "4"))
LOAD_MODE = os.environ.get("LLM_LOAD_MODE", "both").lower()
if LOAD_MODE not in {"both", "text", "vision"}:
    LOAD_MODE = "both"
TEXT_DEVICE = os.environ.get(
    "LLM_TEXT_DEVICE",
    "cuda" if torch.cuda.is_available() else "cpu",
).lower()
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
tryon_progress_map: dict[str, dict[str, Any]] = {}
progress_lock = threading.Lock()


def _set_tryon_progress(
    job_id: str | None,
    phase: str,
    label: str,
    percent: int,
    step: int = 0,
    total_steps: int = 0,
) -> None:
    if not job_id:
        return
    with progress_lock:
        tryon_progress_map[job_id] = {
            "phase": phase,
            "label": label,
            "percent": max(0, min(100, int(percent))),
            "step": int(step),
            "totalSteps": int(total_steps),
            "updatedAt": int(time.time() * 1000),
        }
        if len(tryon_progress_map) > 64:
            oldest = sorted(tryon_progress_map.items(), key=lambda kv: kv[1]["updatedAt"])[:16]
            for k, _ in oldest:
                tryon_progress_map.pop(k, None)


def _set_load_status(state: str, stage: str, error: str | None = None) -> None:
    global model_load_state, model_load_stage, model_load_error
    with state_lock:
        model_load_state = state
        model_load_stage = stage
        model_load_error = error


def _load_models_worker() -> None:
    try:
        load_models()
        if TRYON_PRELOAD and torch.cuda.is_available():
            _set_load_status("loading", f"Pre-warming Try-On ({get_tryon_model_summary()})…")
            with gpu_lock:
                warmup_tryon_pipelines(hf_token=HF_TOKEN, coresident_gpu=IS_HIGH_VRAM_GPU)
        _set_load_status("ready", "Models ready")
        if torch.cuda.is_available():
            free_b, total_b = torch.cuda.mem_get_info()
            print(
                f"[GPU] All models ready (VRAM free={free_b / 1024**3:.2f} GB / {total_b / 1024**3:.2f} GB).",
                flush=True,
            )
        else:
            print("[GPU] All configured models are ready.", flush=True)
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


app = FastAPI(title="tAIlor Hybrid AI Model Server", version="3.0.0", lifespan=_lifespan)
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


def _free_cuda_vram(
    min_free_gb: float = 0.0,
    *,
    offload_text: bool = False,
    offload_vision: bool = False,
) -> None:
    global text_model_device, vision_model_device
    if not torch.cuda.is_available():
        return
    if offload_text and text_model is not None:
        text_model_device = _move_unquantized(text_model, "cpu")
    if offload_vision and vision_model is not None:
        vision_model_device = _move_unquantized(vision_model, "cpu")
    if offload_text or offload_vision:
        gc.collect()
        torch.cuda.empty_cache()
    if min_free_gb > 0:
        free_bytes, _ = torch.cuda.mem_get_info()
        if free_bytes < min_free_gb * (1024**3):
            if text_model is not None and not offload_text:
                text_model_device = _move_unquantized(text_model, "cpu")
                gc.collect()
                torch.cuda.empty_cache()
            free_bytes, _ = torch.cuda.mem_get_info()
            if free_bytes < min_free_gb * (1024**3) and vision_model is not None and not offload_vision:
                vision_model_device = _move_unquantized(vision_model, "cpu")
                gc.collect()
                torch.cuda.empty_cache()


def load_models() -> None:
    global text_tokenizer, text_model, text_model_device, QUANTIZE_MODELS
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
        try:
            from transformers import BitsAndBytesConfig

            text_common["device_map"] = {"": "cuda:0"}
            if QUANT_BITS == 4:
                text_common["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_compute_dtype=dtype,
                    bnb_4bit_use_double_quant=True,
                )
            else:
                text_common["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[GPU] 8-bit quantization unavailable ({exc}); falling back to bf16.", flush=True)
            use_quant = False
            QUANTIZE_MODELS = False
            text_common.pop("device_map", None)
            text_common.pop("quantization_config", None)

    vision_use_quant = QUANTIZE_MODELS and has_cuda
    vision_common: dict[str, Any] = {
        **_dtype_kwarg(dtype),
        "low_cpu_mem_usage": True,
        **_hf_kwargs(),
    }
    if vision_use_quant:
        try:
            from transformers import BitsAndBytesConfig

            vision_common["device_map"] = {"": "cuda:0"}
            vision_common["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=dtype,
                bnb_4bit_use_double_quant=True,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[GPU] Vision 4-bit quantization unavailable ({exc}); using {dtype}.", flush=True)
            vision_use_quant = False
            vision_common.pop("device_map", None)
            vision_common.pop("quantization_config", None)

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
            try:
                text_model = AutoModelForCausalLM.from_pretrained(TEXT_MODEL_ID, **text_common)
            except Exception as quant_exc:  # noqa: BLE001
                if use_quant:
                    print(
                        f"[GPU] Quantized text load failed ({quant_exc}); retrying unquantized {dtype}.",
                        flush=True,
                    )
                    use_quant = False
                    QUANTIZE_MODELS = False
                    text_common.pop("device_map", None)
                    text_common.pop("quantization_config", None)
                    text_model = AutoModelForCausalLM.from_pretrained(TEXT_MODEL_ID, **text_common)
                else:
                    raise
            if not use_quant:
                text_model.to("cpu" if text_on_cpu or not has_cuda else "cuda:0")
            text_model_device = _current_device_str(text_model)
        print(
            f"Text model ready on {text_model_device} (dtype={dtype}, quantize={use_quant}, bits={QUANT_BITS if use_quant else 16})",
            flush=True,
        )

    if LOAD_MODE in {"both", "vision"}:
        _set_load_status("loading", f"Loading vision model {VISION_MODEL_ID}")
        print(f"Loading vision model {VISION_MODEL_ID}…", flush=True)
        with gpu_lock:
            vision_processor = AutoProcessor.from_pretrained(VISION_MODEL_ID, **_hf_kwargs())
            try:
                vision_model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                    VISION_MODEL_ID, **vision_common
                )
            except Exception as v_quant_exc:  # noqa: BLE001
                if vision_use_quant:
                    print(
                        f"[GPU] Quantized vision load failed ({v_quant_exc}); retrying {dtype}.",
                        flush=True,
                    )
                    vision_use_quant = False
                    vision_common.pop("device_map", None)
                    vision_common.pop("quantization_config", None)
                    vision_model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                        VISION_MODEL_ID, **vision_common
                    )
                else:
                    raise
            if has_cuda and not vision_use_quant:
                vision_model.to("cuda:0")
            vision_model_device = _current_device_str(vision_model)
        print(
            f"Vision model ready on {vision_model_device} (dtype={dtype}, quantize={vision_use_quant})",
            flush=True,
        )


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
    job_id: str | None = Field(default=None, alias="jobId")
    mannequin_image: str | None = Field(default=None, alias="mannequinImage")
    openpose_image: str | None = Field(default=None, alias="openposeImage")
    depth_image: str | None = Field(default=None, alias="depthImage")
    dressed_image: str | None = Field(default=None, alias="dressedImage")
    user_photo_image: str | None = Field(default=None, alias="userPhotoImage")
    photo_mode: str | None = Field(default="none", alias="photoMode")
    garments: list[TryOnGarmentInput] = Field(default_factory=list)
    keypoints: dict[str, list[float]] | None = None
    body_sliders: dict[str, float] | None = Field(default=None, alias="bodySliders")
    subject_mode: str | None = Field(default="mannequin", alias="subjectMode")
    hand_foot_preset: str | None = Field(default="neutral", alias="handFootPreset")
    camera_preset: str | None = Field(default="front", alias="cameraPreset")
    backdrop_preset: str | None = Field(default="cyclorama", alias="backdropPreset")
    include_my_face: bool = Field(default=False, alias="includeMyFace")
    face_image: str | None = Field(default=None, alias="faceImage")
    has_custom_face_upload: bool = Field(default=False, alias="hasCustomFaceUpload")
    face_consent_confirmed: bool = Field(default=True, alias="faceConsentConfirmed")
    pose_label: str | None = Field(default=None, alias="poseLabel")
    body_preset: str | None = Field(default=None, alias="bodyPreset")
    fit_style: str | None = Field(default="standard", alias="fitStyle")
    material_id: str | None = Field(default="porcelain", alias="materialId")
    seed: int | None = None
    bypass_pose_cache: bool = Field(default=False, alias="bypassPoseCache")

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

    name_lower = name.lower()
    if category == "Tops" and not any(
        guard in name_lower
        for guard in (
            "dress shirt",
            "dress blouse",
            "dress top",
            "dress trouser",
            "dress pant",
            "dress oxford",
            "dress shoe",
            "dress coat",
        )
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
            _free_cuda_vram(
                min_free_gb=6.8,
                offload_vision=not IS_HIGH_VRAM_GPU,
            )
            text_model_device = _move_unquantized(text_model, "cuda:0")
    return next(text_model.parameters()).device


def _ensure_vision_device() -> torch.device:
    global vision_model_device
    if torch.cuda.is_available() and not _model_is_quantized(vision_model):
        cur = _current_device_str(vision_model)
        if not cur.startswith("cuda"):
            _free_cuda_vram(
                min_free_gb=8.2,
                offload_text=not IS_HIGH_VRAM_GPU,
            )
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
        do_sample = (not _model_is_quantized(text_model)) and temperature > 0.35
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
        prompt = vision_processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
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
        return text.strip()


def flatten_message_content(content: Any) -> tuple[str, Image.Image | None]:
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
    text_quantized = bool(has_cuda and _model_is_quantized(text_model))
    free_gb, total_gb = 0.0, 0.0
    if has_cuda:
        free_b, total_b = torch.cuda.mem_get_info()
        free_gb = round(free_b / (1024**3), 2)
        total_gb = round(total_b / (1024**3), 2)
    with state_lock:
        load_state = model_load_state
        load_stage = model_load_stage
        load_err = model_load_error
        cur_task = active_task
        queued = queued_tasks
    health_status = "ok" if load_state == "ready" else ("error" if load_state == "error" else "loading")
    tryon_summary = get_tryon_model_summary()
    return {
        "status": health_status,
        "load_state": load_state,
        "loading_stage": load_stage,
        "load_error": load_err,
        "load_mode": LOAD_MODE,
        "active_task": cur_task,
        "queued_tasks": queued,
        "vram_free_gb": free_gb,
        "vram_total_gb": total_gb,
        "models": {
            "text": TEXT_MODEL_ID,
            "vision": VISION_MODEL_ID,
            "tryon": tryon_summary,
        },
        "loaded": {
            "text": text_model is not None,
            "vision": vision_model is not None,
            "tryon": is_tryon_loaded(),
        },
        "devices": {
            "text": _current_device_str(text_model),
            "vision": _current_device_str(vision_model),
            "tryon": "cuda:0" if is_tryon_loaded() and has_cuda else "unloaded",
        },
        "text_device_config": TEXT_DEVICE,
        "quantized": text_quantized or bool(has_cuda and _model_is_quantized(vision_model)),
        "quant_bits": QUANT_BITS if (text_quantized or _model_is_quantized(vision_model)) else None,
        "text_quantized": text_quantized,
        "vision_quantized": bool(has_cuda and _model_is_quantized(vision_model)),
        "endpoints": [
            "/health",
            "/v1/models",
            "/v1/chat/completions",
            "/v1/wardrobe/scan",
            "/v1/try-on",
        ],
    }


@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [
            {"id": TEXT_MODEL_ID, "object": "model", "owned_by": "local"},
            {"id": VISION_MODEL_ID, "object": "model", "owned_by": "local"},
            {"id": get_tryon_model_summary(), "object": "model", "owned_by": "local"},
        ],
    }


@app.post("/v1/chat/completions")
def chat_completion(request: CompletionRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages is required.")

    last = next(
        (m for m in reversed(request.messages) if m.role == "user"), request.messages[-1]
    )
    text, image = flatten_message_content(last.content)
    if not text and image is None:
        raise HTTPException(status_code=400, detail="User message is empty.")
    if image is not None:
        result = generate_vl(
            text or "Describe this image.", image, request.max_tokens, request.temperature
        )
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
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": result},
                "finish_reason": "stop",
            }
        ],
    }


@app.post("/v1/wardrobe/scan")
def wardrobe_scan(request: WardrobeScanRequest):
    image = decode_image(request.image)
    try:
        raw_text = generate_vl(WARDROBE_SCAN_PROMPT, image, max_tokens=400, temperature=0.2)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Vision model inference failed: {exc}. Check GPU memory and server log.",
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
                img_pil = Image.open(io.BytesIO(base64.b64decode(raw, validate=False))).convert(
                    "RGBA"
                )
            except Exception:  # noqa: BLE001
                img_pil = None

    if img_pil is None:
        return None

    arr = np.array(img_pil)
    rgb = arr[:, :, :3].astype(np.float32) / 255.0
    alpha_ch = arr[:, :, 3].astype(np.float32) / 255.0
    if float(alpha_ch.min()) < 0.96:
        return rgb, alpha_ch

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


@app.get("/v1/try-on/progress/{job_id}")
def get_tryon_progress(job_id: str):
    with progress_lock:
        entry = tryon_progress_map.get(job_id)
    if entry is None:
        return {"phase": "queued", "label": "Waiting for GPU worker…", "percent": 4, "step": 0, "totalSteps": 0}
    return entry


@app.post("/v1/try-on")
def virtual_try_on(request: TryOnRequest):
    """Hybrid 2-Stage local RTX Try-On (Stage 1 ControlNet Union + Optional Face Detailer + Stage 2 FastFit-MR-1024)."""
    if model_load_state == "loading" and not is_tryon_loaded():
        raise HTTPException(
            status_code=503,
            detail=f"Host PC is still loading startup models ({model_load_stage}). Try again in a moment.",
        )

    is_back_view = (request.camera_preset or "").strip().lower() == "back"
    norm_photo_mode = (request.photo_mode or "none").strip().lower()
    _set_tryon_progress(request.job_id, "validating", "Checking safety & portrait consent…", 3)

    # Enforce Terms-of-Use Content Filters & Biometric/Portrait Consent (FastFit Sec. 2(e) & 4(a), OpenRAIL++)
    try:
        validate_tryon_content_safety(
            [
                *(g.description for g in request.garments),
                *(g.color_name for g in request.garments),
                *(g.material for g in request.garments),
                request.pose_label or "",
                request.body_preset or "",
            ],
            include_my_face=bool(
                (request.include_my_face or norm_photo_mode in {"direct_photo", "repose_picture"})
                and not is_back_view
            ),
            has_custom_face_upload=bool(request.has_custom_face_upload or request.user_photo_image),
            face_consent_confirmed=bool(request.face_consent_confirmed),
        )
    except ContentFilterViolation as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if request.openpose_image:
        openpose_img = decode_image_fullres(request.openpose_image)
    elif request.keypoints:
        openpose_img = render_openpose_from_keypoints(
            request.keypoints,
            include_face_features=bool(
                request.include_my_face and request.face_image and not is_back_view
            ),
            is_back_view=is_back_view,
            hand_foot_preset=request.hand_foot_preset or "neutral",
        )
    else:
        openpose_img = render_openpose_from_keypoints(
            None,
            include_face_features=False,
            is_back_view=is_back_view,
            hand_foot_preset=request.hand_foot_preset or "neutral",
        )

    depth_img = decode_image_fullres(request.depth_image) if request.depth_image else None
    user_photo_img = (
        decode_image_fullres(request.user_photo_image)
        if request.user_photo_image
        else None
    )
    face_img = (
        decode_image_fullres(request.face_image)
        if (request.include_my_face and request.face_image and not is_back_view)
        else None
    )

    def _progress_cb(phase: str, label: str, percent: int, step: int = 0, total_steps: int = 0) -> None:
        _set_tryon_progress(request.job_id, phase, label, percent, step, total_steps)

    with _gpu_task("try-on"):
        # On 24 GB+ GPUs, keep Qwen + Try-On co-resident; only spill unquantized text model if free VRAM < 2.2 GB!
        if IS_HIGH_VRAM_GPU:
            _free_cuda_vram(min_free_gb=2.2, offload_text=False, offload_vision=False)
        else:
            _free_cuda_vram(offload_text=True, offload_vision=True)

        try:
            gen_out = generate_sdxl_tryon(
                openpose_img=openpose_img,
                garments=request.garments,
                load_rgba_fn=load_garment_rgba,
                depth_img=depth_img,
                keypoints=request.keypoints,
                body_sliders=request.body_sliders,
                subject_mode=request.subject_mode,
                hand_foot_preset=request.hand_foot_preset,
                camera_preset=request.camera_preset,
                backdrop_preset=request.backdrop_preset,
                pose_label=request.pose_label,
                body_preset=request.body_preset,
                fit_style=request.fit_style,
                material_id=request.material_id,
                include_my_face=request.include_my_face and not is_back_view,
                face_img=face_img,
                user_photo_img=user_photo_img,
                photo_mode=norm_photo_mode,
                seed=request.seed,
                bypass_pose_cache=request.bypass_pose_cache,
                hf_token=HF_TOKEN,
                progress_cb=_progress_cb,
            )
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            import traceback

            traceback.print_exc()
            raise HTTPException(
                status_code=502,
                detail=f"Local Hybrid Try-On generation failed: {exc}",
            ) from exc

    rendered: Image.Image = gen_out["image"]
    jpeg_bytes = encode_jpeg_with_ai_disclosure(rendered, quality=93)
    b64 = base64.b64encode(jpeg_bytes).decode("ascii")
    _set_tryon_progress(request.job_id, "completed", "Try-On ready!", 100)
    return {
        "imageUrl": f"data:image/jpeg;base64,{b64}",
        "model": gen_out["model"],
        "runs": gen_out["runs"],
        "diagnostics": {
            "passes": gen_out["passes"],
            "stage1Cached": gen_out["stage1Cached"],
            "stage1Ms": gen_out["stage1Ms"],
            "stage2Ms": gen_out["stage2Ms"],
            "faceRefined": gen_out.get("faceRefined", False),
            "photoMode": gen_out.get("photoMode", norm_photo_mode),
            "dwposePreview": gen_out["dwposePreview"],
            "depthPreview": gen_out["depthPreview"],
            "maskPreview": gen_out["maskPreview"],
            "aiDisclosure": gen_out["aiDisclosure"],
        },
    }


if __name__ == "__main__":
    bind_host = os.environ.get("AI_SERVER_HOST", "127.0.0.1")
    bind_port = int(os.environ.get("AI_SERVER_PORT", "8000"))
    uvicorn.run(app, host=bind_host, port=bind_port)
