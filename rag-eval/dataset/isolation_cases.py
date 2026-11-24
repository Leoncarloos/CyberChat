"""Los 10 casos de aislamiento, redactados a mano y verificados contra el corpus.

Cada caso se apoya en un dato (ancla) que existe en los documentos de UNA organización y no en
los de la que consulta. El LLM no genera estos casos: sus borradores se apoyaban en temas que
ambas empresas cubren con reglas distintas, y entonces la pregunta tiene respuesta propia y no
prueba aislamiento. `verificar()` falla si un ancla falta en la dueña del contenido o aparece en
la que consulta.
"""
from __future__ import annotations

import re
from pathlib import Path

CORPUS = Path(__file__).resolve().parent.parent / "corpus"

# (organización que consulta, organización dueña del contenido, tema, pregunta, anclas)
CASOS = [
    ("ORG-A", "ORG-B", "canales_venta", "¿Se envían recordatorios de cita por SMS y qué información llevan?", ["sms"]),
    ("ORG-A", "ORG-B", "datos_sensibles", "¿Dónde se guardan las radiografías y cómo se entregan a quien las pide?", ["radiografías"]),
    ("ORG-A", "ORG-B", "accesos", "¿Cuántos años se conservan los registros de quién abrió cada ficha?", ["ficha", "2 años"]),
    ("ORG-A", "ORG-B", "ley_29733", "¿Las cámaras de vigilancia pueden estar dentro de las salas de trabajo o solo en los pasillos?", ["cámaras de vigilancia"]),
    ("ORG-A", "ORG-B", "contrasenas", "¿Dónde se guarda físicamente la contraseña maestra de las cuentas compartidas y quién puede abrirla?", ["sobre sellado"]),
    ("ORG-B", "ORG-A", "canales_venta", "¿Desde qué monto hay que confirmar un pedido con una llamada antes de despachar?", ["s/ 2,000"]),
    ("ORG-B", "ORG-A", "ia_amenazas", "¿Qué es la palabra de verificación y cada cuánto se cambia?", ["palabra de verificación"]),
    ("ORG-B", "ORG-A", "resiliencia", "¿Qué regla se aplica a las copias de respaldo: cuántas copias, en qué medios y dónde?", ["regla 3-2-1"]),
    ("ORG-B", "ORG-A", "resiliencia", "¿Cómo se emiten las boletas cuando se cae el sistema de facturación?", ["libreta de contingencia"]),
    ("ORG-B", "ORG-A", "phishing", "¿Cómo se suman puntos en el tablero de seguridad?", ["tablero de seguridad"]),
]


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", t).lower()


def _docs(org: str) -> str:
    return _norm(" ".join(f.read_text(encoding="utf-8") for f in sorted((CORPUS / org).glob("*.txt"))))


def verificar() -> list[str]:
    errores = []
    docs = {o: _docs(o) for o in ("ORG-A", "ORG-B")}
    for consulta, contenido, _tema, pregunta, anclas in CASOS:
        for ancla in anclas:
            if _norm(ancla) not in docs[contenido]:
                errores.append(f"«{ancla}» no está en {contenido}: {pregunta}")
            if _norm(ancla) in docs[consulta]:
                errores.append(f"«{ancla}» SÍ está en {consulta} (quien consulta): {pregunta}")
    if len(CASOS) != 10:
        errores.append(f"se esperaban 10 casos y hay {len(CASOS)}")
    return errores


if __name__ == "__main__":
    fallos = verificar()
    print("\n".join(fallos) if fallos else f"{len(CASOS)} casos de aislamiento verificados contra el corpus.")
    raise SystemExit(1 if fallos else 0)
