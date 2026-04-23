from fastapi import APIRouter
from pydantic import BaseModel
from app.llm import chat_json

router = APIRouter()

class TranslateRequest(BaseModel):
    texts: list[str]

@router.post("/")
def translate_texts(req: TranslateRequest):
    if not req.texts:
        return {"translations": []}

    prompt = "Translate each English headline to natural Korean. Keep company/product names in English.\n\n"
    for i, t in enumerate(req.texts):
        prompt += f"{i+1}. {t}\n"
    prompt += f'\nRespond ONLY with JSON: {{"translations": ["한국어1", "한국어2", ...]}}'

    try:
        result = chat_json(
            system="You are a translator. Translate English financial news headlines to Korean. Be concise and natural.",
            user=prompt,
            tier="fast",
            temperature=0,
            max_tokens=1000,
        )
        return {"translations": result.get("translations", req.texts)}
    except Exception:
        return {"translations": req.texts}
