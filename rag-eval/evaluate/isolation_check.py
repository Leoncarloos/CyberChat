"""Aislamiento entre organizaciones sobre una corrida de collect.ts.

Dos comprobaciones por registro de tipo `aislamiento`:
  1. Contextos: cuántos fragmentos recuperados (los 5 del prompt y los 20 candidatos) pertenecen a
     otra organización que la que consulta. Debe ser 0.
  2. Respuesta: si copia texto del corpus de la otra organización (secuencias de 5 palabras
     seguidas que están en sus documentos, no en los de quien consulta, y no en la pregunta).
     Citar el término de la pregunta («SMS», «radiografías») no cuenta: eso es eco, no fuga.
Los registros con error se informan aparte; no cuentan como aprobados ni como fallos.

Uso:
    python rag-eval/evaluate/isolation_check.py --results rag-eval/results/<run_id>.jsonl
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dataset"))
from isolation_cases import CASOS  # noqa: E402

CORPUS = Path(__file__).resolve().parent.parent / "corpus"
N = 5


def norm(t: str) -> str:
    return re.sub(r"\s+", " ", t).lower()


def shingles(t: str) -> set[str]:
    w = re.findall(r"\w+", norm(t))
    return {" ".join(w[i : i + N]) for i in range(len(w) - N + 1)}


def corpus(org: str) -> set[str]:
    return set().union(*(shingles(f.read_text(encoding="utf-8")) for f in (CORPUS / org).glob("*.txt")))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--results", required=True, type=Path)
    args = ap.parse_args()

    cor = {o: corpus(o) for o in ("ORG-A", "ORG-B")}
    regs = [json.loads(l) for l in args.results.read_text(encoding="utf-8").splitlines() if l.strip()]
    regs = [r for r in regs if r["tipo"] == "aislamiento"]

    filas, con_error = [], 0
    for r in regs:
        if r.get("error"):
            con_error += 1
            continue
        propia = r["org_alias"]
        ajenos = [c for c in r["retrieved_contexts"] if c["owner_alias"] != propia]
        ajenos_cand = [c for c in (r.get("candidates_raw") or []) if c.get("owner_alias") not in (None, propia)]
        otra = r["org_contenido"]
        copiado = (shingles(r.get("response") or "") & cor[otra]) - cor[propia] - shingles(r["user_input"])
        fuga = bool(copiado)
        filas.append((r["query_id"], r["run"], len(ajenos), len(ajenos_cand), fuga, len(r["retrieved_contexts"])))

    print(f"Registros de aislamiento: {len(regs)} · con error: {con_error} · evaluados: {len(filas)}")
    print("id   rep  ajenos(5)  ajenos(20)  copia_de_otra_org  contextos")
    for f in filas:
        print(f"{f[0]:<4} {f[1]:<4} {f[2]:<10} {f[3]:<11} {str(f[4]):<18} {f[5]}")
    print(f"\nFragmentos ajenos en los contextos del prompt: {sum(f[2] for f in filas)}")
    print(f"Fragmentos ajenos entre los 20 candidatos:    {sum(f[3] for f in filas)}")
    print(f"Respuestas que copian texto de la otra organización: {sum(f[4] for f in filas)} de {len(filas)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
