# Protocolo de evaluación del RAG

Cómo cada parte del arnés de [`rag-eval/`](../../rag-eval/README.md) responde a la sección 5.C del
paper. Se completa a medida que se implementa cada tarea.

| Requisito de la sección 5.C | Dónde se cumple | Estado |
|---|---|---|
| 80 consultas en español, 10 por tema | `dataset/xlsx_to_jsonl.py` valida 80 consultas y, por tema, 8 `documental` y 2 `seguimiento` | Implementado |
| Batería aparte: sin respuesta, fuera de alcance y aislamiento | Hoja `Bateria`, 10 casos por tipo; se convierte a `bateria.jsonl` | Implementado |
| Referencias revisadas por especialistas | Columnas `revisor_1`, `revisor_2` y `desacuerdo_resuelto`; el validador cuenta cuántas están validadas por ambos | Implementado |
| Versión documental fijada | `runner/corpusHash.ts`: `corpus_hash` e `index_hash` | Implementado |
| Organizaciones sin identificar | Alias `ORG-X` en el conjunto; mapeo fuera del repositorio (`RAG_EVAL_ORG_MAP`) | Implementado |
| Registro con `user_input`, `response`, `retrieved_contexts` y `reference`, orden de recuperación y configuración del generador | `runner/collect.ts`: cada registro guarda además los 20 candidatos, el prompt completo, latencias y uso de tokens | Implementado, sin ejecutar |
| Condición de uso de contexto | `used_context`, `matches_count` y `best_similarity` en cada registro | Implementado, sin ejecutar |
| Identificador de ejecución fijado | `run_id`, con el commit y las huellas del corpus y del conjunto en `<run_id>.meta.json` | Implementado, sin ejecutar |
| Consultas sin contexto o con fallo, reportadas con su denominador | `runner/collect.ts` registra los fallos sin descartarlos; el denominador lo reporta `evaluate/report.py` | Recolección implementada; informe pendiente |
| El arnés mide el sistema real | `lib/ragPipeline.ts` compartido con `/api/chat` y `runner/equivalence.test.ts` | Implementado y verificado |
| Versión de RAGAS, modelo juez e instrucciones en español fijados | `evaluate/ragas_metrics.py` (`qwen/qwen3.8-27b`, temperatura 0), `evaluate/requirements.txt` (ragas 0.4.3) | Implementado; E0 ejecutada |
| Revisión independiente de una muestra de respuestas | `evaluate/human_review.py` | Implementado; falta que los revisores completen la hoja |

## Decisiones tomadas en la Tarea 1

- **El validador no completa datos.** Una fila incompleta se informa y queda fuera del JSONL.
- **`evidencia_esperada` es un aviso, no un error.** Una consulta sin evidencia se evalúa en
  generación, pero queda fuera de hit@k, recall@k, MRR y nDCG, y así se informa.
- **Dos huellas del corpus.** `corpus_hash` identifica el texto; `index_hash` distingue dos
  indexaciones del mismo texto, que es lo que cambia en el experimento E4.

## Decisiones tomadas en la Tarea 2

- **Extracción pura.** `/api/chat` importa de `lib/ragPipeline.ts` las mismas funciones que usa el
  arnés. La prueba de equivalencia compara la ruta anterior y la actual llamada por llamada; se
  comprobó que detecta cambios en el umbral, el historial, el texto del prompt y el manejo de errores.
- **Recuperación una vez por consulta.** Es determinista, así que repetirla solo añadiría llamadas.
  Las 3 repeticiones miden la variación del generador.
- **Búsqueda de producción y búsqueda ampliada por separado.** Los contextos que se evalúan salen de
  la misma llamada que hace producción (5 resultados). Los 20 candidatos se piden aparte y se
  registra si sus primeros coinciden, en vez de suponerlo.
- **Un 429 no es un fallo del sistema evaluado.** Es el límite de la cuenta del proveedor: se
  reintenta y se anota. Si se agotan los reintentos, sí queda registrado como error.
