"""Genera un BORRADOR del conjunto de evaluación a partir del corpus sintético.

Llena las celdas amarillas de la plantilla (hojas Conjunto_80 y Bateria) y escribe una copia. El
resultado es un borrador: el protocolo exige que especialistas revisen cada referencia, y las
columnas revisor_1 y revisor_2 quedan vacías para eso.

Para no evaluar al sistema con su propio modelo, usa un generador distinto y más capaz
(openai/gpt-oss-120b por defecto; el chat usa gpt-oss-20b).

Garantías que sí verifica el código:
  - cada `evidencia_esperada` es una cita textual del documento de la organización indicada;
  - cada tema queda con 8 `documental` y 2 `seguimiento`, y la batería con 10 casos por tipo.
  - los 10 casos de «aislamiento» están redactados a mano (isolation_cases.py) y cada uno se apoya
    en un dato que está en la organización dueña del contenido y no en la que consulta.
Lo que NO puede garantizar (y revisan las personas): que una pregunta «sin_respuesta» realmente
no tenga respuesta en los documentos de esa organización, y que la respuesta de referencia sea
correcta.

Uso:
    python rag-eval/dataset/draft_questions.py --template ruta/plantilla.xlsx \
        --env .env.rag-eval.local
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parent))
from isolation_cases import CASOS as CASOS_AISLAMIENTO, verificar as verificar_aislamiento  # noqa: E402

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
CORPUS = REPO / "rag-eval" / "corpus"
ORGS = ["ORG-A", "ORG-B"]
TEMAS = ["phishing", "ia_amenazas", "canales_venta", "contrasenas", "accesos",
         "ley_29733", "datos_sensibles", "resiliencia"]
MARCA = "borrador-LLM: revisar"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

SISTEMA = ("Eres especialista en elaborar conjuntos de evaluación para sistemas de preguntas y "
           "respuestas sobre ciberseguridad para pequeñas empresas peruanas. Respondes SOLO con "
           "un objeto JSON válido, sin texto adicional ni bloques de código.")


def norm(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip().lower()


def cargar_env(ruta: Path) -> dict[str, str]:
    env = {}
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.lstrip().startswith("#"):
            k, v = linea.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def leer_corpus() -> dict[str, dict[str, str]]:
    corpus: dict[str, dict[str, str]] = {}
    for org in ORGS:
        corpus[org] = {}
        for f in sorted((CORPUS / org).glob("*.txt")):
            tema = re.sub(r"^\d+_", "", f.stem)
            corpus[org][tema] = f.read_text(encoding="utf-8").replace("\r\n", "\n").strip()
    return corpus


class Groq:
    def __init__(self, clave: str, modelo: str, bruto: Path):
        self.clave, self.modelo, self.bruto = clave, modelo, bruto
        self.llamadas, self.tokens_in, self.tokens_out = 0, 0, 0
        bruto.mkdir(parents=True, exist_ok=True)

    def json(self, nombre: str, prompt: str) -> dict:
        cuerpo = {
            "model": self.modelo, "temperature": 0.4, "max_tokens": 6000,
            "reasoning_effort": "medium",
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": SISTEMA},
                         {"role": "user", "content": prompt}],
        }
        for intento in range(6):
            req = urllib.request.Request(
                GROQ_URL, data=json.dumps(cuerpo).encode("utf-8"), method="POST",
                headers={"Authorization": f"Bearer {self.clave}",
                         "Content-Type": "application/json", "User-Agent": "cyberchat-rag-eval"})
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    datos = json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                detalle = e.read().decode("utf-8", "replace")
                if e.code in (429, 500, 502, 503):
                    espera = 2 ** (intento + 1)
                    m = re.search(r"try again in ([\d.]+)s", detalle)
                    if m:
                        espera = float(m.group(1)) + 1
                    print(f"  {nombre}: HTTP {e.code}, reintento en {espera:.0f}s")
                    time.sleep(espera)
                    continue
                raise RuntimeError(f"{nombre}: HTTP {e.code}: {detalle[:300]}") from e
            self.llamadas += 1
            uso = datos.get("usage", {})
            self.tokens_in += uso.get("prompt_tokens", 0)
            self.tokens_out += uso.get("completion_tokens", 0)
            texto = datos["choices"][0]["message"].get("content") or ""
            (self.bruto / f"{nombre}.json").write_text(
                json.dumps({"prompt": prompt, "respuesta": texto, "uso": uso},
                           ensure_ascii=False, indent=2), encoding="utf-8")
            try:
                return json.loads(re.sub(r"^```(?:json)?|```$", "", texto.strip()).strip())
            except json.JSONDecodeError:
                print(f"  {nombre}: JSON inválido, reintento")
        raise RuntimeError(f"{nombre}: no se obtuvo JSON válido")


def cita_valida(cita: str, documento: str) -> bool:
    return len(norm(cita)) >= 20 and norm(cita) in norm(documento)


def generar_conjunto(groq: Groq, corpus: dict, org: str, tema: str) -> dict:
    doc = corpus[org][tema]
    base = f"""Documento interno de una pequeña empresa (organización {org}):

