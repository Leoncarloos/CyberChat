# Arquitectura del sistema

## Diagrama de alto nivel

```
Browser
  │
  ├── /chat, /admin, /manage          → Next.js App Router (client components)
  │
  └── /api/*                          → Next.js Route Handlers (Node.js runtime)
        │
        ├── supabaseServer()          → Supabase (Auth + Postgres + Storage)
        ├── HuggingFace Inference API → Embeddings paraphrase-multilingual-MiniLM-L12-v2 (384-dim)
        └── Groq API                  → openai/gpt-oss-20b (LLM)
```

## Stack tecnológico
| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Lenguaje | TypeScript 5 |
| Base de datos | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (JWT + cookies SSR) |
| Storage | Supabase Storage (bucket `documents`) |
| Embeddings | HuggingFace Inference API — `paraphrase-multilingual-MiniLM-L12-v2` |
| LLM | Groq — `openai/gpt-oss-20b` |
| Deploy | Vercel (inferido) |

## Flujo RAG detallado

### Ingesta (admin → `/api/documents/upload-and-process`)
```
File upload (PDF/DOCX/TXT)
  → Supabase Storage (bucket: documents, path: {user_id}/{uuid}.ext)
  → INSERT into documents
  → DELETE old document_chunks for document_id
  → Extracción de texto (pdf-extraction / mammoth)
  → Chunking (tamaño fijo con overlap)
  → Embedding por chunk (HF API → float[384])
  → INSERT into document_chunks (content, embedding, document_id, user_id)
```

### Inferencia (usuario → `/api/chat`)
```
POST { messages, document_id? }
  → Validar sesión (supabaseServer + getUser)
  → Extraer último mensaje de usuario
  → Embedding del query (HF API)
  → RPC match_document_chunks_scoped(query_embedding, match_count=6, filter_user_id, filter_document_id)
  → Filtrar por umbral similaridad 0.25 → top-5 chunks
  → Construir system prompt con contexto
  → Groq chat/completions (openai/gpt-oss-20b, temp=0.15, últimos 12 mensajes)
  → Devolver { answer, matchesCount, bestSimilarity, usedContext, sources }
```

## Decisiones técnicas

### Por qué Groq + openai/gpt-oss-20b
Latencia ultra-baja (Groq usa hardware especializado). `gpt-oss-20b` cuesta $0.075 por millón de
tokens de entrada y $0.30 de salida, frente a $0.80 y $4.00 de `qwen/qwen3.8-27b`: **13 veces más
barato** y el doble de rápido (~1000 t/s), con calidad suficiente en español para Q&A de
ciberseguridad apoyado en RAG.

Es un modelo que razona antes de responder, y ese razonamiento consume el presupuesto de tokens de
la respuesta: con `max_tokens: 300` y esfuerzo por defecto la respuesta llega **vacía** (verificado
contra la API el 2026-09-26). Por eso las cuatro rutas que llaman a Groq envían
`reasoning_effort: "low"`, con lo que el razonamiento baja a unas pocas decenas de caracteres, llega
en un campo aparte y no toca el contenido.

Historial de cambios de modelo: `llama-3.1-8b-instant` fue retirado del catálogo de Groq (swap a
`qwen/qwen3.8-27b` el 2026-09-11); cambio a `openai/gpt-oss-20b` por costo el 2026-09-26.

### Por qué HuggingFace para embeddings
`paraphrase-multilingual-MiniLM-L12-v2` es multilingüe (reemplazó a `all-MiniLM-L6-v2`, entrenado solo en inglés) y genera embeddings de 384 dimensiones. Gratuito con HF_TOKEN. Alternativa viable: OpenAI `text-embedding-3-small`.

### Por qué Supabase
Auth + Postgres + pgvector + Storage en una sola plataforma. El RLS (Row Level Security) de Postgres gestiona el aislamiento multiempresa sin código adicional.

### Por qué Next.js App Router
SSR nativo para Supabase SSR con cookies. API Routes en el mismo repo. No necesitamos backend separado para este scope.

## Limitaciones actuales
- Protección de rutas solo client-side (middleware no bloquea server-side)
- Quiz hardcodeado en cliente — no escala a múltiples evaluaciones
- `document_id` en `/api/chat` aceptado pero no enviado desde frontend
- Sin streaming de respuestas — el LLM espera full response antes de devolver
- Sin límite de rate en `/api/chat` — riesgo de abuso de créditos HF/Groq
