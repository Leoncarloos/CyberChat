# ADR-0003 — Groq como proveedor de inferencia LLM

**Estado:** Aceptada (modelo revisado el 2026-09-11)
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
