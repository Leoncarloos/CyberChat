# Arquitectura del sistema

## Diagrama de alto nivel

```
Browser
  │
  ├── /chat, /dashboard, /diagnostic,
  │   /manage, /admin, /org-dashboard  → Next.js App Router (client components)
  │   middleware.ts                    → refresca sesión, bloquea cuentas no activas, fuerza diagnóstico
  │
  └── /api/*                          → Next.js Route Handlers (Node.js runtime)
        │
        ├── requireActiveUser()/requireAdmin() → autorización por rol y estado vigente
        ├── supabaseServer() / supabaseAdmin() → Supabase (Auth + Postgres + Storage)
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
| Deploy | Vercel |

## Flujo RAG detallado

### Ingesta (admin → `/api/documents/upload-and-process`)
```
File upload (PDF/DOCX/TXT, máx. 10 MB) — solo rol admin
  → Extracción de texto (pdf-extraction / mammoth / UTF-8) y limpieza de espacios
  → Chunking por oraciones (máx. 800 caracteres, 1 oración de solapamiento)
  → Embedding por chunk (HF API → float[384])
  → Supabase Storage (bucket: documents, path: {admin_id}/{uuid}.ext)
  → INSERT into documents (name, storage_path, uploaded_by = admin)
  → INSERT into document_chunks (document_id, chunk_index, content, embedding)
```
Todas las validaciones (formato, tamaño, texto legible, chunks aprovechables) y los
embeddings se resuelven antes de escribir; si falla una escritura se revierte el archivo
y el documento.

### Inferencia (usuario → `/api/chat`)
```
POST { messages, conversation_id, document_id? }
  → requireActiveUser() (sesión + cuenta aprobada)
  → Verificar que conversation_id pertenece al usuario
  → Extraer último mensaje de usuario
  → Embedding del query (HF API)
  → resolveOrgAdminId(RUC de la sesión) → id del dueño de la empresa
  → RPC match_document_chunks_scoped(query_embedding, match_count=5, filter_user_id=dueño, filter_document_id)
     (vía supabaseAdmin: el RPC es SECURITY INVOKER)
  → Deduplicar y filtrar por umbral de similitud 0.38 → hasta 5 chunks
  → System prompt con contexto documental, o de conocimiento general si no quedan chunks
  → Groq chat/completions (openai/gpt-oss-20b, reasoning_effort=low, temp=0.15,
     max_tokens=900, últimos 12 mensajes)
  → Guardar respuesta del asistente en messages (supabaseAdmin)
  → Devolver { answer, message, matchesCount, bestSimilarity, usedContext, sources }
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
- Sin streaming de respuestas — el LLM espera la respuesta completa antes de devolver
- Sin límite de rate en `/api/chat` — riesgo de abuso de créditos HF/Groq
- `document_id` en `/api/chat` aceptado pero no enviado desde el frontend
- La llamada a Groq está repetida en cuatro rutas (chat, dashboard, recommendations, org-summary), sin un cliente LLM centralizado
