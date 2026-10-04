# Evaluación reproducible del RAG

Arnés que implementa el protocolo de la sección 5.C del paper. El mapeo entre cada parte y el
protocolo está en [docs/rag-eval/PROTOCOLO.md](../docs/rag-eval/PROTOCOLO.md).

**Estado:** Tarea 1 implementada (conjunto, mapeo de organizaciones y hash del corpus). La
recolección, las métricas y el informe están pendientes.

## Reglas

- Producción solo en lectura. Nada de este arnés escribe en la base.
- `rag-eval/results/`, los JSONL del conjunto y el mapeo de organizaciones están en `.gitignore`:
  contienen fragmentos de documentos de las empresas.
- Las claves van en variables de entorno. Ver [.env.example](.env.example).

## Requisitos

- Node 24 y las dependencias del repo (`npm install`).
- Python 3.12 o superior:

```bash
python -m venv .venv
```

```bash
.venv/Scripts/python -m pip install -r rag-eval/evaluate/requirements.txt
```

- `.env.local` en la raíz con las variables de `.env.example`.

## 1. Conjunto de evaluación

Convierte y valida la plantilla completada (hojas `Conjunto_80` y `Bateria`):

```bash
python rag-eval/dataset/xlsx_to_jsonl.py --xlsx ruta/rag-eval-plantilla-conjunto.xlsx
```

Escribe `conjunto.jsonl`, `bateria.jsonl` y `validacion.json` en `rag-eval/dataset/`. Si hay
errores no escribe los JSONL y termina con código 1; `--allow-incomplete` escribe solo las filas
completas. El validador informa lo que falta y **no completa nada**.

Reglas que valida:

| Hoja | Regla |
|---|---|
| Conjunto_80 | 80 consultas con id único; por tema, 8 `documental` y 2 `seguimiento` |
| Conjunto_80 | `pregunta`, `respuesta_referencia` y `organizacion` obligatorios; `organizacion` es un alias `ORG-X` |
| Conjunto_80 | `tema_clave`, `tipo` y los valores de revisión pertenecen al diccionario |
| Conjunto_80 | Las `seguimiento` llevan `historial_previo` |
| Bateria | 10 casos por tipo; `pregunta` y `organizacion_consulta` obligatorios |
| Bateria | En `aislamiento`, `organizacion_contenido` es obligatoria y distinta de la que consulta |

Avisos que no bloquean: `evidencia_esperada` vacía (sin ella no hay métricas de recuperación para
esa consulta) y referencias sin validar por ambos revisores.

**Formato de `historial_previo`:** un turno por línea con prefijo `Usuario:` o `Asistente:`. Sin
prefijos, todo el texto se toma como un único turno previo del usuario y se emite un aviso.

## 2. Organizaciones

El conjunto usa alias (`ORG-A`…). La correspondencia con el id del administrador se guarda en un
archivo **fuera del repositorio**:

1. Lista los administradores con documentos (muestra sus ids; no pegues la salida en ningún lado):

```bash
npx tsx --env-file=.env.local rag-eval/runner/corpusHash.ts --list
```

2. Copia [org-map.example.json](org-map.example.json) fuera del repo, complétalo y define
   `RAG_EVAL_ORG_MAP` con su ruta absoluta.

## 3. Versión documental

```bash
npx tsx --env-file=.env.local rag-eval/runner/corpusHash.ts
```

Guarda `results/corpus_<hash>.json` con dos huellas:

- `corpus_hash`: alias, id de documento, fecha de carga, posición y SHA-256 del texto de cada
  fragmento. Cambia si cambia cualquier texto o documento.
- `index_hash`: lo anterior más el SHA-256 de cada vector. Cambia además si se reindexa el mismo
  texto con otra fragmentación o con otro modelo de embeddings.

Cada resultado de la evaluación llevará el `corpus_hash` con el que se obtuvo.
