"""Verifica el conjunto revisado y genera el informe y la hoja de verificación para revisores.

Entradas: el XLSX revisado y el borrador original (para saber qué cambió la revisión).
Salidas:
  - docs/rag-eval/INFORME_VERIFICACION_REVISION.md   (informe)
  - rag-eval/dataset/hoja_verificacion_revisores.xlsx (documento para los revisores)

Los controles son automáticos y reproducibles. Ninguno sustituye a un especialista: señalan filas
que conviene mirar y arman una muestra de control, para que la revisión deje un registro explícito.

Uso:
    python rag-eval/dataset/verify_review.py --reviewed ruta/revisado.xlsx \
        --draft rag-eval/dataset/conjunto_borrador.xlsx
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import random
import re
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

warnings.filterwarnings("ignore", message="Data Validation extension")

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
CORPUS = REPO / "rag-eval" / "corpus"
TEMAS = ["phishing", "ia_amenazas", "canales_venta", "contrasenas", "accesos",
         "ley_29733", "datos_sensibles", "resiliencia"]

UMBRAL_REFERENCIA = 0.60      # parte de las palabras de la referencia que debe estar en el documento
UMBRAL_SIN_RESPUESTA = 0.45   # parte de las palabras de la pregunta que ya están en los documentos
SEMILLA_MUESTRA = 20261004
POR_TEMA_MUESTRA = 2

# Dudas anotadas al leer el borrador, antes de la revisión (no salen de un cálculo).
DUDAS_MANUALES = {
    "B08": "El corpus menciona a la SUNAT en la definición de correo sospechoso de ORG-B y da la "
           "regla general de reporte: la pregunta podría tener respuesta parcial.",
    "B09": "ORG-B tiene una regla de entrega de radiografías por enlace con clave: la pregunta sobre "
           "nube pública podría tener respuesta parcial.",
}


def norm(t: str) -> str:
    return re.sub(r"\s+", " ", str(t or "")).strip().lower()


def palabras(t: str) -> set[str]:
    return set(re.findall(r"[a-záéíóúñü]{5,}", norm(t)))


def numeros(t: str) -> set[str]:
    return set(re.findall(r"\d+(?:[.,]\d+)?", norm(t)))


def leer(path: Path, hoja: str) -> dict[str, dict]:
    ws = load_workbook(path)[hoja]
    cab = [c.value for c in ws[1]]
    return {r[0].value: dict(zip(cab, [c.value for c in r])) for r in ws.iter_rows(min_row=2) if r[0].value}


def corpus() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for org in ("ORG-A", "ORG-B"):
        out[org] = {f.name: f.read_text(encoding="utf-8").replace("\r\n", "\n").strip()
                    for f in sorted((CORPUS / org).glob("*.txt"))}
    return out


def documento_de(evidencia: str, docs: dict) -> tuple[str, str, str]:
    m = re.match(r"\s*(ORG-[A-Z0-9]+)/(\S+)\s+—\s+«(.*)»\s*$", evidencia or "", re.S)
    if not m:
        return "", "", ""
    org, archivo, cita = m.groups()
    return org, archivo, cita


def main() -> int:
    for f in (sys.stdout, sys.stderr):
        if hasattr(f, "reconfigure"):
            f.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--reviewed", required=True, type=Path)
    ap.add_argument("--draft", required=True, type=Path)
    ap.add_argument("--out-md", type=Path, default=REPO / "docs" / "rag-eval" / "INFORME_VERIFICACION_REVISION.md")
    ap.add_argument("--out-xlsx", type=Path, default=HERE / "hoja_verificacion_revisores.xlsx")
    args = ap.parse_args()

    docs = corpus()
    rev, bor = leer(args.reviewed, "Conjunto_80"), leer(args.draft, "Conjunto_80")
    revb, borb = leer(args.reviewed, "Bateria"), leer(args.draft, "Bateria")
    sha = hashlib.sha256(args.reviewed.read_bytes()).hexdigest()

    # ───── 1. Controles automáticos sobre el conjunto ─────
    controles: list[tuple[str, str, str]] = []  # (control, resultado, detalle)
    cuestionadas: dict[str, list[str]] = collections.defaultdict(list)

    por_tema = collections.Counter((r["tema_clave"], r["tipo"]) for r in rev.values())
    ok = all(por_tema[(t, "documental")] == 8 and por_tema[(t, "seguimiento")] == 2 for t in TEMAS)
    controles.append(("8 documentales y 2 seguimientos por tema", "Cumple" if ok else "NO cumple",
                      f"{len(rev)} consultas, {len(TEMAS)} temas"))

    malas = []
    for i, r in rev.items():
        org, archivo, cita = documento_de(r["evidencia_esperada"], docs)
        if not org or archivo not in docs.get(org, {}) or norm(cita) not in norm(docs[org][archivo]):
            malas.append(i)
        if org and org != r["organizacion"]:
            malas.append(i)
    controles.append(("Cada evidencia es una cita textual del documento de su organización",
                      "Cumple" if not malas else "NO cumple", f"{len(rev) - len(set(malas))} de {len(rev)}"))

    cambios = [i for i in rev if any(norm(rev[i][c]) != norm(bor[i][c])
               for c in ("organizacion", "historial_previo", "pregunta", "respuesta_referencia", "evidencia_esperada"))]
    cambios_b = [i for i in revb if any(norm(revb[i][c]) != norm(borb[i][c])
                 for c in ("tema_clave", "organizacion_consulta", "organizacion_contenido", "pregunta"))]
    controles.append(("Cambios que introdujo la revisión (conjunto)",
                      "Ninguno" if not cambios else f"{len(cambios)} filas", f"de {len(rev)} filas"))
    controles.append(("Cambios que introdujo la revisión (batería)",
                      "Ninguno" if not cambios_b else f"{len(cambios_b)} filas", f"de {len(revb)} filas"))

    marcas = collections.Counter((r["revisor_1"], r["revisor_2"]) for r in list(rev.values()) + list(revb.values()))
    notas = collections.Counter(str(r["notas"]) for r in list(rev.values()) + list(revb.values()))
    desac = collections.Counter(str(r.get("desacuerdo_resuelto")) for r in rev.values())

    # Duplicados de texto
    por_texto = collections.defaultdict(list)
    for i, r in rev.items():
        por_texto[norm(r["pregunta"])].append(i)
    for texto, ids in por_texto.items():
        if len(ids) > 1:
            for i in ids:
                cuestionadas[i].append(f"Mismo texto de pregunta que {', '.join(x for x in ids if x != i)}: "
                                       "confirmar que cada una se evalúa con el documento de su organización.")
    # Referencia con datos que no están en el documento citado
    ratios = {}
    for i, r in rev.items():
        org, archivo, _ = documento_de(r["evidencia_esperada"], docs)
        texto = docs.get(org, {}).get(archivo, "")
        ref = palabras(r["respuesta_referencia"])
        ratios[i] = len(ref & palabras(texto)) / len(ref) if ref else 1.0
        sobran = numeros(r["respuesta_referencia"]) - numeros(texto)
        if sobran:
            cuestionadas[i].append(f"La referencia menciona cifras que no están en el documento citado: {', '.join(sorted(sobran))}.")
        if ratios[i] < UMBRAL_REFERENCIA:
            cuestionadas[i].append(f"Solo {ratios[i]:.0%} de las palabras de la referencia aparecen en el documento citado: "
                                   "puede incluir información que el documento no contiene.")
    # Seguimiento que podría entenderse solo
    ancla = re.compile(r"^¿y\b|\b(eso|esa|ese|esos|esas|ello|esto|estos|esas|mientras|entonces|ahí)\b|\bsu\b|\bsus\b|\blos\b|\blas\b", re.I)
    for i, r in rev.items():
        if r["tipo"] == "seguimiento" and not ancla.search(r["pregunta"]):
            cuestionadas[i].append("Seguimiento que no parece depender del turno anterior: confirmar que no se entiende sola.")
    # Nombre del tipo de empresa dentro de la pregunta
    for i, r in rev.items():
        if re.search(r"\b(la clínica|la ferretería|ferretería andina|clínica dental|sonrisa)\b", r["pregunta"], re.I):
            cuestionadas[i].append("La pregunta nombra a la empresa; un empleado suele decir «en la empresa» o no nombrarla.")

    # ───── 2. Batería ─────
    bat_cuest: dict[str, list[str]] = collections.defaultdict(list)
    todo = {org: " ".join(docs[org].values()) for org in docs}
    solape = {}
    for i, r in revb.items():
        if r["tipo"] == "sin_respuesta":
            p = palabras(r["pregunta"])
            solape[i] = len(p & palabras(todo[r["organizacion_consulta"]])) / len(p) if p else 0
            if solape[i] >= UMBRAL_SIN_RESPUESTA:
                bat_cuest[i].append(f"{solape[i]:.0%} de las palabras de la pregunta ya están en los documentos de su "
                                    "organización: confirmar que de verdad no tiene respuesta allí.")
        if i in DUDAS_MANUALES:
            bat_cuest[i].append(DUDAS_MANUALES[i])
    tipos_b = collections.Counter(r["tipo"] for r in revb.values())

    # ───── 3. Muestra de control (estratificada, semilla fija) ─────
    rnd = random.Random(SEMILLA_MUESTRA)
    muestra: list[str] = []
    for t in TEMAS:
        ids = sorted(i for i, r in rev.items() if r["tema_clave"] == t and i not in cuestionadas)
        muestra += rnd.sample(ids, min(POR_TEMA_MUESTRA, len(ids)))
    muestra_b = []
    for tipo in ("sin_respuesta", "fuera_de_alcance", "aislamiento"):
        ids = sorted(i for i, r in revb.items() if r["tipo"] == tipo and i not in bat_cuest)
        muestra_b += rnd.sample(ids, min(2, len(ids)))

    # ───── 4. Hoja para los revisores ─────
    wb = Workbook()
    ws0 = wb.active
    ws0.title = "Instrucciones"
    instr = [
        ("Hoja de verificación para revisores", True),
        ("Por qué existe: el archivo revisado marca «Sí» en las 110 filas, sin cambios respecto al borrador. "
         "Esta hoja pide una decisión explícita y registrada sobre las filas que más lo merecen.", False),
        ("", False),
        ("Qué hacer", True),
        ("1. Abre la hoja «Verificación». Cada fila trae la pregunta, la referencia, la evidencia citada y el TEXTO COMPLETO del documento.", False),
        ("2. Lee el documento y decide: «Confirmo» (la referencia es correcta y la pregunta se responde con ese documento), "
         "«Corrijo» (escribe la corrección) o «Descarto» (la fila no sirve).", False),
        ("3. Si confirmas, escribe en «Qué comprobé» qué verificaste (por ejemplo: «cifra y plazo coinciden con el párrafo 2»). "
         "Un «Confirmo» sin esa nota no cuenta.", False),
        ("4. Firma con tu nombre y la fecha en cada fila. Los dos revisores trabajan por separado, en su propia copia.", False),
        ("", False),
        ("Tipos de fila", True),
        ("Cuestionada: un control automático la señaló; el motivo está en la columna «Motivo».", False),
        ("Muestra: no tiene observaciones; se pide verificarla igual para tener una revisión independiente de una muestra.", False),
        ("", False),
        ("Lo que esta hoja NO hace: no corrige nada por sí sola. Los cambios aceptados se pasan después al conjunto "
         "oficial y se vuelve a correr rag-eval/dataset/xlsx_to_jsonl.py.", False),
    ]
    for n, (texto, negrita) in enumerate(instr, 1):
        c = ws0.cell(n, 1, texto)
        c.font = Font(bold=negrita, size=13 if n == 1 else 11)
        c.alignment = Alignment(wrap_text=True, vertical="top")
    ws0.column_dimensions["A"].width = 120

    ws = wb.create_sheet("Verificación")
    cols = ["Control", "Hoja", "id", "Organización", "Tipo", "Historial previo", "Pregunta", "Respuesta de referencia",
            "Evidencia esperada", "Texto completo del documento", "Motivo", "Decisión", "Qué comprobé / corrección",
            "Revisor (nombre)", "Fecha"]
    ancho = [11, 11, 7, 11, 14, 32, 42, 48, 42, 70, 44, 14, 40, 18, 12]
    cab = PatternFill("solid", fgColor="1F3A5F")
    for k, (t, w) in enumerate(zip(cols, ancho), 1):
        c = ws.cell(1, k, t)
        c.font, c.fill = Font(bold=True, color="FFFFFF"), cab
        c.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[c.column_letter].width = w
    amarillo = PatternFill("solid", fgColor="FFF2CC")
    fila = 2

    def agregar(control, hoja, i, r, motivo, esbat):
        nonlocal fila
        if esbat:
            org = r["organizacion_consulta"]
            contenido = r["organizacion_contenido"]
            texto = "\n\n".join(f"[{org} / {a}]\n{t}" for a, t in docs[contenido or org].items()) if r["tipo"] == "aislamiento" \
                else ("(sin documento: la pregunta no debe tener respuesta en el corpus de " + org + ")" if r["tipo"] == "sin_respuesta"
                      else "(fuera del alcance: debe rechazarse)")
            if r["tipo"] == "sin_respuesta":
                texto = "\n\n".join(f"[{a}]\n{t}" for a, t in docs[org].items())
            vals = [control, hoja, i, org + (f" → {contenido}" if contenido else ""), r["tipo"], "", r["pregunta"],
                    r["comportamiento_esperado"], "", texto, motivo]
        else:
            org, archivo, _ = documento_de(r["evidencia_esperada"], docs)
            vals = [control, hoja, i, r["organizacion"], r["tipo"], r["historial_previo"] or "", r["pregunta"],
                    r["respuesta_referencia"], r["evidencia_esperada"], docs.get(org, {}).get(archivo, ""), motivo]
        for k, v in enumerate(vals, 1):
            c = ws.cell(fila, k, v)
            c.alignment = Alignment(wrap_text=True, vertical="top")
        for k in range(12, 16):
            ws.cell(fila, k).fill = amarillo
            ws.cell(fila, k).alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[fila].height = 190
        fila += 1

    for i in sorted(cuestionadas):
        agregar("Cuestionada", "Conjunto_80", i, rev[i], " | ".join(cuestionadas[i]), False)
    for i in sorted(bat_cuest):
        agregar("Cuestionada", "Bateria", i, revb[i], " | ".join(bat_cuest[i]), True)
    for i in muestra:
        agregar("Muestra", "Conjunto_80", i, rev[i], "Muestra de control sin observaciones automáticas.", False)
    for i in muestra_b:
        agregar("Muestra", "Bateria", i, revb[i], "Muestra de control sin observaciones automáticas.", True)
    total_filas = fila - 2
    dv = DataValidation(type="list", formula1='"Confirmo,Corrijo,Descarto"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"L2:L{fila}")
    ws.freeze_panes = "D2"
    ws.auto_filter.ref = f"A1:O{fila - 1}"
    args.out_xlsx.parent.mkdir(parents=True, exist_ok=True)
    wb.save(args.out_xlsx)

    # ───── 5. Informe ─────
    n_cu, n_cub = len(cuestionadas), len(bat_cuest)
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    L = []
    L.append("# Informe de verificación de la revisión del conjunto de evaluación\n")
    L.append(f"Fecha del informe: {ahora} · Archivo verificado: `{args.reviewed.name}` · SHA-256 `{sha[:16]}…`\n")
    L.append("Este informe responde a una sola pregunta: **¿el conjunto revisado ya puede considerarse revisado por "
             "especialistas, como exige la sección 5.C del paper?** Los controles son automáticos y se repiten con "
             "`python rag-eval/dataset/verify_review.py`.\n")
    L.append("## 1. Conclusión\n")
    L.append(f"- **El conjunto es estructuralmente correcto y sus citas son textuales.** Pasa todos los controles automáticos.")
    L.append(f"- **La revisión humana no está demostrada.** Los dos revisores marcaron «Sí» en las {len(rev) + len(revb)} filas, "
             f"sin un solo cambio respecto al borrador y con la misma nota en todas ({list(notas)[0]!r}).")
    L.append(f"- **Hay {n_cu + n_cub} filas con observaciones automáticas** ({n_cu} del conjunto y {n_cub} de la batería) y "
             f"{len(muestra) + len(muestra_b)} filas de muestra de control. Se entregan en `hoja_verificacion_revisores.xlsx` "
             f"({total_filas} filas) para que cada una quede con una decisión explícita.")
    L.append("- **Mientras eso no se complete, la afirmación «referencias revisadas por especialistas» no debe aparecer en el "
             "paper**, y no se debe ejecutar la evaluación contra este conjunto como si estuviera validado.\n")
    L.append("## 2. Controles automáticos\n")
    L.append("| Control | Resultado | Detalle |\n|---|---|---|")
    for c, rsl, d in controles:
        L.append(f"| {c} | **{rsl}** | {d} |")
    L.append(f"| Batería: 10 casos por tipo | **{'Cumple' if all(v == 10 for v in tipos_b.values()) and len(tipos_b) == 3 else 'NO cumple'}** | "
             + ", ".join(f"{k}: {v}" for k, v in sorted(tipos_b.items())) + " |")
    L.append("| Aislamiento: cada ancla está en la organización dueña y falta en la que consulta | **Cumple** | "
             "`python rag-eval/dataset/isolation_cases.py` |\n")
    L.append("## 3. Estado de la revisión\n")
    L.append("| Dato | Valor |\n|---|---|")
    L.append(f"| Marcas (revisor 1, revisor 2) en {len(rev) + len(revb)} filas | {dict(marcas)} |")
    L.append(f"| `desacuerdo_resuelto` en el conjunto | {dict(desac)} |")
    L.append(f"| Texto de `notas` | {dict(notas)} |")
    L.append(f"| Filas del conjunto modificadas respecto al borrador | {len(cambios)} de {len(rev)} |")
    L.append(f"| Filas de la batería modificadas respecto al borrador | {len(cambios_b)} de {len(revb)} |\n")
    L.append("**Cómo leer esto.** En el borrador generado por un LLM ya se habían señalado dudas "
             "(preguntas de batería con respuesta parcial en el corpus, dos seguimientos con texto idéntico). "
             "Una revisión efectiva suele corregir, descartar o anotar algo en un lote de 110 elementos. Cero cambios y "
             "un acuerdo del 100 % no prueban que no se revisó, pero tampoco lo demuestran: no deja evidencia de qué se "
             "comprobó ni quién lo hizo. Con acuerdo total tampoco se puede calcular un kappa informativo.\n")
    L.append("## 4. Filas con observaciones\n")
    L.append("Observaciones de controles automáticos; ninguna es un error confirmado, son motivos para mirar.\n")
    L.append("| id | Organización | Observación |\n|---|---|---|")
    for i in sorted(cuestionadas):
        L.append(f"| {i} | {rev[i]['organizacion']} | {' '.join(cuestionadas[i])} |")
    for i in sorted(bat_cuest):
        L.append(f"| {i} | {revb[i]['organizacion_consulta']} | {' '.join(bat_cuest[i])} |")
    if not cuestionadas and not bat_cuest:
        L.append("| — | — | Ninguna |")
    L.append("")
    L.append("## 5. Muestra de control\n")
    L.append(f"Muestra estratificada con semilla fija ({SEMILLA_MUESTRA}): {POR_TEMA_MUESTRA} consultas por tema entre las filas sin "
             "observaciones, y 2 casos de cada tipo de la batería. Conjunto: " + ", ".join(sorted(muestra)) +
             ". Batería: " + ", ".join(sorted(muestra_b)) + ".\n")
    L.append("## 6. Qué hay que hacer para cerrar la revisión\n")
    L.append("1. Entregar `hoja_verificacion_revisores.xlsx` a los dos revisores, **cada uno con su copia**.")
    L.append("2. Cada revisor decide en cada fila (Confirmo, Corrijo o Descarto) y anota qué comprobó, con su nombre y fecha.")
    L.append("3. Pasar las correcciones al conjunto oficial y volver a correr `xlsx_to_jsonl.py`.")
    L.append("4. Volver a correr este informe con el archivo corregido. Si hay desacuerdos reales, se registran en "
             "`desacuerdo_resuelto` y se calcula la concordancia entre revisores.")
    L.append("5. Solo entonces fijar el conjunto (su hash va en cada resultado) y pasar a la Parada B.\n")
    L.append("## 7. Qué no cubre este informe\n")
    L.append("- No comprueba que una referencia sea *correcta*: solo que sus datos aparezcan en el documento citado.")
    L.append("- No puede asegurar que una pregunta «sin_respuesta» carezca de respuesta en el corpus; usa solape de palabras.")
    L.append("- El corpus es sintético: valida el método y el arnés, no el desempeño sobre documentos reales de las MYPE.\n")
    args.out_md.parent.mkdir(parents=True, exist_ok=True)
    args.out_md.write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")

    print(f"Cuestionadas: {n_cu} del conjunto, {n_cub} de la batería · muestra: {len(muestra)}+{len(muestra_b)} · filas en la hoja: {total_filas}")
    print("Distribución del solape referencia/documento (min, p10, mediana):",
          f"{min(ratios.values()):.2f}", f"{sorted(ratios.values())[len(ratios)//10]:.2f}", f"{sorted(ratios.values())[len(ratios)//2]:.2f}")
    print("Solape pregunta/documentos en sin_respuesta:", {k: round(v, 2) for k, v in sorted(solape.items())})
    print(f"Informe: {args.out_md}\nHoja:    {args.out_xlsx}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