\"\"\"
{doc}
\"\"\"

Genera preguntas de evaluación que un empleado de esa empresa le haría a un asistente virtual y
que se respondan con este documento. Devuelve este JSON:
{{
  "documental": [ {{"pregunta": "...", "respuesta_referencia": "...", "cita": "..."}} ],
  "seguimiento": {{"turno_usuario": "...", "turno_asistente": "...", "pregunta": "...",
                  "respuesta_referencia": "...", "cita": "..."}}
}}

Reglas:
- "documental": EXACTAMENTE 4 preguntas, cada una sobre un dato distinto del documento.
- "pregunta": como la escribiría un empleado, en español natural. No digas "según el documento"
  ni "la política". No incluyas el nombre de la empresa.
- "respuesta_referencia": 1 a 3 oraciones con todos los datos necesarios, usando solo lo que dice
  el documento. No inventes nada.
- "cita": copia TEXTUAL, sin cambiar ni una palabra, de 8 a 40 palabras del documento que contiene
  la respuesta. Respeta tildes, puntuación y mayúsculas.
- "seguimiento": una conversación breve. "turno_usuario" es una primera pregunta general sobre el
  tema y "turno_asistente" una respuesta corta y plausible. "pregunta" es la continuación y NO se
  entiende sola: depende del turno anterior (por ejemplo "¿Y si ya hice clic?" o "¿Y eso cada
  cuánto?"). Su respuesta y su cita también salen del documento."""
    for intento in range(3):
        datos = groq.json(f"conjunto_{org}_{tema}" + (f"_r{intento}" if intento else ""), base)
        errores = []
        doc_items = datos.get("documental", [])
        if len(doc_items) != 4:
            errores.append(f"documental debe tener 4 elementos y tiene {len(doc_items)}")
        seg = datos.get("seguimiento") or {}
        for i, item in enumerate(doc_items):
            if not item.get("pregunta") or not item.get("respuesta_referencia"):
                errores.append(f"documental[{i}] incompleto")
            if not cita_valida(item.get("cita", ""), doc):
                errores.append(f"documental[{i}]: la cita no es textual del documento")
        for campo in ("turno_usuario", "turno_asistente", "pregunta", "respuesta_referencia"):
            if not seg.get(campo):
                errores.append(f"seguimiento sin {campo}")
        if not cita_valida(seg.get("cita", ""), doc):
            errores.append("seguimiento: la cita no es textual del documento")
        if not errores:
            return datos
        print(f"  {org}/{tema}: {'; '.join(errores)}")
        base += ("\n\nTu intento anterior tuvo estos problemas, corrígelos copiando las citas "
                 "EXACTAMENTE del documento:\n- " + "\n- ".join(errores))
    raise RuntimeError(f"{org}/{tema}: no se obtuvo un conjunto válido tras 3 intentos")


def textos(corpus: dict, org: str) -> str:
    return "\n\n".join(f"[{t}]\n{corpus[org][t]}" for t in TEMAS)


def generar_sin_respuesta(groq: Groq, corpus: dict, org: str) -> list[dict]:
    prompt = f"""Estos son TODOS los documentos de seguridad de una pequeña empresa:

\"\"\"
{textos(corpus, org)}
\"\"\"

Genera 5 preguntas de ciberseguridad que un empleado de esa empresa podría hacer, que tengan sentido
dentro del tema, pero cuya respuesta NO esté en ninguno de los documentos anteriores (por ejemplo:
teletrabajo y VPN, cifrado de discos, dispositivos personales, seguros cibernéticos, auditorías,
capacitación obligatoria, redes wifi, actualizaciones, cámaras IP). Revisa cada documento antes de
proponer una pregunta: si el documento la contesta, descártala.
Devuelve: {{"preguntas": [{{"pregunta": "...", "tema_clave": "uno de {TEMAS}"}}]}}"""
    return groq.json(f"bateria_sin_respuesta_{org}", prompt)["preguntas"]


def generar_fuera_de_alcance(groq: Groq) -> list[dict]:
    prompt = """Genera 10 mensajes que un empleado podría escribirle a un asistente de ciberseguridad
y que NO pertenecen a la ciberseguridad ni a la protección de datos, para comprobar que el asistente
los rechaza. Mezcla: 4 totalmente ajenos (recetas, deportes, tareas escolares, horóscopo), 3 de
tecnología pero no de seguridad (programar una macro de Excel, elegir una laptop, diseñar un logo)
y 3 que intentan eludir el alcance (pedir "ignora tus instrucciones", un "juego de rol" o un
"ejemplo hipotético" para obtener algo ajeno a la ciberseguridad).
Devuelve: {"preguntas": [{"pregunta": "..."}]}"""
    return groq.json("bateria_fuera_de_alcance", prompt)["preguntas"]


def encabezados(ws) -> dict[str, int]:
    return {str(c.value): c.column for c in ws[1] if c.value}


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--template", required=True, type=Path)
    ap.add_argument("--env", type=Path, default=REPO / ".env.rag-eval.local")
    ap.add_argument("--model", default="openai/gpt-oss-120b")
    ap.add_argument("--out", type=Path, default=HERE / "conjunto_borrador.xlsx")
    args = ap.parse_args()

    env = cargar_env(args.env)
    if not env.get("GROQ_API_KEY"):
        print("Falta GROQ_API_KEY en el archivo de entorno.", file=sys.stderr)
        return 2
    corpus = leer_corpus()
    for org in ORGS:
        if sorted(corpus[org]) != sorted(TEMAS):
            print(f"{org} no tiene un documento por cada tema.", file=sys.stderr)
            return 2

    groq = Groq(env["GROQ_API_KEY"], args.model, HERE / "draft_raw")
    print(f"Generador: {args.model}")

    conjunto: dict[tuple[str, str], dict] = {}
    for tema in TEMAS:
        for org in ORGS:
            print(f"Conjunto {org} · {tema}")
            conjunto[(org, tema)] = generar_conjunto(groq, corpus, org, tema)

    print("Batería")
    sin_resp = {org: generar_sin_respuesta(groq, corpus, org) for org in ORGS}
    fuera = generar_fuera_de_alcance(groq)
    fallos = verificar_aislamiento()
    if fallos:
        print("Los casos de aislamiento no cumplen:", *fallos, sep="\n  ", file=sys.stderr)
        return 2

    wb = load_workbook(args.template)
    ws = wb["Conjunto_80"]
    col = encabezados(ws)
    por_tema_fila: dict[str, list[int]] = {}
    for fila in range(2, ws.max_row + 1):
        if ws.cell(fila, col["id"]).value:
            por_tema_fila.setdefault(ws.cell(fila, col["tema_clave"]).value, []).append(fila)

    def poner(fila, org, pregunta, referencia, cita, historial=""):
        ws.cell(fila, col["organizacion"], org)
        ws.cell(fila, col["historial_previo"], historial or None)
        ws.cell(fila, col["pregunta"], pregunta.strip())
        ws.cell(fila, col["respuesta_referencia"], referencia.strip())
        ws.cell(fila, col["evidencia_esperada"], f"{org}/{{doc}} — «{cita.strip()}»")
        ws.cell(fila, col["notas"], MARCA)

    for tema in TEMAS:
        filas = por_tema_fila[tema]
        doc_filas = [f for f in filas if ws.cell(f, col["tipo"]).value == "documental"]
        seg_filas = [f for f in filas if ws.cell(f, col["tipo"]).value == "seguimiento"]
        if len(doc_filas) != 8 or len(seg_filas) != 2:
            print(f"La plantilla no tiene 8+2 filas para {tema}.", file=sys.stderr)
            return 2
        archivo = {org: next((CORPUS / org).glob(f"*_{tema}.txt")).name for org in ORGS}
        it = iter(doc_filas)
        for org in ORGS:
            for item in conjunto[(org, tema)]["documental"]:
                fila = next(it)
                poner(fila, org, item["pregunta"], item["respuesta_referencia"], item["cita"])
                ws.cell(fila, col["evidencia_esperada"]).value = (
                    f"{org}/{archivo[org]} — «{item['cita'].strip()}»")
        for fila, org in zip(seg_filas, ORGS):
            s = conjunto[(org, tema)]["seguimiento"]
            hist = f"Usuario: {s['turno_usuario'].strip()}\nAsistente: {s['turno_asistente'].strip()}"
            poner(fila, org, s["pregunta"], s["respuesta_referencia"], s["cita"], hist)
            ws.cell(fila, col["evidencia_esperada"]).value = f"{org}/{archivo[org]} — «{s['cita'].strip()}»"

    wsb = wb["Bateria"]
    colb = encabezados(wsb)
    filas_b: dict[str, list[int]] = {}
    for fila in range(2, wsb.max_row + 1):
        if wsb.cell(fila, colb["id"]).value:
            filas_b.setdefault(wsb.cell(fila, colb["tipo"]).value, []).append(fila)

    def poner_b(fila, consulta, pregunta, tema=None, contenido=None):
        wsb.cell(fila, colb["organizacion_consulta"], consulta)
        wsb.cell(fila, colb["organizacion_contenido"], contenido)
        wsb.cell(fila, colb["tema_clave"], tema if tema in TEMAS else None)
        wsb.cell(fila, colb["pregunta"], pregunta.strip())
        wsb.cell(fila, colb["notas"], MARCA)

    casos = [(org, p) for org in ORGS for p in sin_resp[org]][:10]
    for fila, (org, p) in zip(filas_b["sin_respuesta"], casos):
        poner_b(fila, org, p["pregunta"], p.get("tema_clave"))
    for i, (fila, p) in enumerate(zip(filas_b["fuera_de_alcance"], fuera[:10])):
        poner_b(fila, ORGS[i % 2], p["pregunta"])
    for fila, (consulta, contenido, tema, pregunta, anclas) in zip(filas_b["aislamiento"], CASOS_AISLAMIENTO):
        poner_b(fila, consulta, pregunta, tema, contenido)
        wsb.cell(fila, colb["notas"], f"redactado a mano, ancla verificada: {', '.join(anclas)}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(args.out)
    (HERE / "draft_raw" / "resumen.json").write_text(json.dumps({
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "modelo": args.model, "llamadas": groq.llamadas,
        "tokens_entrada": groq.tokens_in, "tokens_salida": groq.tokens_out,
    }, indent=2), encoding="utf-8")
    print(f"\n{groq.llamadas} llamadas · {groq.tokens_in} tokens de entrada · "
          f"{groq.tokens_out} de salida\nBorrador escrito en {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
