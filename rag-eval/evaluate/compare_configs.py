"""Compara configuraciones del RAG contra la línea base, consulta por consulta.

Para cada métrica y cada configuración candidata:
  - se emparejan las consultas que tienen valor en las dos corridas (se informa cuántas quedan);
  - diferencia media (candidata - base) con intervalo de confianza del 95 % por bootstrap
    percentil sobre las consultas (10 000 remuestreos, semilla fija);
  - prueba de significancia pareada: McNemar exacto para métricas binarias (hit@k, llega al
    prompt) y Wilcoxon de rangos con signo para las continuas;
  - corrección de Holm sobre TODAS las pruebas de la invocación (la familia es todo lo que se
    compara en una ejecución).

Métricas: las de recuperación vienen de `<corrida>.retrieval.json` (retrieval_metrics.py) y las
de RAGAS de `<corrida>.ragas.jsonl` (ragas_metrics.py; Faithfulness y Answer Relevancy se
promedian por consulta sobre las repeticiones). Las que falten en una corrida se omiten y se
dice cuáles.

Uso:
    python rag-eval/evaluate/compare_configs.py \
        --baseline E0=rag-eval/results/E0-....jsonl \
        --candidate E1=rag-eval/results/E1-....jsonl [--candidate E2=...]
"""
from __future__ import annotations

import argparse
import json
import statistics as st
from pathlib import Path

import numpy as np
from scipy import stats

SEMILLA = 20261004
REMUESTREOS = 10_000
BINARIAS = {"hit@1", "hit@3", "hit@5", "produccion_hit"}
RETRIEVAL = ["hit@1", "hit@3", "hit@5", "mrr", "ndcg@5", "produccion_hit"]
RAGAS_GEN = ["faithfulness", "answer_relevancy"]
RAGAS_RET = ["context_recall", "context_precision"]


def cargar_jsonl(p: Path) -> list[dict]:
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


def metricas_por_consulta(jsonl: Path) -> dict[str, dict[str, float]]:
    """{métrica: {query_id: valor}} de una corrida."""
    out: dict[str, dict[str, float]] = {}
    ret = jsonl.with_suffix(".retrieval.json")
    if ret.exists():
        for f in json.loads(ret.read_text(encoding="utf-8"))["por_consulta"]:
            for m in RETRIEVAL:
                if f.get(m) is not None:
                    out.setdefault(m, {})[f["query_id"]] = float(f[m])
    rag = jsonl.with_suffix(".ragas.jsonl")
    if rag.exists():
        acum: dict[tuple[str, str], list[float]] = {}
        for r in cargar_jsonl(rag):
            for m in RAGAS_GEN + RAGAS_RET:
                if r.get(m) is not None:
                    acum.setdefault((m, r["query_id"]), []).append(float(r[m]))
        for (m, q), v in acum.items():
            out.setdefault(m, {})[q] = st.mean(v)
    return out


def bootstrap_ic(d: np.ndarray, rng: np.random.Generator) -> tuple[float, float]:
    idx = rng.integers(0, len(d), size=(REMUESTREOS, len(d)))
    medias = d[idx].mean(axis=1)
    return float(np.percentile(medias, 2.5)), float(np.percentile(medias, 97.5))


def p_valor(a: np.ndarray, b: np.ndarray, binaria: bool) -> tuple[float | None, str]:
    d = b - a
    if not np.any(d != 0):
        return 1.0, "sin diferencias"
    if binaria:
        mejora = int(np.sum((a == 0) & (b == 1)))
        empeora = int(np.sum((a == 1) & (b == 0)))
        return float(stats.binomtest(mejora, mejora + empeora, 0.5).pvalue), "McNemar exacto"
    return float(stats.wilcoxon(a, b, zero_method="wilcox").pvalue), "Wilcoxon"


def holm(ps: list[float]) -> list[float]:
    m = len(ps)
    orden = sorted(range(m), key=lambda i: ps[i])
    aj = [0.0] * m
    previo = 0.0
    for rango, i in enumerate(orden):
        previo = max(previo, min(1.0, (m - rango) * ps[i]))
        aj[i] = previo
    return aj


def parse(par: str) -> tuple[str, Path]:
    nombre, _, ruta = par.partition("=")
    if not ruta:
        raise SystemExit(f"Se esperaba NOMBRE=ruta, llegó «{par}».")
    return nombre, Path(ruta)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--baseline", required=True, help="NOMBRE=ruta/corrida.jsonl")
    ap.add_argument("--candidate", required=True, action="append", help="NOMBRE=ruta/corrida.jsonl")
    ap.add_argument("--out", type=Path, help="CSV de salida (opcional)")
    args = ap.parse_args()

    bnombre, bruta = parse(args.baseline)
    base = metricas_por_consulta(bruta)
    rng = np.random.default_rng(SEMILLA)
    filas, omitidas = [], []

    for par in args.candidate:
        cnombre, cruta = parse(par)
        cand = metricas_por_consulta(cruta)
        for m in RETRIEVAL + RAGAS_RET + RAGAS_GEN:
            if m not in base or m not in cand:
                omitidas.append(f"{cnombre}:{m}")
                continue
            ids = sorted(set(base[m]) & set(cand[m]))
            if len(ids) < 5:
                omitidas.append(f"{cnombre}:{m} (solo {len(ids)} consultas emparejadas)")
                continue
            a = np.array([base[m][i] for i in ids])
            b = np.array([cand[m][i] for i in ids])
            d = b - a
            lo, hi = bootstrap_ic(d, rng)
            p, prueba = p_valor(a, b, m in BINARIAS)
            filas.append({"candidata": cnombre, "metrica": m, "n": len(ids),
                          "descartadas": max(len(base[m]), len(cand[m])) - len(ids),
                          "base": float(a.mean()), "cand": float(b.mean()), "dif": float(d.mean()),
                          "ic_lo": lo, "ic_hi": hi, "p": p, "prueba": prueba})

    if not filas:
        print("No hay métricas comparables.", "Omitidas:", omitidas)
        return 1
    for f, pa in zip(filas, holm([f["p"] for f in filas])):
        f["p_holm"] = pa

    print(f"Base: {bnombre} · familia de {len(filas)} pruebas (Holm) · bootstrap {REMUESTREOS} remuestreos")
    print(f"{'cand':<6}{'métrica':<18}{'n':>4}{'base':>8}{'cand':>8}{'dif':>8}   {'IC 95 %':<18}{'p':>8}{'p Holm':>8}  prueba")
    for f in filas:
        marca = "*" if f["p_holm"] < 0.05 else " "
        print(f"{f['candidata']:<6}{f['metrica']:<18}{f['n']:>4}{f['base']:>8.3f}{f['cand']:>8.3f}{f['dif']:>+8.3f}   "
              f"[{f['ic_lo']:+.3f}, {f['ic_hi']:+.3f}] {f['p']:>8.4f}{f['p_holm']:>8.4f}{marca} {f['prueba']}")
    print("* = significativa tras Holm (alfa 0,05). Sin * no se afirma diferencia.")
    if omitidas:
        print("Omitidas por falta de datos:", ", ".join(omitidas))

    if args.out:
        import csv
        with args.out.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(filas[0]))
            w.writeheader()
            w.writerows(filas)
        print(f"CSV: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
