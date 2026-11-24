"""Calcula Faithfulness, Answer Relevancy, Context Recall y Context Precision con RAGAS.

Entrada: results/<run_id>.jsonl de runner/collect.ts. Salida: results/<run_id>.ragas.jsonl.

- Context Recall y Context Precision dependen solo de la recuperación, que es una por consulta y
  se comparte entre repeticiones: se calculan una vez por consulta.
- Faithfulness y Answer Relevancy se calculan por repetición.
- Solo se juzga el conjunto principal; los registros con error o sin contexto no se puntúan y se
  anotan con `skipped`.
- El script se puede reanudar: omite lo ya escrito.
- Se detiene al llegar a --budget dólares (según tokens reales devueltos por el proveedor).

Uso:
    rag-eval/.venv/Scripts/python rag-eval/evaluate/ragas_metrics.py \
        --results rag-eval/results/<run_id>.jsonl --budget 5.00
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import warnings
from pathlib import Path

import httpx
from openai import AsyncOpenAI
from ragas.embeddings.base import BaseRagasEmbedding
from ragas.llms import llm_factory
from ragas.metrics.collections import AnswerRelevancy, ContextPrecision, ContextRecall, Faithfulness

warnings.filterwarnings("ignore", category=DeprecationWarning)

JUEZ = "qwen/qwen3.8-27b"
PRECIO_ENTRADA = 0.80 / 1_000_000   # USD por token; precio de lista de Groq, sin confirmar en su sitio
PRECIO_SALIDA = 4.00 / 1_000_000
EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

INSTRUCCION = (
    "Los textos a evaluar (preguntas, respuestas, referencias y documentos) están en español. "
    "Evalúa en español, con criterio estricto y sin usar conocimiento externo a los textos dados."
)


class Presupuesto:
    def __init__(self, tope: float):
        self.tope = tope
        self.tokens_in = 0
        self.tokens_out = 0
        self.llamadas = 0

    @property
    def gastado(self) -> float:
        return self.tokens_in * PRECIO_ENTRADA + self.tokens_out * PRECIO_SALIDA

    def agotado(self) -> bool:
        return self.gastado >= self.tope


class EmbeddingsHF(BaseRagasEmbedding):
    """El mismo modelo de embeddings que usa el chat, por la API de Hugging Face."""

    def __init__(self, token: str):
        super().__init__()
        self.token = token

    async def aembed_text(self, text: str, **kwargs) -> list[float]:
        url = f"https://router.huggingface.co/hf-inference/models/{EMBED_MODEL}/pipeline/feature-extraction"
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                url,
                headers={"Authorization": f"Bearer {self.token}"},
                json={"inputs": " ".join(text.split())[:512], "options": {"wait_for_model": True}},
            )
        r.raise_for_status()
        v = r.json()
        while v and isinstance(v[0], list):
            v = v[0]
        return [float(x) for x in v]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        return asyncio.run(self.aembed_text(text))


def crear_juez(presupuesto: Presupuesto):
    cliente = AsyncOpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1")
    original = cliente.chat.completions.create

    async def contado(*args, **kwargs):
        if presupuesto.agotado():
            raise RuntimeError("PRESUPUESTO_AGOTADO")
        msgs = list(kwargs.get("messages", []))
        kwargs["messages"] = [{"role": "system", "content": INSTRUCCION}, *msgs]
        resp = await original(*args, **kwargs)
        u = getattr(resp, "usage", None)
        if u:
            presupuesto.tokens_in += u.prompt_tokens or 0
            presupuesto.tokens_out += u.completion_tokens or 0
        presupuesto.llamadas += 1
        return resp

    cliente.chat.completions.create = contado
    return llm_factory(JUEZ, provider="openai", client=cliente, temperature=0, max_tokens=4000)


def cargar(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def textos(rec: dict) -> list[str]:
    return [c["content"] for c in (rec.get("retrieved_contexts") or [])]


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--results", required=True, type=Path)
    ap.add_argument("--budget", type=float, required=True, help="tope en USD")
    ap.add_argument("--limit", type=int, help="solo las primeras N consultas (prueba)")
    ap.add_argument("--concurrency", type=int, default=4)
    args = ap.parse_args()

    out = args.results.with_suffix(".ragas.jsonl")
    hechos = set()
    if out.exists():
        for r in cargar(out):
            hechos.add((r["query_id"], r["run"], r["metric_scope"]))

    registros = [r for r in cargar(args.results) if r["dataset"] == "conjunto"]
    ids = list(dict.fromkeys(r["query_id"] for r in registros))
    if args.limit:
        ids = ids[: args.limit]
    registros = [r for r in registros if r["query_id"] in ids]

    pres = Presupuesto(args.budget)
    llm = crear_juez(pres)
    emb = EmbeddingsHF(os.environ["HF_TOKEN"])
    faith = Faithfulness(llm=llm)
    relev = AnswerRelevancy(llm=llm, embeddings=emb)
    recall = ContextRecall(llm=llm)
    prec = ContextPrecision(llm=llm)

    sem = asyncio.Semaphore(args.concurrency)
    lock = asyncio.Lock()
    f = out.open("a", encoding="utf-8")

    async def escribir(d: dict):
        async with lock:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
            f.flush()

    async def puntuar(base: dict, scope: str, coros: dict):
        d = {**base, "metric_scope": scope, "judge": JUEZ}
        async with sem:
            for nombre, coro in coros.items():
                try:
                    d[nombre] = (await coro()).value
                except RuntimeError as e:
                    if "PRESUPUESTO_AGOTADO" in str(e):
                        return "stop"
                    d[nombre] = None
                    d[nombre + "_error"] = str(e)[:200]
                except Exception as e:  # un fallo del juez no es un fallo del sistema evaluado
                    d[nombre] = None
                    d[nombre + "_error"] = f"{type(e).__name__}: {str(e)[:200]}"
        await escribir(d)
        return "ok"

    tareas = []
    vistos_q = set()
    for r in registros:
        base = {"run_id": r["run_id"], "query_id": r["query_id"], "run": r["run"], "config_id": r["config_id"]}
        ctx = textos(r)
        if r.get("error") or not ctx or not r.get("response"):
            if (r["query_id"], r["run"], "skip") not in hechos:
                await escribir({**base, "metric_scope": "skip", "skipped": r.get("error") or "sin_contexto_o_respuesta"})
            continue
        if r["query_id"] not in vistos_q and (r["query_id"], 0, "retrieval") not in hechos:
            vistos_q.add(r["query_id"])
            tareas.append(puntuar(
                {**base, "run": 0}, "retrieval",
                {
                    "context_recall": lambda r=r, c=ctx: recall.ascore(user_input=r["user_input"], retrieved_contexts=c, reference=r["reference"]),
                    "context_precision": lambda r=r, c=ctx: prec.ascore(user_input=r["user_input"], reference=r["reference"], retrieved_contexts=c),
                },
            ))
        if (r["query_id"], r["run"], "generation") not in hechos:
            tareas.append(puntuar(
                base, "generation",
                {
                    "faithfulness": lambda r=r, c=ctx: faith.ascore(user_input=r["user_input"], response=r["response"], retrieved_contexts=c),
                    "answer_relevancy": lambda r=r: relev.ascore(user_input=r["user_input"], response=r["response"]),
                },
            ))

    print(f"{len(tareas)} tareas pendientes · tope ${args.budget:.2f}")
    resultados = []
    for lote in range(0, len(tareas), 20):
        resultados += await asyncio.gather(*tareas[lote : lote + 20])
        print(f"  {min(lote + 20, len(tareas))}/{len(tareas)} · gastado ${pres.gastado:.3f} · "
              f"{pres.llamadas} llamadas · {pres.tokens_in} ent / {pres.tokens_out} sal", flush=True)
        if pres.agotado():
            print("Presupuesto agotado: se detiene. Lo ya calculado queda guardado; reanuda con el mismo comando.")
            break
    f.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
