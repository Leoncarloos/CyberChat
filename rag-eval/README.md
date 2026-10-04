# Evaluación reproducible del RAG

Arnés que implementa el protocolo de la sección 5.C del paper. El mapeo entre cada parte y el
protocolo está en [docs/rag-eval/PROTOCOLO.md](../docs/rag-eval/PROTOCOLO.md).

**Estado:** implementadas la Tarea 1 (conjunto, mapeo de organizaciones y hash del corpus) y la
Tarea 2 (extracción del pipeline, prueba de equivalencia y recolector). Las métricas, los
experimentos y el informe están pendientes. Todavía no se ha ejecutado ninguna recolección.

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

## 4. Prueba de equivalencia

`/api/chat` y el arnés usan las mismas funciones de `lib/ragPipeline.ts`. La prueba demuestra que
extraerlas no cambió el chat:

```bash
npm run test:rag-eval
```

Ejecuta la ruta anterior (copia congelada del commit `488b944`) y la actual con las mismas entradas
y dependencias simuladas, y exige que coincidan las llamadas a la base, el cuerpo enviado al
generador, la respuesta HTTP y los registros de error, en 10 consultas y 18 casos de fallo. No hace
llamadas de red.

## 5. Recolección

```bash
npx tsx --env-file=.env.local rag-eval/runner/collect.ts --config rag-eval/configs/baseline.json
```

| Opción | Efecto |
|---|---|
| `--dataset conjunto\|bateria\|ambos` | Qué hoja ejecutar (por defecto, ambas) |
| `--ids Q01,Q02` | Solo esas consultas |
| `--limit N` | Solo las primeras N |
| `--no-generate` | Solo recuperación: no llama al generador |

Escribe `results/<run_id>.jsonl` (un registro por consulta y repetición) y
`results/<run_id>.meta.json` (configuración, versiones, commit, huellas del corpus y del conjunto).

Cómo se comporta:

- **La recuperación se hace una vez por consulta** y se comparte entre las 3 repeticiones, que solo
  miden la variación del generador (temperatura 0,15).
- **Dos búsquedas por consulta:** la de producción (5 resultados, lo que entra al prompt) y una
  ampliada (20, en `candidates_raw`) para los barridos offline de umbral y de k. El campo
  `top_matches_candidates` indica si coinciden: el índice HNSW es aproximado y filtra por empresa
  después de buscar, así que no está garantizado.
- **Ámbito:** se usa directamente el id del administrador de la organización, que es lo que resuelve
  producción para cualquier empleado de esa empresa.
- **Los fallos se registran**, no se descartan: cada consulta produce siempre sus 3 registros, con
  `error.stage` en `configuracion`, `embedding`, `recuperacion` o `generacion`.
- **Límite de tokens por minuto:** un 429 del generador se reintenta hasta 5 veces respetando la
  espera que indica el proveedor; `retries` queda en el registro.
- **`baseline.json` (E0) debe coincidir con producción.** Si alguien cambia una constante del chat y
  no la configuración, `collect.ts` se niega a correr.
