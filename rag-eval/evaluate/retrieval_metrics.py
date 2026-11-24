"""Métricas de recuperación sobre una corrida de collect.ts (sin llamadas de pago).

Un fragmento es relevante si contiene la cita de `expected_evidence` (o, si la cita quedó partida
entre fragmentos, al menos 70 % de sus secuencias de 4 palabras). La recuperación es una por
consulta y se comparte entre repeticiones, así que cada consulta cuenta una vez.

- Ranking evaluado: los candidatos (hasta 20, ordenados por similitud, sin umbral), que es lo que
  permite medir hit@k, recall@k, MRR y nDCG.
- `produccion`: lo que de verdad entra al prompt (tras el umbral 0,38 y el tope de 5).
- Efecto de los 512 caracteres: `embedHF` vectoriza solo los primeros 512 caracteres del fragmento.
  Se mide qué parte de la cita queda dentro de esa ventana y si eso se asocia con el rango.

Uso:
    python rag-eval/evaluate/retrieval_metrics.py --results rag-eval/results/<run_id>.jsonl
"""
from __future__ import annotations

import argparse
import json
import math
import re
import statistics as st
from pathlib import Path

VENTANA = 512
KS = (1, 3, 5, 10)


def norm(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip().lower()


def cita(evidencia: str) -> str:
    m = re.search(r"«(.+?)»", evidencia, re.S)
    return norm(m.group(1) if m else evidencia)


def shingles(t: str, n: int = 4) -> set[str]:
    w = re.findall(r"\w+", t)
    return {" ".join(w[i : i + n]) for i in range(len(w) - n + 1)}


def relevante(contenido: str, q: str) -> tuple[bool, float]:
    c = norm(contenido)
    if q in c:
        pos = c.index(q)
        dentro = max(0, min(len(q), VENTANA - pos)) / len(q)
        return True, dentro
    sq = shingles(q)
    if sq and len(sq & shingles(c)) / len(sq) >= 0.7:
        return True, 1.0
    return False, 0.0


def ndcg(rel: list[int], k: int, total: int) -> float:
    dcg = sum(r / math.log2(i + 2) for i, r in enumerate(rel[:k]))
    ideal = sum(1 / math.log2(i + 2) for i in range(min(total, k)))
    return dcg / ideal if ideal else 0.0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--results", required=True, type=Path)
    args = ap.parse_args()

    regs = [json.loads(l) for l in args.results.read_text(encoding="utf-8").splitlines() if l.strip()]
    regs = [r for r in regs if r["dataset"] == "conjunto"]
    por_q: dict[str, dict] = {}
    for r in regs:
        if r["query_id"] not in por_q and r.get("candidates_raw") is not None and not (
            r.get("error") and r["error"].get("stage") in ("configuracion", "embedding", "recuperacion")
        ):
            por_q[r["query_id"]] = r
    sin_recuperacion = sorted({r["query_id"] for r in regs} - set(por_q))

    filas = []
    for qid, r in por_q.items():
        q = cita(r["expected_evidence"])
        cand = sorted(r["candidates_raw"], key=lambda c: -c["similarity"])
        info = [relevante(c["content"], q) for c in cand]
        rel = [int(i[0]) for i in info]
        total = sum(rel)
        rangos = [i + 1 for i, x in enumerate(rel) if x]
        prod_ids = {c["chunk_id"] for c in r["retrieved_contexts"]}
        prod = any(relevante(c["content"], q)[0] for c in r["retrieved_contexts"])
        dentro = next((i[1] for i in info if i[0]), None)
        filas.append({
            "query_id": qid, "tipo": r["tipo"], "tema": r["tema_clave"], "n_relevantes": total,
            "rango": rangos[0] if rangos else None,
            "mrr": 1 / rangos[0] if rangos else 0.0,
            **{f"hit@{k}": int(any(x <= k for x in rangos)) for k in KS},
            **{f"recall@{k}": (sum(1 for x in rangos if x <= k) / total if total else 0.0) for k in KS},
            "ndcg@5": ndcg(rel, 5, total), "ndcg@10": ndcg(rel, 10, total),
            "produccion_hit": int(prod), "contexto_n": len(prod_ids),
            "cita_en_ventana": dentro,
        })

    def resumen(fs: list[dict], etiqueta: str) -> dict:
        if not fs:
            return {}
        d = {"grupo": etiqueta, "consultas": len(fs)}
        for k in ("mrr", *[f"hit@{k}" for k in KS], *[f"recall@{k}" for k in KS], "ndcg@5", "ndcg@10", "produccion_hit"):
            d[k] = round(st.mean(f[k] for f in fs), 3)
        return d

    grupos = [resumen(filas, "todas")] + [
        resumen([f for f in filas if f["tipo"] == t], t) for t in ("documental", "seguimiento")
    ]
    grupos = [g for g in grupos if g]
    print(f"Consultas evaluadas: {len(filas)} de {len({r['query_id'] for r in regs})}"
          f" · sin recuperación por error: {sin_recuperacion or 'ninguna'}")
    print("sin ningún fragmento relevante entre los candidatos:",
          sorted(f["query_id"] for f in filas if f["n_relevantes"] == 0) or "ninguna")
    cols = ["grupo", "consultas", "hit@1", "hit@3", "hit@5", "hit@10", "recall@5", "mrr", "ndcg@5", "produccion_hit"]
    print("\n" + "  ".join(f"{c:>14}" for c in cols))
    for g in grupos:
        print("  ".join(f"{g[c]!s:>14}" for c in cols))

    con = [f for f in filas if f["cita_en_ventana"] is not None]
    comp = [f for f in con if f["cita_en_ventana"] >= 0.999]
    parc = [f for f in con if f["cita_en_ventana"] < 0.999]
    print(f"\nEfecto de la ventana de {VENTANA} caracteres (consultas con fragmento relevante: {len(con)})")
    for nombre, g in (("cita completa dentro de la ventana", comp), ("cita parcial o fuera de la ventana", parc)):
        if g:
            print(f"  {nombre}: n={len(g)} · hit@1={st.mean(f['hit@1'] for f in g):.2f} · "
                  f"hit@5={st.mean(f['hit@5'] for f in g):.2f} · MRR={st.mean(f['mrr'] for f in g):.2f} · "
                  f"llega al prompt={st.mean(f['produccion_hit'] for f in g):.2f}")
        else:
            print(f"  {nombre}: n=0")

    out = args.results.with_suffix(".retrieval.json")
    out.write_text(json.dumps({"por_consulta": filas, "resumen": grupos, "sin_recuperacion": sin_recuperacion},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nDetalle: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
