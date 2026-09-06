# CLAUDE.md — CyberChat

## Proyecto
Aplicación web de concientización en ciberseguridad para MYPES peruanas.
Stack: Next.js 16 · React 19 · TypeScript · Supabase · Groq · Tailwind 4.

## Comandos clave
```bash
npm run dev      # desarrollo local
npm run build    # build producción
npm run lint     # ESLint
```

## Estructura de rutas
| Ruta | Descripción |
|------|-------------|
| `/` | Landing / redirect |
| `/login` | Autenticación |
| `/register` | Registro de empleado |
| `/chat` | Chatbot RAG (todos los usuarios) |
| `/admin` | Upload de documentos RAG (solo admin) |
| `/manage` | Gestión de empleados (solo admin) |
| `/diagnostic` | Evaluación diagnóstica obligatoria (primer acceso) |
| `/api/diagnostic` | GET check status · POST guardar resultados |
| `/dashboard` | Dashboard personal de concientización (empleado) |
| `/api/dashboard` | GET — agrega diagnostic + quiz + chatbot usage + recomendaciones IA |
| `/api/quiz` | POST — guarda resultado de evaluación (post-test/recurrente) en `quiz_results` + `evaluation_attempts` + marca preguntas vistas (HU19/HU20) |
| `/api/posttest` | GET — arma evaluación de 16 preguntas (2×8 temas) desde banco fijo `posttest_questions`, excluyendo preguntas ya vistas (HU19/HU20) |
| `/api/recurring-test/status` | GET — indica si corresponde evaluación recurrente (≥5 días desde la última; bloqueante para employee, omitible para admin) (HU20) |
| `/api/chat` | POST — inferencia RAG + Groq |
| `/api/admin/employees` | GET/PATCH — CRUD empleados |
| `/api/documents/upload-and-process` | POST — pipeline ingesta documentos |
| `/api/learning-path` | GET — ruta de aprendizaje (nivel por tema + atajos) · POST — persiste progreso por tema (HU11) |
| `/org-dashboard` | Dashboard organizacional + resumen IA (solo admin) |
| `/api/org-dashboard` | GET — métricas org agregadas (usa `lib/orgMetrics.ts`) |
| `/api/org-summary` | GET — resumen ejecutivo IA (cache TTL 1h, auto-genera) · POST — regenera bajo demanda (HU17) |

## Roles
- `employee` — acceso solo a `/chat`
- `admin` — acceso a `/chat`, `/manage`, `/admin`

La protección de rutas es **client-side** en cada `page.tsx` via `supabase.auth.getUser()`.
El middleware (`middleware.ts`) solo refresca cookies de sesión, no bloquea.

## Variables de entorno (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
HF_TOKEN          # HuggingFace — embeddings all-MiniLM-L6-v2
GROQ_API_KEY      # Groq — llama-3.1-8b-instant
```

## Pipeline RAG
1. Texto usuario → embedding 384-dim (HF `all-MiniLM-L6-v2`)
2. Supabase RPC `match_document_chunks_scoped` → top-5 chunks (umbral 0.25)
3. Contexto + historial (max 18 turnos) → Groq `llama-3.1-8b-instant`
4. Respuesta + metadata de fuentes devuelta al cliente

## Supabase
- `diagnostic_results` — resultados del diagnóstico inicial (score, topics_performance, completed_at)
- `quiz_results` — resultados de evaluaciones en /chat (score, total, taken_at) — legacy, se mantiene con doble escritura
- `posttest_questions` — banco fijo de 200 preguntas para post-test/recurrentes (25 por tema × 8 temas) — HU19. SQL en `docs/sql/posttest_questions.sql` + seed en `docs/sql/posttest_questions_seed.sql`
- `evaluation_attempts` — intentos de evaluación con test_type (posttest/recurrente) y topics_performance por tema — HU20. SQL en `docs/sql/evaluation_attempts.sql`
- `seen_questions` — preguntas del banco ya respondidas por usuario (anti-repetición, ciclo se reinicia por tema al agotarse) — HU20
- `conversations` — historial de conversaciones por usuario
- `messages` — mensajes dentro de cada conversación
- `documents` — documentos subidos por admin
- `document_chunks` — chunks vectorizados (pgvector 384-dim)
- `employees` / `profiles` — datos y estado de empleados
- `learning_progress` — progreso de la ruta por tema (user_id, topic_key, status: pendiente/en_progreso/completado) — HU11. SQL en `docs/sql/learning_progress.sql`
- `org_summaries` — cache + log de auditoría de resúmenes IA org (ruc, period, summary_text, warnings, metrics, generated_by, generated_at) — HU17. SQL en `docs/sql/org_summaries.sql`

Clientes:
- `lib/supabaseBrowser.ts` — cliente SSR browser
- `lib/supabaseServer.ts` — cliente SSR server (cookies)
- `lib/supabaseAdmin.ts` — service_role (solo en API routes)

## Convenciones
- Sin comentarios salvo WHY no obvio
- `void` para promises flotantes en event handlers
- Siempre `escapeHtml` antes de `dangerouslySetInnerHTML`
- Embeddings: normalizar siempre a `number[]` 384-dim antes de insertar
- API routes: validar sesión con `supabaseServer()` + `getUser()` — nunca confiar en body

## Documentación en `/docs`
| Archivo | Contenido |
|---------|-----------|
| `vision.md` | Propósito, usuarios, diferenciadores |
| `architecture.md` | Diagrama de sistema y decisiones técnicas |
| `user-stories.md` | Historias de usuario por rol |
| `database-schema.md` | Tablas, columnas, RLS, funciones |
| `api-contracts.md` | Contratos de cada endpoint |
| `coding-standards.md` | Estándares de código del proyecto |
| `roadmap.md` | Features planeadas y estado |
