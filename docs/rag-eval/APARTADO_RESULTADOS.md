# Resultados

> Borrador del apartado para el paper. Todas las cifras salen de las corridas E0, E1 y E2 del arnés `rag-eval/`
> y de la revisión humana de 40 respuestas; el respaldo de cada una está en
> `docs/rag-eval/RESULTADOS_PARA_EL_PAPER.md`. Los números de tabla usan coma decimal.

## 1. Configuración de la evaluación

Se evaluó el sistema RAG de CyberChat tal como corre en producción: embeddings
`paraphrase-multilingual-MiniLM-L12-v2` (384 dimensiones), recuperación de los 5 fragmentos más similares con un
umbral de similitud de 0,38, y generación con `gpt-oss-20b` (temperatura 0,15). La evaluación usó el mismo código
que el chat, extraído a un módulo compartido, y se verificó con una prueba de equivalencia entre la versión anterior
y la actual.

El conjunto de evaluación consta de 80 consultas en español (8 temas × 10: 8 documentales y 2 de seguimiento por
tema) y de una batería aparte de 30 casos (10 de aislamiento entre organizaciones, 10 sin respuesta en los documentos
y 10 fuera del alcance). El corpus es sintético: 16 documentos de dos empresas ficticias, divididos en 32 fragmentos.
Las métricas de generación se calcularon con RAGAS (versión 0.4.3), con `qwen3.8-27b` como juez (temperatura 0,
instrucciones en español), un modelo de familia distinta a la del generador. La línea base (E0) se ejecutó con tres
repeticiones por consulta. La recuperación es determinista y se calculó una vez por consulta.

## 2. Recuperación

La Tabla 1 muestra la calidad de la recuperación en la línea base. Se consideró relevante el fragmento que contiene
la cita de evidencia esperada de la consulta. Una consulta (Q36) quedó fuera por una falla del servicio de embeddings,
de modo que los valores corresponden a 79 consultas.

**Tabla 1.** Recuperación en la línea base (E0).

| Grupo | Consultas | hit@1 | hit@3 | hit@5 | MRR | nDCG@5 | Llega al prompt |
|---|---|---|---|---|---|---|---|
| Todas | 79 | 0,66 | 0,82 | 0,90 | 0,76 | 0,78 | 0,76 |
| Documentales | 63 | 0,73 | 0,86 | 0,91 | 0,81 | 0,81 | 0,84 |
| Seguimiento | 16 | 0,38 | 0,69 | 0,88 | 0,57 | 0,64 | 0,44 |

«Llega al prompt» indica la proporción de consultas en que el fragmento correcto supera el umbral de similitud y
entra al contexto del generador. Dado que cada empresa tiene solo 16 fragmentos, hit@10 es casi trivial (0,99) y no
se interpreta.

La diferencia entre tipos de consulta es la principal: las preguntas de seguimiento («¿Y si ya hice clic?») se buscan
sin el contexto de la conversación y recuperan mucho peor (hit@1 de 0,38 frente a 0,73). En 9 de las 80 consultas
ningún fragmento superó el umbral y el sistema respondió sin documentos.

**Ventana de embeddings.** El modelo de embeddings procesa unos 512 caracteres, mientras que el sistema indexa
fragmentos de hasta 800. Cuando la cita relevante quedó completa dentro de esa ventana (60 consultas), hit@1 fue
0,77 y el fragmento llegó al prompt en el 83 % de los casos; cuando quedó parcial o fuera (19 consultas), hit@1 fue
0,32 y llegó en el 53 %. Se trata de una asociación observada, sin controlar otras causas (por ejemplo, que los
fragmentos más largos sean más genéricos), y no se probó la corrección.

## 3. Aislamiento entre organizaciones

En los 10 casos de aislamiento, con tres repeticiones cada uno (30 registros), ninguna consulta recuperó un
fragmento de otra empresa: se observaron 0 fragmentos ajenos tanto en los cinco que entran al prompt como en los
veinte candidatos de la búsqueda ampliada. Tampoco se encontraron respuestas que copiaran texto del corpus de la otra
organización. Algunas respuestas contenían información genérica no proveniente de los documentos (véase la
sección 4), pero ninguna filtró datos de la otra empresa.

## 4. Fidelidad y relevancia de las respuestas

**Tabla 2.** Métricas RAGAS en la línea base (E0).

