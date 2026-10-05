"""Informe de una corrida: tablas en Markdown y gráficos PNG (paleta gris y azul #1F3A5F).

Reúne lo que producen los demás scripts para una corrida:
  <run>.jsonl           (collect.ts)            denominadores, errores, aislamiento
  <run>.meta.json       (collect.ts)            configuración, commit, huellas del corpus
  <run>.retrieval.json  (retrieval_metrics.py)  recuperación y efecto de la ventana de 512
  <run>.ragas.jsonl     (ragas_metrics.py)      métricas RAGAS

Con `--compare comparacion.csv` (salida de compare_configs.py) agrega la tabla de comparación.
Escribe results/<run_id>_informe/informe.md y las figuras. No inventa nada: lo que falta se
declara como no disponible.

Uso:
    python rag-eval/evaluate/report.py --results rag-eval/results/<run_id>.jsonl [--compare c.csv]
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import statistics as st
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

AZUL = "#1F3A5F"
GRIS = "#8A9099"
GRIS_OSC = "#4A4F57"
GRIS_CLARO = "#C9CDD3"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
    "axes.edgecolor": GRIS_OSC, "axes.labelcolor": GRIS_OSC, "xtick.color": GRIS_OSC, "ytick.color": GRIS_OSC,
})


def jl(p: Path) -> list[dict]:
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


def media(v: list[float]) -> float | None:
    return st.mean(v) if v else None


def fmt(x: float | None, d: int = 2) -> str:
    return "n/d" if x is None else f"{x:.{d}f}".replace(".", ",")


def barras_agrupadas(ruta: Path, titulo: str, etiquetas: list[str], series: dict[str, list[float | None]]) -> None:
    colores = [AZUL, GRIS, GRIS_CLARO]
    fig, ax = plt.subplots(figsize=(7.5, 3.8), dpi=160)
    n = len(series)
    ancho = 0.8 / n
    for j, (nombre, vals) in enumerate(series.items()):
        xs = [i + (j - (n - 1) / 2) * ancho for i in range(len(etiquetas))]
        v = [0 if x is None else x for x in vals]
        ax.bar(xs, v, ancho * 0.92, label=nombre, color=colores[j % 3])
        for x, y, orig in zip(xs, v, vals):
            ax.text(x, y + 0.015, "n/d" if orig is None else f"{y:.2f}".replace(".", ","), ha="center", fontsize=8, color=GRIS_OSC)
    ax.set_xticks(range(len(etiquetas)), etiquetas)
    ax.set_ylim(0, 1.1)
    ax.set_title(titulo, loc="left", color=AZUL, fontweight="bold")
    ax.legend(frameon=False, loc="upper right", ncol=n)
    fig.tight_layout()
    fig.savefig(ruta)
    plt.close(fig)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--results", required=True, type=Path)
    ap.add_argument("--compare", type=Path, help="CSV de compare_configs.py")
    args = ap.parse_args()

    base = args.results
    meta = json.loads(base.with_suffix(".meta.json").read_text(encoding="utf-8"))
    regs = jl(base)
    run_id = meta["run_id"]
    out = base.parent / f"{run_id}_informe"
    out.mkdir(exist_ok=True)

    ret_p, rag_p = base.with_suffix(".retrieval.json"), base.with_suffix(".ragas.jsonl")
    ret = json.loads(ret_p.read_text(encoding="utf-8")) if ret_p.exists() else None
    rag = jl(rag_p) if rag_p.exists() else []

    L: list[str] = [f"# Informe de la corrida {run_id}", ""]

    # --- Identificación
    L += ["## 1. Identificación", "",
          "| Dato | Valor |", "|---|---|",
          f"| Configuración | {meta['config'].get('config_id')} — {meta['config'].get('description', '')[:90]} |",
          f"| Generador | {meta['config']['generator']['model']} (temperatura {meta['config']['generator']['temperature']}) |",
          f"| Commit | `{meta['git_commit'][:10]}`{' (árbol con cambios sin commitear)' if meta.get('git_dirty') else ''} |",
          f"| `corpus_hash` | `{meta['corpus_hash'][:16]}…` |",
          f"| `index_hash` | `{meta['index_hash'][:16]}…` |",
          f"| Juez RAGAS | {next((r['judge'] for r in rag if r.get('judge')), 'no disponible')} |",
          f"| Registros | {meta['records']} ({meta['records_with_error']} con error) |", ""]

    # --- Denominadores
    conj = [r for r in regs if r["dataset"] == "conjunto"]
    consultas = {r["query_id"] for r in conj}
    errores = collections.Counter((r["error"] or {}).get("stage") for r in conj if r.get("error"))
    sin_ctx = sorted({r["query_id"] for r in conj if not r.get("error") and not r["retrieved_contexts"]})
    L += ["## 2. Denominadores", "",
          f"- Conjunto principal: **{len(consultas)} consultas**, {len(conj)} registros (3 repeticiones).",
          f"- Registros con error del sistema evaluado: **{sum(errores.values())}**"
          + (f" ({', '.join(f'{k}: {v}' for k, v in errores.items())})." if errores else "."),
          f"- Consultas sin ningún fragmento sobre el umbral: **{len(sin_ctx)}** ({', '.join(sin_ctx) or 'ninguna'}). "
          "En esos casos el chat responde sin documentos y RAGAS no puntúa la fidelidad.", ""]
    if rag:
        gen = [r for r in rag if r["metric_scope"] == "generation"]
        saltos = collections.Counter(str(r.get("skipped"))[:45] for r in rag if r["metric_scope"] == "skip")
        L += [f"- Respuestas puntuadas por el juez: **{len(gen)}**; sin puntuar: **{sum(saltos.values())}**.", ""]

    # --- Recuperación
    if ret:
        res = {g["grupo"]: g for g in ret["resumen"]}
        L += ["## 3. Recuperación", "",
              "Relevante = fragmento que contiene la cita de `expected_evidence`. Una recuperación por consulta.", "",
              "| Grupo | Consultas | hit@1 | hit@3 | hit@5 | MRR | nDCG@5 | Llega al prompt |", "|---|---|---|---|---|---|---|---|"]
        for g in ("todas", "documental", "seguimiento"):
            if g in res:
                x = res[g]
                L.append(f"| {g} | {x['consultas']} | {fmt(x['hit@1'])} | {fmt(x['hit@3'])} | {fmt(x['hit@5'])} | "
                         f"{fmt(x['mrr'])} | {fmt(x['ndcg@5'])} | {fmt(x['produccion_hit'])} |")
        L += ["", "Cada empresa tiene pocos fragmentos, así que hit@10 es casi trivial y no se informa como resultado.", ""]
        barras_agrupadas(out / "recuperacion.png", "Recuperación por tipo de consulta",
                         ["hit@1", "hit@3", "hit@5", "MRR", "Llega al prompt"],
                         {g: [res[g][k] for k in ("hit@1", "hit@3", "hit@5", "mrr", "produccion_hit")]
                          for g in ("documental", "seguimiento") if g in res})
        L += ["![Recuperación](recuperacion.png)", ""]

        pc = ret["por_consulta"]
        comp = [f for f in pc if f["cita_en_ventana"] is not None and f["cita_en_ventana"] >= 0.999]
        parc = [f for f in pc if f["cita_en_ventana"] is not None and f["cita_en_ventana"] < 0.999]
        if comp and parc:
            L += ["### Efecto de la ventana de 512 caracteres", "",
                  "| Cita relevante | Consultas | hit@1 | MRR | Llega al prompt |", "|---|---|---|---|---|"]
            for nombre, g in (("completa dentro de la ventana", comp), ("parcial o fuera", parc)):
                L.append(f"| {nombre} | {len(g)} | {fmt(media([f['hit@1'] for f in g]))} | "
                         f"{fmt(media([f['mrr'] for f in g]))} | {fmt(media([f['produccion_hit'] for f in g]))} |")
            L += ["", "Asociación observada, sin controlar otras causas (los fragmentos largos pueden ser más genéricos).", ""]
            barras_agrupadas(out / "ventana_512.png", "Efecto de la ventana de 512 caracteres",
                             ["hit@1", "MRR", "Llega al prompt"],
                             {"Cita completa": [media([f[k] for f in comp]) for k in ("hit@1", "mrr", "produccion_hit")],
                              "Cita parcial o fuera": [media([f[k] for f in parc]) for k in ("hit@1", "mrr", "produccion_hit")]})
            L += ["![Ventana de 512](ventana_512.png)", ""]

        rangos = collections.Counter(min(f["rango"], 6) if f["rango"] else 0 for f in pc)
        fig, ax = plt.subplots(figsize=(6.5, 3.2), dpi=160)
        etq = ["1", "2", "3", "4", "5", "6 o más"]
        vals = [rangos.get(i, 0) for i in range(1, 7)]
        ax.bar(etq, vals, color=[AZUL] + [GRIS] * 5)
        for i, v in enumerate(vals):
            ax.text(i, v + 0.5, str(v), ha="center", fontsize=8, color=GRIS_OSC)
        ax.set_xlabel("Posición del primer fragmento relevante")
        ax.set_ylabel("Consultas")
        ax.set_title("Dónde aparece el fragmento correcto", loc="left", color=AZUL, fontweight="bold")
        fig.tight_layout()
        fig.savefig(out / "rango.png")
        plt.close(fig)
        L += ["![Rango](rango.png)", ""]
    else:
        L += ["## 3. Recuperación", "", "No disponible: falta `retrieval_metrics.py`.", ""]

    # --- RAGAS
    if rag:
        tipo_de = {r["query_id"]: r["tipo"] for r in conj}
        def vals(m: str, tipo: str | None) -> list[float]:
            return [r[m] for r in rag if r.get(m) is not None and (tipo is None or tipo_de.get(r["query_id"]) == tipo)]
        mets = [("context_recall", "Context Recall"), ("context_precision", "Context Precision"),
                ("faithfulness", "Faithfulness"), ("answer_relevancy", "Answer Relevancy")]
        L += ["## 4. Métricas RAGAS", "",
              "| Métrica | Todas | Documental | Seguimiento | n |", "|---|---|---|---|---|"]
        for m, n in mets:
            L.append(f"| {n} | {fmt(media(vals(m, None)))} | {fmt(media(vals(m, 'documental')))} | "
                     f"{fmt(media(vals(m, 'seguimiento')))} | {len(vals(m, None))} |")
        L += ["",
              "> **Cautela.** Un solo juez, una sola ejecución y sin intervalos de confianza. Faithfulness no está "
              "validada contra la revisión humana (`human_review.py`); no debe citarse como resultado hasta entonces.", ""]
        barras_agrupadas(out / "ragas.png", "Métricas RAGAS por tipo de consulta", [n for _, n in mets],
                         {t: [media(vals(m, t)) for m, _ in mets] for t in ("documental", "seguimiento")})
        L += ["![RAGAS](ragas.png)", ""]
    else:
        L += ["## 4. Métricas RAGAS", "", "No disponible: falta `ragas_metrics.py`.", ""]

    # --- Aislamiento
    aisl = [r for r in regs if r["tipo"] == "aislamiento" and not r.get("error")]
    if aisl:
        ajenos = sum(1 for r in aisl for c in r["retrieved_contexts"] if c["owner_alias"] != r["org_alias"])
        cand = sum(1 for r in aisl for c in (r.get("candidates_raw") or []) if c["owner_alias"] != r["org_alias"])
        L += ["## 5. Aislamiento entre organizaciones", "",
              f"- Registros evaluados: {len(aisl)}. Fragmentos ajenos en el prompt: **{ajenos}**; entre los candidatos ampliados: **{cand}**.",
              "- La copia de texto en las respuestas se revisa con `isolation_check.py`.", ""]

    # --- Comparación
    if args.compare and args.compare.exists():
        filas = list(csv.DictReader(args.compare.open(encoding="utf-8")))
        L += ["## 6. Comparación con la línea base", "",
              "| Candidata | Métrica | n | Base | Cand. | Dif. | IC 95 % | p Holm |", "|---|---|---|---|---|---|---|---|"]
        for f in filas:
            sig = " *" if float(f["p_holm"]) < 0.05 else ""
            L.append(f"| {f['candidata']} | {f['metrica']} | {f['n']} | {fmt(float(f['base']), 3)} | {fmt(float(f['cand']), 3)} | "
                     f"{float(f['dif']):+.3f} | [{float(f['ic_lo']):+.3f}, {float(f['ic_hi']):+.3f}] | {fmt(float(f['p_holm']), 4)}{sig} |")
        L += ["", "\\* significativa tras la corrección de Holm (alfa 0,05).", ""]

    (out / "informe.md").write_text("\n".join(L), encoding="utf-8")
    print(f"Informe: {out / 'informe.md'}")
    print("Figuras:", ", ".join(sorted(p.name for p in out.glob('*.png'))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
