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
| Registro con `user_input`, `response`, `retrieved_contexts` y `reference`, orden de recuperación y configuración del generador | `runner/collect.ts` | Pendiente |
| Consultas sin contexto o con fallo, reportadas con su denominador | `runner/collect.ts` y `evaluate/report.py` | Pendiente |
| Versión de RAGAS, modelo juez e instrucciones en español fijados | `evaluate/ragas_metrics.py`, `evaluate/requirements.txt` | Pendiente |
| Revisión independiente de una muestra de respuestas | `evaluate/human_review.py` | Pendiente |

## Decisiones tomadas en la Tarea 1

- **El validador no completa datos.** Una fila incompleta se informa y queda fuera del JSONL.
- **`evidencia_esperada` es un aviso, no un error.** Una consulta sin evidencia se evalúa en
  generación, pero queda fuera de hit@k, recall@k, MRR y nDCG, y así se informa.
- **Dos huellas del corpus.** `corpus_hash` identifica el texto; `index_hash` distingue dos
  indexaciones del mismo texto, que es lo que cambia en el experimento E4.
