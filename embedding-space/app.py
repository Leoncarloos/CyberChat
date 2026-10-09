"""Servicio de embeddings con el mismo modelo que usa CyberChat.

Responde igual que el pipeline `feature-extraction` de Hugging Face: un vector plano de 384
números, sin normalizar (mean pooling), para que los vectores ya indexados sigan siendo válidos.
"""
import os
from typing import List, Union

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
API_KEY = os.environ.get("EMBED_API_KEY")

model = SentenceTransformer(MODEL_NAME, device="cpu")
app = FastAPI()


class EmbedRequest(BaseModel):
    inputs: Union[str, List[str]]
    options: dict | None = None


def check_key(authorization: str | None = Header(default=None)):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="No autorizado")


@app.get("/")
def health():
    return {"status": "ok", "model": MODEL_NAME, "dimensions": model.get_sentence_embedding_dimension()}


@app.post("/", dependencies=[Depends(check_key)])
@app.post("/embed", dependencies=[Depends(check_key)])
def embed(req: EmbedRequest):
    vectors = model.encode(req.inputs, convert_to_numpy=True, normalize_embeddings=False)
    return vectors.tolist()
