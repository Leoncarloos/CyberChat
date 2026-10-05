# Traspaso — evaluación del RAG (rag-eval)

Estado al 2026-10-04, para retomar en una sesión nueva sin reexplicar nada. Léelo completo antes de
tocar código. El protocolo y su mapeo al paper están en [docs/rag-eval/PROTOCOLO.md](../docs/rag-eval/PROTOCOLO.md);
los comandos, en [README.md](README.md).

## Qué se quiere
Un arnés reproducible que implemente la sección 5.C del paper (Faithfulness, Answer Relevancy,
Context Recall y Context Precision, más recuperación y aislamiento) sobre el RAG de CyberChat. El
encargo original es el prompt `prompt-claude-code-evaluacion-rag.md` (en Descargas del usuario);
este archivo resume lo vigente.

## Reglas que siguen vigentes
- **Producción solo en lectura.** Los experimentos que reindexan (E4) van en el proyecto de desarrollo.
- **No ejecutar llamadas pagadas sin confirmación**, y **estimar el costo antes** (tabla de llamadas).
- **Nada de datos de empresas ni claves en git.** `rag-eval/results/`, los JSONL, los XLSX y el mapeo están ignorados.
- **Parada A** (costos, juez, organizaciones) y **Parada B** (resultados de E0 y aislamiento antes de E1–E6): esperar al usuario.
- No inventar resultados; lo no ejecutado se dice y la tabla queda con el hueco.
- El usuario prefiere respuestas cortas y que se vaya al grano.

## Dónde está cada cosa
| Qué | Dónde |
|---|---|
| Rama de trabajo | `feat/rag-eval` (en GitHub, hasta el commit `cb728ce`) |
| `main` | **2 commits locales sin subir** (`ef45878`, `488b944`); el push fue bloqueado porque despliega a producción. Lo decide el usuario |
| Proyecto Supabase de **desarrollo** | `cyberchat-rag-eval-dev`, ref `prgipedtijbryajvvenj`, plan gratuito ($0), región us-west-1 |
| Producción (solo lectura) | `wyzzrjeeuwjiqzseclob` |
| Entorno del arnés | `.env.rag-eval.local` en la raíz (ignorado). Tiene URL y service_role del proyecto de desarrollo, `HF_TOKEN`, `GROQ_API_KEY` |
| Mapeo organización → administrador | `C:\ProyectosClaudeCode\org-map.json`, **fuera del repo**. Variable `RAG_EVAL_ORG_MAP` |
| Corpus sintético | `rag-eval/corpus/ORG-A` y `ORG-B` (8 documentos cada una); sembrado: 16 documentos, 32 fragmentos |
| Hash del corpus sembrado | `corpus_hash 02c01b93223d16f2…` |
| Pruebas | `npm run test:rag-eval` → **68 pasan** |

## Hecho
1. **Tarea 1:** `dataset/xlsx_to_jsonl.py` (convierte y valida la plantilla), `runner/corpusHash.ts` (`corpus_hash` e `index_hash`), `runner/orgMap.ts`.
2. **Extracción pura** a `lib/ragPipeline.ts`; `/api/chat` lo importa. `runner/equivalence.test.ts` compara la ruta anterior (copia congelada del commit `488b944`) con la actual en 10 consultas y 18 fallos. Se sembraron 5 errores a propósito y los detectó todos.
3. **Recolector** `runner/collect.ts` + `configs/baseline.json` (E0). Rechaza E0 si deja de coincidir con las constantes de producción. **Nunca se ejecutó contra servicios reales**; solo con simulaciones.
4. **Corpus sintético** y `runner/seedCorpus.ts` (se niega a correr contra producción). Sembrado y comprobado con embeddings reales: cada empresa recupera su propia regla (12 vs 14 caracteres) y el filtro por documento ajeno devuelve 0 filas.
5. **Conjunto de evaluación:** `dataset/draft_questions.py` generó el borrador (gpt-oss-120b, distinto del generador del chat). Los 10 casos de **aislamiento se escribieron a mano** (`dataset/isolation_cases.py`, verificados contra el corpus) porque los del LLM se apoyaban en temas que ambas empresas cubren.
6. **Verificación de la revisión:** `dataset/verify_review.py` → `docs/rag-eval/INFORME_VERIFICACION_REVISION.md` y `dataset/hoja_verificacion_revisores.xlsx`.

