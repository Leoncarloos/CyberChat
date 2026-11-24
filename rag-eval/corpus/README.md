# Corpus sintético de evaluación

Documentos **ficticios** para evaluar el RAG sin usar datos de empresas reales. No describen
ninguna organización existente y se pueden enviar a un modelo juez externo.

| Alias | Empresa ficticia | Giro |
|---|---|---|
| ORG-A | Ferretería Andina S.A.C. | Ferretería con ventas por WhatsApp y tienda web |
| ORG-B | Clínica Dental Sonrisa S.A.C. | Clínica con citas en línea e historias clínicas |

Cada organización tiene 8 políticas, una por tema del diccionario. **Las reglas son distintas a
propósito** (por ejemplo, contraseñas de 12 caracteres en ORG-A y de 14 en ORG-B; reporte de
correo sospechoso en 2 horas y en 1 hora), de modo que una mezcla entre empresas se note en la
respuesta y no solo en los identificadores.

Los correos, teléfonos y nombres son inventados (dominios `.example`).

Se siembran en una base de desarrollo con `rag-eval/runner/seedCorpus.ts`.
