# Resultados de la evaluación del RAG: lo que se puede escribir en el paper

Fuente: corridas E0, E1 y E2 del arnés `rag-eval/` sobre un corpus sintético de dos empresas ficticias.
Cada cifra remite a un archivo en `rag-eval/results/` (ignorado por git; se regenera con los scripts).

## Qué se evaluó
- 80 consultas en español (8 temas × 10; 8 documentales y 2 de seguimiento por tema) y una batería aparte de 30 casos.
- Corpus: 16 documentos, 32 fragmentos, 2 organizaciones. Es pequeño: lo que se mide es el comportamiento del
  pipeline, no el rendimiento en una empresa real.
- Sistema: el RAG de producción (embeddings `paraphrase-multilingual-MiniLM-L12-v2`, umbral 0,38, 5 fragmentos,
  generador `gpt-oss-20b`), ejecutado a través del mismo código que el chat.
- Juez de RAGAS (v0.4.3): `qwen3.8-27b`, temperatura 0, instrucciones en español.

## Resultados que se pueden afirmar

**1. Aislamiento entre organizaciones.** En 10 casos × 3 repeticiones (30 registros), ninguna consulta recuperó
un fragmento de otra empresa: 0 fragmentos ajenos en el prompt y 0 entre los 20 candidatos de la búsqueda ampliada.
Ninguna respuesta copió texto del corpus de la otra empresa.

**2. Recuperación (línea base E0, 79 consultas con recuperación válida).**

| Grupo | hit@1 | hit@3 | hit@5 | MRR | Llega al prompt |
|---|---|---|---|---|---|
| Todas | 0,66 | 0,82 | 0,90 | 0,76 | 0,76 |
| Documentales (63) | 0,73 | 0,86 | 0,91 | 0,81 | 0,84 |
| Seguimiento (16) | 0,38 | 0,69 | 0,88 | 0,57 | 0,44 |

«Llega al prompt» = el fragmento correcto supera el umbral y entra al contexto del generador. Una consulta
(Q36) quedó fuera por una falla del servicio de embeddings.

**3. Las preguntas de seguimiento son el punto débil.** Una pregunta como «¿Y si ya hice clic?» se busca sin su
contexto y recupera mal: hit@1 0,38 frente a 0,73 en las documentales.

**4. Mitigación probada (E2).** Reescribir la pregunta con el historial antes de buscar elevó, en las 16 consultas
de seguimiento, «llega al prompt» de 0,44 a 0,94 y hit@1 de 0,38 a 0,63, y se repitió en una segunda corrida.
Es un resultado **exploratorio**: son 16 consultas, las mismas en las dos corridas, y tras la corrección de Holm
por pruebas múltiples la diferencia no alcanza significancia (p corregido 0,078; sin corregir, 0,008).

**5. Context Recall y Context Precision (RAGAS, E0).** 0,85 y 0,79 en conjunto (0,89 y 0,83 en documentales;
0,64 y 0,53 en seguimiento). Un juez, una ejecución.

**6. Fidelidad validada por revisión humana (E0, 40 respuestas).** Dos revisores (Fabian Astrada Contreras y
Javier Mamani Salinas), trabajando por separado, calificaron la fidelidad de las respuestas contra los fragmentos
recuperados en escala 0/1/2. Acuerdo exacto 0,85 y kappa ponderado cuadrático 0,79 (acuerdo sustancial). La
correlación entre la media humana y el puntaje de Faithfulness del juez fue Spearman 0,76. Por nivel humano, el
juez dio en promedio 0,28 (nivel 0, n=5), 0,48 (nivel 1, n=20) y 0,90 (nivel 2, n=15): el juez ordena las respuestas
como los humanos. Hallazgo sobre el sistema: solo 30–38 % de las respuestas se calificó totalmente fiel (2); 55–60 %
mezcla lo respaldado con afirmaciones que no están en los fragmentos (1) y 8–10 % contradice o inventa lo central (0).
Esto respalda usar Faithfulness (≈0,56 en E0) como medida, y la brecha seguimiento–documental (0,31 frente a 0,60)
como resultado del sistema.

## Hallazgo técnico para discutir
Cuando el fragmento relevante tiene su cita fuera de los primeros 512 caracteres, la recuperación empeora:
hit@1 0,32 (19 consultas) frente a 0,77 (60 consultas). El modelo de embeddings solo vectoriza ~512 caracteres y el
sistema indexa fragmentos de hasta 800. Es una **asociación observada**, sin controlar otras causas, y no se probó
la corrección (fragmentos más cortos).

## Lo que NO se debe afirmar
- **Answer Relevancy (0,79) como medida de calidad.** La revisión humana no la valida: los revisores calificaron
  39 de 40 respuestas como relevantes (casi sin variación), así que el kappa de 1,00 no informa y la correlación
  con el juez es baja (Spearman 0,27). El juez parece subestimar la relevancia. No usarla como resultado.
- **Que Faithfulness mide la calidad real sin matices.** La validación es sobre 40 respuestas de E0 y dos revisores;
  declarar ese tamaño.
- **«Referencias revisadas por especialistas» para el conjunto completo.** Dos revisores verificaron 35 de las
  110 filas; las otras 75 no tienen revisión explícita. Si se cita, decir «una muestra de 35 filas».
- **Que E1 (umbral 0,30) mejora algo.** Solo aumentó la proporción con contexto; no mejoró fidelidad ni relevancia.
- **Diferencias «significativas».** Ninguna lo es tras corregir por pruebas múltiples.
- **Resultados en empresas reales.** El corpus es sintético y pequeño.

## Limitaciones que conviene declarar
Corpus sintético de dos organizaciones; un solo juez de RAGAS de una familia distinta del generador; una ejecución
por configuración (E0 con 3 repeticiones, E1 y E2 con 1); el umbral de E1 se eligió mirando los mismos datos;
9 de 80 consultas no recuperaron contexto en E0 y 7 registros fallaron por errores del generador (HTTP 400), todos
contados en los denominadores.