## Hallazgos que importan
- **Revisión no demostrada.** El archivo `conjunto_evaluacion_revisado.xlsx` marca «Sí» en las 110 filas, con **0 cambios** respecto al borrador y la misma nota en todas. No se debe afirmar «referencias revisadas por especialistas» en el paper hasta que los revisores devuelvan la hoja de verificación con decisiones explícitas. Mientras tanto el conjunto no está fijado.
- **El problema de los 512 caracteres:** 688 de 698 fragmentos (98,6 %) de producción superan 512 caracteres, y en el corpus sintético también. El modelo de embeddings `paraphrase-multilingual-MiniLM-L12-v2` tiene `max_seq_length: 128` tokens (≈ 450–550 caracteres, verificado en su tarjeta). El recorte de `embedHF` está alineado con el modelo: el defecto es indexar fragmentos de hasta 800 caracteres y vectorizar solo ~500. La solución propuesta (E4) son fragmentos ≤ ~450 caracteres con reindexación en desarrollo; hay que recalibrar el umbral 0,38 después (E1).
- **La búsqueda filtra por empresa después del índice HNSW (aproximado):** una empresa pequeña podría recibir menos de 5 fragmentos. `collect.ts` lo mide (`top_matches_candidates`).
- **Las ramas de Supabase requieren plan Pro**; por eso el desarrollo es un proyecto aparte. Las migraciones de producción no incluyen las tablas de documentos: el esquema mínimo está en `dev-schema.sql`.
- Corpus de producción (solo conteos): 4 administradores con documentos, 698 fragmentos. **No usar con juez externo sin autorización.**

## Pendiente (en este orden)
1. **Parada A, falta la elección del juez de RAGAS.** Presentar 2–3 candidatos (distinto de `gpt-oss-20b`, temperatura 0, instrucciones en español) con costo estimado; el gasto grande son unas 2 000 llamadas. Fijar versión de RAGAS y verificar nombres y firmas de la API instalada.
2. **Revisión del conjunto — hecha el 2026-10-04** por Fabian Astrada Contreras (A) y Javier Mamani Salinas (B) sobre 35 de 110 filas; 7 discrepancias resueltas y aplicadas en `dataset/revisado_v2.xlsx` (Q15, Q28, Q69, Q70 reformuladas; B08 y B09 reemplazadas por preguntas sin respuesta en el corpus; Q77 se mantuvo). Las 75 filas restantes siguen sin revisión explícita. Antes: **cerrar la revisión del conjunto:** los dos revisores trabajan por separado en `hoja_verificacion_revisores.xlsx`; pasar las correcciones al conjunto, volver a correr `xlsx_to_jsonl.py` y `verify_review.py`, y entonces fijar el hash del conjunto.
3. **Línea base de recuperación** (`collect.ts --no-generate`, casi sin costo): hit@k, MRR, impacto de los 512 caracteres. Puede hacerse antes de cerrar la revisión, como prueba del arnés, y avisando que el conjunto aún no está validado.
4. **Tareas 3 a 8, sin empezar:** `retrieval_metrics.py`, `ragas_metrics.py`, `isolation_check.py`, `compare_configs.py` (E1–E6, Wilcoxon/McNemar con corrección de Holm, bootstrap), `human_review.py` (muestra de 40, kappa ponderado), `report.py` (paleta gris y azul `#1F3A5F`). Faltan también `configs/e1…e6`.
5. **Parada B:** mostrar E0 y aislamiento antes de los experimentos.

## Pendientes fuera de rag-eval
- `git push origin main` (2 commits): el usuario decide cuándo, porque despliega a producción.
- Después del despliegue, aplicar `docs/sql/messages_insert_user_only.sql` en producción. **Aplicarlo antes rompe el guardado de respuestas del chat.**
- Archivos sin seguimiento que **no** se suben: `docs/plan-gestion-proyecto.md` (el usuario pidió no subirlo), y `docs/cyberchat-contexto-plataforma.md` (nada lo referencia; preguntar).
- Los Excel corregidos de HU y CP están en Descargas; los `Espinoza_Leon_*` no llevan las correcciones (la oferta de pasarlas sigue abierta).

## Comandos útiles
```bash
npm run test:rag-eval
python rag-eval/dataset/xlsx_to_jsonl.py --xlsx ruta/revisado.xlsx
python rag-eval/dataset/verify_review.py --reviewed ruta/revisado.xlsx --draft rag-eval/dataset/conjunto_borrador.xlsx
RAG_EVAL_ORG_MAP=../org-map.json npx tsx --env-file=.env.rag-eval.local rag-eval/runner/corpusHash.ts
npx tsx --env-file=.env.rag-eval.local rag-eval/runner/seedCorpus.ts --org-map-out ../org-map.json
```

