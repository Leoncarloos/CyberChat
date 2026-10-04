# ADR-0003 — Groq como proveedor de inferencia LLM

**Estado:** Aceptada (modelo revisado el 2026-09-11 y el 2026-09-26 — vigente: `openai/gpt-oss-20b`)
**Fecha original:** anterior al 2026-09-11 · **Última revisión:** 2026-09-11

## Contexto

El chatbot RAG de CyberChat necesita inferencia de LLM en español para responder
preguntas de concientización en ciberseguridad a empleados de MYPEs peruanas, con
buena calidad y baja latencia (interacción conversacional en tiempo real), dentro del
presupuesto de un proyecto de tesis (sin presupuesto de infraestructura de cómputo
propio).

## Opciones consideradas

1. **OpenAI** — modelos de alta calidad, pero costo y latencia mayores para el volumen
   de interacciones esperado en un piloto.
2. **Modelo open-source autoalojado** — sin presupuesto ni experiencia operativa de
   infraestructura de ML para este equipo/cronograma.
3. **Groq** — hardware especializado para inferencia de baja latencia, catálogo de
   modelos open-weight (Llama, Qwen, etc.), tier gratuito viable para el volumen del
   piloto.

## Decisión

**Se elige Groq (opción 3).** Dentro del catálogo de Groq, el modelo usado migró de
`llama-3.1-8b-instant` a **`qwen/qwen3.8-27b`** el 2026-09-11, tras confirmar (con
`GET /v1/models`, respuesta 404) que Groq descontinuó por completo el modelo Llama
original — ya no queda ningún modelo de esa familia en el catálogo.

Se evaluó y **se descartó** `openai/gpt-oss-20b` como alternativa dentro de Groq: es un
modelo de razonamiento que gasta tokens en un campo `reasoning` oculto antes de
responder, y con `max_tokens` bajos (ej. los 300 que usa `/api/dashboard` para generar
recomendaciones) devuelve `content` vacío — esto habría roto silenciosamente las
recomendaciones de IA si se hubiera adoptado sin pruebas.

## Consecuencias

**Positivas:**
- Latencia ultra-baja gracias al hardware especializado de Groq, adecuada para chat
  conversacional en tiempo real.
- `qwen/qwen3.8-27b` da buena calidad en español para Q&A de ciberseguridad con RAG
  bien construido, sin el comportamiento de "reasoning" que consumiría el presupuesto
  de tokens de la respuesta final.

**Riesgos:**
- **Dependencia del catálogo de Groq**: los modelos pueden descontinuarse sin mucho
  aviso, como ocurrió con `llama-3.1-8b-instant`. Hoy el nombre del modelo está
  hardcodeado por string en 4 archivos distintos (`app/api/chat`, `app/api/dashboard`,
  `app/api/org-summary`, `app/api/recommendations`), lo que obliga a un cambio manual
  en cada uno si el proveedor retira el modelo otra vez.
- Este riesgo es la motivación directa del **Adapter Pattern para LLM/embeddings**
  (issue #11, `lib/adapters/llm.ts`): centralizar el nombre del modelo y la llamada al
  proveedor en un solo lugar reduce el próximo swap a un cambio de una línea.

## Actualización — 2026-09-26: se adopta `openai/gpt-oss-20b`

Se revierte el descarte anterior. El motivo es el costo: `gpt-oss-20b` cuesta $0.075 por
millón de tokens de entrada y $0.30 de salida, contra $0.80 y $4.00 de `qwen/qwen3.8-27b`
— **13 veces más barato**, y además el doble de rápido (~1000 t/s contra 450 t/s).

El problema que motivó el descarte es real y se reprodujo contra la API: con
`max_tokens: 300` y el esfuerzo de razonamiento por defecto, el modelo gastó los 300
tokens en el campo `reasoning` y devolvió `content` vacío (`finish_reason: length`).

La solución es enviar **`reasoning_effort: "low"`** en la llamada. Con esa opción, medido
sobre el mismo prompt de `/api/dashboard`: el razonamiento baja de 1238 a 61 caracteres,
el consumo cae de 300 a 112 tokens de salida, `finish_reason` vuelve a `stop` y las 3
recomendaciones llegan completas. También se verificó la salida en JSON de
`/api/recommendations` (JSON válido) y una respuesta larga del chat en español.

Las cuatro rutas envían ahora `reasoning_effort: "low"` junto al nombre del modelo. El
riesgo de tener el modelo hardcodeado en 4 archivos sigue vigente, y este cambio —que
obligó a tocar los mismos 4 archivos más una opción nueva— refuerza la necesidad del
Adapter Pattern (issue #11).
