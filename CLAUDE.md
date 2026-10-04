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
| `/register` | Elección de registro: `/register/admin` (dueño + empresa) o `/register/employee` (solicitud de empleado) |
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
| `/api/chat` | POST — inferencia RAG + Groq; recibe `conversation_id` y guarda la respuesta del asistente en `messages` (service_role) |
| `/api/admin/employees` | GET/PATCH — CRUD empleados |
| `/api/documents/upload-and-process` | POST — pipeline ingesta documentos |
| `/api/learning-path` | GET — ruta de aprendizaje (nivel por tema + atajos) · POST — persiste progreso por tema (HU11) |
| `/org-dashboard` | Dashboard organizacional + resumen IA (solo admin) |
| `/api/org-dashboard` | GET — métricas org agregadas (usa `lib/orgMetrics.ts`) |
| `/api/org-summary` | GET — resumen ejecutivo IA (cache TTL 1h, auto-genera) · POST — regenera bajo demanda (HU17) |

## Roles
- `employee` — `/chat` y `/dashboard`; requiere aprobación del dueño (`approval_status: active`)
- `admin` (dueño de empresa) — además `/manage`, `/admin` y `/org-dashboard`

Autorización en tres capas, todas con el estado vigente (no el del JWT):
1. **API routes:** `requireActiveUser()` / `requireAdmin()` de `lib/authz.ts` (401 sin sesión,
   403 si la cuenta no está activa o el rol no corresponde). Es la protección real.
2. **RLS:** las tablas con acceso directo desde el navegador exigen dato propio y
   `private.is_active_user()`. El navegador solo inserta mensajes con `role = 'user'`.
3. **Middleware:** refresca la sesión, cierra la de empleados no activos (`/login?blocked=…`)
   y redirige a `/diagnostic` si falta el diagnóstico. Las páginas además redirigen por rol
   en el cliente (solo navegación).

Los dueños se registran sin verificación de correo (decisión del equipo).

## Variables de entorno (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
HF_TOKEN          # HuggingFace — embeddings paraphrase-multilingual-MiniLM-L12-v2
GROQ_API_KEY      # Groq — openai/gpt-oss-20b
```

## Pipeline RAG
1. Texto usuario → embedding 384-dim (HF `paraphrase-multilingual-MiniLM-L12-v2`)
2. Supabase RPC `match_document_chunks_scoped` → top-5 chunks (umbral 0.38),
   acotado a la empresa: se pasa el id del dueño (`lib/orgAdmin.ts`), no el del
   usuario, y se invoca con `supabaseAdmin` porque el RPC es SECURITY INVOKER
3. Contexto + historial (últimos 12 mensajes) → Groq `openai/gpt-oss-20b`
4. Respuesta + metadata de fuentes devuelta al cliente

## Supabase
- Identidad de usuario: no hay tabla `employees`/`profiles`. Rol, RUC, estado de aprobación y
  `diagnostic_done` viven en `auth.users.app_metadata` (solo la service_role los escribe; leer con
  `readAccessClaims` de `lib/accessClaims.ts`). Nombre, teléfono y razón social quedan en
  `user_metadata`, que el propio usuario puede editar: nunca decidir permisos con él.
- Autorización en API routes: `requireActiveUser()` / `requireAdmin()` de `lib/authz.ts`
  (sesión + cuenta aprobada + rol). Migración de usuarios: `docs/sql/migrate_app_metadata.sql`.
- `diagnostic_results` — resultados del diagnóstico inicial (score, topics_performance, completed_at)
- `quiz_results` — resultados de evaluaciones en /chat (score, total, taken_at) — legacy, se mantiene con doble escritura
- `posttest_questions` — banco fijo de 200 preguntas para post-test/recurrentes (25 por tema × 8 temas) — HU21. SQL en `docs/sql/posttest_questions.sql` + seed en `docs/sql/posttest_questions_seed.sql`
- `evaluation_attempts` — intentos de evaluación con test_type (posttest/recurrente) y topics_performance por tema — HU22. SQL en `docs/sql/evaluation_attempts.sql`
- `seen_questions` — preguntas del banco ya respondidas por usuario (anti-repetición, ciclo se reinicia por tema al agotarse) — HU22
- `conversations` — historial de conversaciones por usuario
- `messages` — mensajes dentro de cada conversación
- `documents` — documentos subidos por admin
- `document_chunks` — chunks vectorizados (pgvector 384-dim), con índice HNSW sobre `embedding`
- `learning_progress` — progreso de la ruta por tema (user_id, topic_key, status: pendiente/en_progreso/completado) — HU16. SQL en `docs/sql/learning_progress.sql`
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
- API routes: autorizar con `requireActiveUser()` / `requireAdmin()` — nunca confiar en body
- Escrituras de resultados y respuestas del asistente: solo con `supabaseAdmin` en API routes

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
