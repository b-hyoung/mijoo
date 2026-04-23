# backend/app/llm.py
"""LLM abstraction layer — OpenAI only."""

import json
from app.config import settings

MODEL_MAP = {"strong": "gpt-4o", "fast": "gpt-4o-mini"}


def get_model(tier: str = "fast") -> str:
    return MODEL_MAP[tier]


def chat(
    system: str,
    user: str,
    tier: str = "fast",
    temperature: float = 0.3,
    max_tokens: int = 500,
    json_mode: bool = False,
) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)
    model = MODEL_MAP[tier]

    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content.strip()


def chat_json(
    system: str,
    user: str,
    tier: str = "fast",
    temperature: float = 0.3,
    max_tokens: int = 500,
) -> dict:
    raw = chat(system, user, tier, temperature, max_tokens, json_mode=True)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        if "{" in raw:
            try:
                start = raw.index("{")
                end = raw.rindex("}") + 1
                return json.loads(raw[start:end])
            except (ValueError, json.JSONDecodeError):
                pass
        return {}
