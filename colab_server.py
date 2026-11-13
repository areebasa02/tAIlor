"""OpenAI-compatible Qwen server for local GPU or Google Colab.

In Colab, install the dependencies, set LLM_MODEL if needed, and run this
file. Expose port 8000 with a tunnel and set LLM_BASE_URL in tAIlor to the
tunnel URL ending in /v1.
"""

import os
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer
import uvicorn

def load_local_env():
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = value.strip().strip("\"'")


load_local_env()
MODEL_ID = os.environ.get("LLM_MODEL", "Qwen/Qwen2.5-3B-Instruct")
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HF_API_KEY")
app = FastAPI()
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    token=HF_TOKEN,
    torch_dtype=torch.float16,
    device_map="auto",
)


class Message(BaseModel):
    role: str
    content: str


class CompletionRequest(BaseModel):
    model: str
    messages: list[Message]
    max_tokens: int = 300
    temperature: float = 0.7


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_ID}


@app.post("/v1/chat/completions")
def chat_completion(request: CompletionRequest):
    prompt = tokenizer.apply_chat_template(
        [message.model_dump() for message in request.messages],
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.inference_mode():
        output = model.generate(
            **inputs,
            max_new_tokens=request.max_tokens,
            temperature=request.temperature,
            do_sample=request.temperature > 0,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = output[0][inputs["input_ids"].shape[1]:]
    text = tokenizer.decode(generated, skip_special_tokens=True).strip()
    if not text:
        raise HTTPException(status_code=502, detail="The model returned an empty response.")
    return {
        "id": "tAIlor-local-completion",
        "object": "chat.completion",
        "model": MODEL_ID,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