| Métrica | Todas | Documentales | Seguimiento |
|---|---|---|---|
| Context Recall | 0,85 | 0,89 | 0,64 |
| Context Precision | 0,78 | 0,83 | 0,53 |
| Faithfulness | 0,56 | 0,60 | 0,31 |
| Answer Relevancy | 0,79 | 0,81 | 0,70 |

Context Recall y Context Precision se calcularon sobre 70 consultas, y Faithfulness y Answer Relevancy sobre 206 respuestas; el resto
no se puntuó por falta de contexto recuperado o por error del sistema, y ese denominador se reporta aparte.

**Validación humana de Faithfulness.** Dos revisores calificaron por separado, en una escala de 0 a 2, la fidelidad
de 40 respuestas de E0 (32 documentales y 8 de seguimiento) contra los fragmentos recuperados. El acuerdo exacto fue
de 0,85 y el kappa ponderado cuadrático de 0,79. La correlación de Spearman entre la media humana y el puntaje del
juez fue de 0,76; el juez asignó en promedio 0,28, 0,48 y 0,90 a las respuestas que los humanos calificaron con 0, 1 y
2, respectivamente. Es decir, el juez ordena las respuestas de manera consistente con el criterio humano.

Según los revisores, entre el 30 % y el 38 % de las respuestas fue totalmente fiel a los fragmentos, entre el 55 % y
el 60 % combinó contenido respaldado con afirmaciones ausentes de los fragmentos, y entre el 8 % y el 10 % contradijo
o inventó lo central. La diferencia entre consultas documentales y de seguimiento (0,60 frente a 0,31) coincide con
el patrón observado en la recuperación.

**Answer Relevancy.** El juez asignó 0,79 en promedio (0,81 en documentales y 0,70 en seguimiento), lo que indica que
las respuestas atienden en general lo preguntado, con menor ajuste en las consultas de seguimiento. La validación
humana de esta dimensión tiene una limitación que se detalla en la sección 6.

## 5. Mitigaciones exploradas

Se evaluaron dos modificaciones respecto de la línea base, cada una con una repetición por consulta.

**Reescritura de la consulta con el historial (E2).** Antes de buscar, una llamada al generador reformula la pregunta
de seguimiento para que se entienda sola. En las 16 consultas de seguimiento, la proporción en que el fragmento
correcto llega al prompt pasó de 0,44 a 0,94, hit@1 de 0,38 a 0,63 y MRR de 0,57 a 0,79. Una segunda ejecución de la
misma configuración, con tres repeticiones, reprodujo el resultado. Faithfulness no cambió (0,33 frente a 0,36), lo
que indica que mejorar la recuperación no basta para corregir las afirmaciones no respaldadas del generador.

**Umbral de similitud de 0,30 (E1).** Elevó la proporción en que el fragmento correcto llega al prompt de 0,76 a 0,84, sin cambios en
Faithfulness (0,56 frente a 0,57) ni en Answer Relevancy.

Estos resultados son exploratorios. Tras corregir por pruebas múltiples (Holm), ninguna diferencia alcanzó
significancia; para la mejora principal de E2 el valor p fue de 0,008 sin corregir y 0,078 corregido. El umbral de E1 se
eligió observando los mismos datos con los que se evaluó, y la segunda ejecución de E2 reutilizó las mismas consultas,
por lo que replica el ruido del generador pero no aporta consultas nuevas.

## 6. Limitaciones

El corpus es sintético y pequeño (dos organizaciones, 32 fragmentos), por lo que los resultados describen el
comportamiento del sistema y no su desempeño en una empresa real. Se usó un único juez de RAGAS y una única ejecución
por configuración (E0 con tres repeticiones; E1 y E2 con una). El conjunto de evaluación fue verificado por dos
revisores en una muestra de 35 de sus 110 elementos; los 75 restantes no tuvieron revisión explícita. Siete registros
de E0 fallaron por errores del servicio (cuatro del generador y tres de embeddings) y se contaron en los
denominadores. La validación humana de Faithfulness se basa en 40 respuestas y dos revisores.

Respecto de Answer Relevancy, la revisión humana no permitió validar el juez: los dos revisores calificaron como
relevantes 39 de las 40 respuestas, de modo que la escala casi no varió, el kappa de 1,00 no aporta información y la
correlación con el juez fue baja (Spearman de 0,27). Esto sugiere que el juez tiende a asignar puntajes menores a los
de un lector humano en esta dimensión, por lo que 0,79 debe leerse como una cota inferior no validada y no como una
medida calibrada de relevancia.
