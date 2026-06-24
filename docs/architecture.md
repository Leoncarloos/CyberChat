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
        ├── HuggingFace Inference API → Embeddings all-MiniLM-L6-v2 (384-dim)
        └── Groq API                  → llama-3.1-8b-instant (LLM)
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
| Embeddings | HuggingFace Inference API — `all-MiniLM-L6-v2` |
| LLM | Groq — `llama-3.1-8b-instant` |
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
  → Groq chat/completions (llama-3.1-8b-instant, temp=0.2, max 18 turnos)
  → Devolver { answer, matchesCount, bestSimilarity, usedContext, sources }
```

## Decisiones técnicas

### Por qué Groq + llama-3.1-8b-instant
Latencia ultra-baja (Groq hardware especializado). El modelo 8B es suficiente para Q&A de ciberseguridad en español con RAG bien construido.

### Por qué HuggingFace para embeddings
`all-MiniLM-L6-v2` es el estándar de facto para embeddings semánticos en 384 dimensiones. Gratuito con HF_TOKEN. Alternativa viable: OpenAI `text-embedding-3-small`.

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