## Notas de entorno
- Windows, shell Bash/PowerShell. `python` es 3.14; para imprimir tildes usa `PYTHONIOENCODING=utf-8`.
- El generador del chat es `openai/gpt-oss-20b` con `reasoning_effort: "low"` (sin eso devuelve contenido vacío con pocos tokens).
- El contexto de la sesión anterior llegó a ~550 000 tokens y consumía rápido el límite: conviene trabajar en sesiones nuevas.

## Actualización 2026-10-05 — E0 ejecutada (Parada B)
- Juez: `qwen/qwen3.8-27b` (Groq, temperatura 0, instrucción en español), RAGAS 0.4.3 en `rag-eval/.venv` (con `langchain<1`; `scikit-network` no compila en Python 3.14 y no se usa). Gasto ≈ $2,55 de un tope de $6.
- `evaluate/ragas_metrics.py` (reanudable, con tope de presupuesto) e `evaluate/isolation_check.py` listos. Resultados en `rag-eval/results/E0-20261004T230253-6526ce2*.jsonl` (ignorados por git).
- E0: recall 0,85 · precisión 0,79 · faithfulness 0,56 · relevancia 0,79; 9 de 80 consultas sin contexto; 7 registros con error del sistema (Q20, Q49, Q70 HTTP 400; Q36 embeddings, repetible). Faithfulness sin validar contra la revisión humana.
- Aislamiento: 0 fragmentos ajenos en los contextos y en los 20 candidatos (30 registros); 0 fugas reales de texto.
- Falta: `human_review.py`, `retrieval_metrics.py`, `compare_configs.py`, `report.py`, `configs/e1…e6`. Esperar al usuario antes de E1–E6.
- `evaluate/retrieval_metrics.py` listo. E0: hit@1 0,66 · hit@5 0,90 · MRR 0,76 · llega al prompt 0,76; cita dentro de la ventana de 512 caracteres hit@1 0,77 (n=60) vs 0,32 si queda parcial/fuera (n=19). Corpus de solo 16 fragmentos por empresa: hit@10 es casi trivial.
- `evaluate/human_review.py` listo (modos `muestra` y `analizar`). Hoja de 40 respuestas en `rag-eval/results/revision_humana.xlsx` (ignorada por git); falta que Fabian y Javier la completen por separado. El modo `analizar` se probó solo con calificaciones aleatorias de prueba, no con datos reales.
- `evaluate/compare_configs.py` listo (emparejado por consulta, bootstrap IC 95 %, McNemar exacto / Wilcoxon, Holm sobre toda la invocación). Validado solo con E0 contra sí misma y contra una corrida simulada; falta ejecutarlo con E1–E6 reales. Requiere scipy en `rag-eval/.venv`.
- `evaluate/report.py` listo: informe Markdown + 4 figuras en `results/<run_id>_informe/` (ignorado). Generado para E0. Con `--compare` agrega la tabla de compare_configs.py. Faltan solo configs E1–E6 y su ejecución.

## Actualización — E1 y E2 ejecutadas (2026-10-05)
- E1 (umbral 0,30) y E2 (reescritura de consulta con historial), 1 repetición cada una; comparación en `results/comparacion_E0_E1_E2.csv`, informes en `results/<run>_informe/`. Gasto del juicio: E1 $1,39 + E2 $1,30. Gasto total acumulado ≈ $5,3 de un tope de $8 (estimado por tokens y precio de lista; confirmar en la consola de Groq).
- Tras Holm (20 pruebas) **ninguna diferencia es significativa**. Sin corregir: E2 sube «llega al prompt» de 0,76 a 0,86 (p=0,008) y en seguimiento hit@1 0,38→0,63 y llega al prompt 0,44→0,94; E1 sube «llega al prompt» a 0,84 sin cambiar Faithfulness (0,556→0,573). Son indicios, no resultados confirmados.
- Pendiente: E3–E6 (top-k, fragmentos ≤450 caracteres con reindexación en desarrollo, etc.), revisión humana, repetir Q36.
- Confirmación de E2 (`configs/e2_confirmacion.json`, 16 consultas de seguimiento × 3 repeticiones, `results/comparacion_E0_E2conf.csv`): réplica sobre el ruido del generador, **no datos nuevos** (mismas consultas). «Llega al prompt» 0,44→0,94 (McNemar p=0,008; Holm sobre 10 pruebas 0,078); recall 0,64→1,00; Faithfulness 0,33→0,36 sin cambio. 3 registros con HTTP 400 del generador (Q49, Q50). Gasto $0,60; acumulado ≈ $5,9 de $8.
