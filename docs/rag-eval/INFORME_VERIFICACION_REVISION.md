# Informe de verificación de la revisión del conjunto de evaluación

Fecha del informe: 2026-10-04 · Archivo verificado: `revisado.xlsx` · SHA-256 `7cd8d8595a68a622…`

Este informe responde a una sola pregunta: **¿el conjunto revisado ya puede considerarse revisado por especialistas, como exige la sección 5.C del paper?** Los controles son automáticos y se repiten con `python rag-eval/dataset/verify_review.py`.

## 1. Conclusión

- **El conjunto es estructuralmente correcto y sus citas son textuales.** Pasa todos los controles automáticos.
- **La revisión humana no está demostrada.** Los dos revisores marcaron «Sí» en las 110 filas, sin un solo cambio respecto al borrador y con la misma nota en todas ('Validado por revisor 1 y revisor 2').
- **Hay 13 filas con observaciones automáticas** (7 del conjunto y 6 de la batería) y 22 filas de muestra de control. Se entregan en `hoja_verificacion_revisores.xlsx` (35 filas) para que cada una quede con una decisión explícita.
- **Mientras eso no se complete, la afirmación «referencias revisadas por especialistas» no debe aparecer en el paper**, y no se debe ejecutar la evaluación contra este conjunto como si estuviera validado.

## 2. Controles automáticos

| Control | Resultado | Detalle |
|---|---|---|
| 8 documentales y 2 seguimientos por tema | **Cumple** | 80 consultas, 8 temas |
| Cada evidencia es una cita textual del documento de su organización | **Cumple** | 80 de 80 |
| Cambios que introdujo la revisión (conjunto) | **Ninguno** | de 80 filas |
| Cambios que introdujo la revisión (batería) | **Ninguno** | de 30 filas |
| Batería: 10 casos por tipo | **Cumple** | aislamiento: 10, fuera_de_alcance: 10, sin_respuesta: 10 |
| Aislamiento: cada ancla está en la organización dueña y falta en la que consulta | **Cumple** | `python rag-eval/dataset/isolation_cases.py` |

## 3. Estado de la revisión

| Dato | Valor |
|---|---|
| Marcas (revisor 1, revisor 2) en 110 filas | {('Sí', 'Sí'): 110} |
| `desacuerdo_resuelto` en el conjunto | {'Sin desacuerdo': 80} |
| Texto de `notas` | {'Validado por revisor 1 y revisor 2': 110} |
| Filas del conjunto modificadas respecto al borrador | 0 de 80 |
| Filas de la batería modificadas respecto al borrador | 0 de 30 |

**Cómo leer esto.** En el borrador generado por un LLM ya se habían señalado dudas (preguntas de batería con respuesta parcial en el corpus, dos seguimientos con texto idéntico). Una revisión efectiva suele corregir, descartar o anotar algo en un lote de 110 elementos. Cero cambios y un acuerdo del 100 % no prueban que no se revisó, pero tampoco lo demuestran: no deja evidencia de qué se comprobó ni quién lo hizo. Con acuerdo total tampoco se puede calcular un kappa informativo.

## 4. Filas con observaciones

Observaciones de controles automáticos; ninguna es un error confirmado, son motivos para mirar.

| id | Organización | Observación |
|---|---|---|
| Q09 | ORG-A | Mismo texto de pregunta que Q10: confirmar que cada una se evalúa con el documento de su organización. |
| Q10 | ORG-B | Mismo texto de pregunta que Q09: confirmar que cada una se evalúa con el documento de su organización. |
| Q15 | ORG-B | La pregunta nombra a la empresa; un empleado suele decir «en la empresa» o no nombrarla. |
| Q28 | ORG-B | La pregunta nombra a la empresa; un empleado suele decir «en la empresa» o no nombrarla. |
| Q69 | ORG-A | Seguimiento que no parece depender del turno anterior: confirmar que no se entiende sola. |
| Q77 | ORG-B | Solo 57% de las palabras de la referencia aparecen en el documento citado: puede incluir información que el documento no contiene. |
| Q80 | ORG-B | Seguimiento que no parece depender del turno anterior: confirmar que no se entiende sola. |
| B03 | ORG-A | 50% de las palabras de la pregunta ya están en los documentos de su organización: confirmar que de verdad no tiene respuesta allí. |
| B04 | ORG-A | 56% de las palabras de la pregunta ya están en los documentos de su organización: confirmar que de verdad no tiene respuesta allí. |
| B06 | ORG-B | 55% de las palabras de la pregunta ya están en los documentos de su organización: confirmar que de verdad no tiene respuesta allí. |
| B07 | ORG-B | 67% de las palabras de la pregunta ya están en los documentos de su organización: confirmar que de verdad no tiene respuesta allí. |
| B08 | ORG-B | 80% de las palabras de la pregunta ya están en los documentos de su organización: confirmar que de verdad no tiene respuesta allí. El corpus menciona a la SUNAT en la definición de correo sospechoso de ORG-B y da la regla general de reporte: la pregunta podría tener respuesta parcial. |
| B09 | ORG-B | ORG-B tiene una regla de entrega de radiografías por enlace con clave: la pregunta sobre nube pública podría tener respuesta parcial. |

## 5. Muestra de control

Muestra estratificada con semilla fija (20261004): 2 consultas por tema entre las filas sin observaciones, y 2 casos de cada tipo de la batería. Conjunto: Q01, Q03, Q16, Q18, Q24, Q25, Q33, Q38, Q43, Q47, Q56, Q60, Q64, Q70, Q72, Q79. Batería: B02, B10, B15, B17, B23, B24.

## 6. Qué hay que hacer para cerrar la revisión

1. Entregar `hoja_verificacion_revisores.xlsx` a los dos revisores, **cada uno con su copia**.
2. Cada revisor decide en cada fila (Confirmo, Corrijo o Descarto) y anota qué comprobó, con su nombre y fecha.
3. Pasar las correcciones al conjunto oficial y volver a correr `xlsx_to_jsonl.py`.
4. Volver a correr este informe con el archivo corregido. Si hay desacuerdos reales, se registran en `desacuerdo_resuelto` y se calcula la concordancia entre revisores.
5. Solo entonces fijar el conjunto (su hash va en cada resultado) y pasar a la Parada B.

## 7. Qué no cubre este informe

- No comprueba que una referencia sea *correcta*: solo que sus datos aparezcan en el documento citado.
- No puede asegurar que una pregunta «sin_respuesta» carezca de respuesta en el corpus; usa solape de palabras.
- El corpus es sintético: valida el método y el arnés, no el desempeño sobre documentos reales de las MYPE.

