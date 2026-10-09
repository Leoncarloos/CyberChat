"""Compara el servicio de embeddings con los vectores ya guardados en document_chunks."""
import json
import math
import os
import sys

import requests

URL = os.environ["EMBED_URL"]
KEY = os.environ.get("EMBED_API_KEY")
SUPA = os.environ["SUPABASE_URL"].rstrip("/")
SKEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
N = int(os.environ.get("N", "8"))


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


rows = requests.get(
    f"{SUPA}/rest/v1/document_chunks?select=content,embedding&limit={N}",
    headers={"apikey": SKEY, "Authorization": f"Bearer {SKEY}"},
    timeout=30,
).json()
headers = {"Content-Type": "application/json"}
if KEY:
    headers["Authorization"] = f"Bearer {KEY}"

peor = 1.0
for r in rows:
    guardado = json.loads(r["embedding"]) if isinstance(r["embedding"], str) else r["embedding"]
    texto = " ".join(r["content"].split())[:512]
    nuevo = requests.post(URL, headers=headers, json={"inputs": texto}, timeout=90).json()
    c = cosine(guardado, nuevo)
    peor = min(peor, c)
    print(f"{c:.6f}  {texto[:60]!r}")
print(f"\nPeor similitud: {peor:.6f} -> {'OK' if peor >= 0.999 else 'REVISAR'}")
sys.exit(0 if peor >= 0.999 else 1)
