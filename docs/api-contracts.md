# Contratos de API

Todos los endpoints viven bajo `/api/`. Runtime: Node.js. Auth: Supabase session cookie
vía `supabaseServer().auth.getUser()` en cada handler — nunca se confía en el body para
identidad. Los errores devuelven `{ "error": "mensaje" }`; los que validan con Zod
(marcados abajo) agregan además `{ "fieldErrors": { "<campo>": "mensaje" } }` en 400.

> Actualizado 2026-09-11. `docs/user-stories.md` tiene el detalle de negocio de cada HU;
> este documento es el contrato técnico exacto de cada ruta contra el código real.

---

## Autenticación y registro

Login **no tiene API route propia** — `app/(auth)/login/LoginClient.tsx` llama
directo a `supabase.auth.signInWithPassword()` desde el cliente. Valida formato con
`loginSchema` (`lib/validators/auth.ts`) antes de llamar a Supabase, y siempre muestra
"Correo o contraseña incorrectos" como mensaje de error (nunca el mensaje crudo de
Supabase) para evitar user enumeration.

### POST `/api/auth/register-admin`
Crea la cuenta administradora de una empresa. Sin sesión requerida (es el registro).

**Validado con Zod** (`registerAdminSchema`): `ruc` (11 dígitos, prefijo 10/15/17/20),
`businessName`, `tradeName` (opcional), `ownerName` (solo letras), `email`, `phone`
(celular peruano, 9 dígitos empieza con 9), `password` (8+ caracteres, mayúscula,
minúscula, número, especial), `confirmPassword` (debe coincidir con `password`).

#### Response 200
```json
{ "ok": true }
```

#### Errores
| Status | Causa |
|--------|-------|
| 400 | Falla de validación Zod (`fieldErrors` por campo) |
| 409 | Ya existe un admin con ese RUC |
| 500 | Error Supabase al listar usuarios o crear la cuenta |

---

### POST `/api/auth/register-employee`
Crea una solicitud de acceso de empleado (`approval_status: "pending"`), vinculada al
admin de su mismo RUC. Sin sesión requerida.

**Validado con Zod** (`registerEmployeeSchema`): `ruc`, `firstName`, `lastName`, `email`,
`password`, `confirmPassword` — mismas reglas que el registro de admin.

#### Response 200
```json
{ "ok": true }
```

#### Errores
| Status | Causa |
|--------|-------|
| 400 | Falla de validación Zod |
| 404 | No existe un admin registrado con ese RUC |
| 500 | Error Supabase |

---

## Chat y RAG

### POST `/api/chat`
Inferencia RAG + LLM (Groq `qwen/qwen3.8-27b`). Requiere sesión activa (cualquier rol).

#### Request
```json
{
  "messages": [
    { "role": "user", "content": "¿Qué es el phishing?" },
    { "role": "assistant", "content": "..." }
  ],
  "document_id": "uuid-opcional"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `messages` | `ChatMsg[]` | ✓ | Historial completo, máx 18 turnos usados como contexto. Mínimo 1 mensaje. |
| `document_id` | string | — | Filtra RAG a un documento específico. Si se omite, busca en todos los del admin de la misma empresa. |

#### Response 200
```json
{
  "answer": "string",
  "matchesCount": 3,
  "bestSimilarity": 0.72,
  "usedContext": true,
  "sources": [
    { "rank": 1, "similarity": 0.72, "preview": "primeros 220 chars del chunk..." }
  ]
}
```

#### Errores
| Status | Causa |
|--------|-------|
| 400 | `messages` vacío o ausente, o último mensaje de usuario vacío |
| 401 | Sin sesión o sesión inválida |
| 500 | Falta `GROQ_API_KEY`, error HF embedding, error Supabase RPC, error Groq |

---

### POST `/api/documents/upload-and-process`
Sube un documento y ejecuta el pipeline RAG completo (extracción → chunking →
embedding). Body: `multipart/form-data`. Requiere sesión (cualquier rol autenticado
puede subir — no hay chequeo de rol `admin` en este handler).

#### Request
```
Content-Type: multipart/form-data
file: File (.pdf | .docx | .txt)
```

#### Response 200
```json
{
  "ok": true,
  "document_id": "uuid",
  "storage_path": "uuid/archivo.pdf",
  "chunks": 42,
  "embedded": true
}
```

#### Errores
| Status | Causa |
|--------|-------|
| 400 | Sin archivo, formato no soportado (`.${ext}` distinto de pdf/docx/txt), documento sin texto legible (ej. escaneado como imagen) |
| 401 | Sin sesión |
| 500 | Error Storage, error extracción de texto, error embedding, error inserción en `document_chunks` |

---

### POST `/api/documents/reprocess`
Re-genera los embeddings de todos los chunks ya existentes de los documentos del admin
autenticado (útil tras cambiar el modelo de embeddings). Requiere rol `admin`.

#### Response 200
```json
{ "ok": true, "reprocessed": 3, "totalChunks": 87 }
```

#### Errores
| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 403 | Sin rol `admin` |
| 500 | Error Supabase al leer/insertar `document_chunks`, incluye el nombre del documento que falló |

---

## Conversaciones y mensajes

### GET `/api/conversations/list`
Lista las conversaciones del usuario autenticado, más recientes primero.

#### Response 200
```json
{ "conversations": [{ "id": "uuid", "title": "Nuevo chat", "created_at": "...", "user_id": "uuid" }] }
```

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 500 | Error Supabase |

---

### POST `/api/conversations/new`
Crea una conversación vacía (`title: "Nuevo chat"`) para el usuario autenticado.

#### Response 200
```json
{ "conversation": { "id": "uuid", "title": "Nuevo chat", "created_at": "...", "user_id": "uuid" } }
```

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 500 | Error Supabase |

---

### POST `/api/conversations/rename`
Renombra una conversación propia.

#### Request
```json
{ "conversation_id": "uuid", "title": "Nuevo nombre" }
```

| Status | Causa |
|--------|-------|
| 400 | `conversation_id` o `title` ausentes |
| 401 | Sin sesión |
| 500 | Error Supabase (incluye el caso de conversación ajena — el `UPDATE` filtra por `user_id` y no falla, solo no afecta filas) |

---

### POST `/api/messages/add`
Agrega un mensaje a una conversación propia.

#### Request
```json
{ "conversation_id": "uuid", "role": "user", "content": "texto" }
```

#### Response 200
```json
{ "message": { "id": "uuid", "role": "user", "content": "texto", "created_at": "..." } }
```

| Status | Causa |
|--------|-------|
| 400 | Campos requeridos ausentes |
| 401 | Sin sesión |
| 403 | La conversación no pertenece al usuario autenticado |
| 500 | Error Supabase |

---

### POST `/api/messages/list`
Lista los mensajes de una conversación propia, orden cronológico.

#### Request
```json
{ "conversation_id": "uuid" }
```

#### Response 200
```json
{ "messages": [{ "id": "uuid", "role": "user", "content": "texto", "created_at": "..." }] }
```

| Status | Causa |
|--------|-------|
| 400 | `conversation_id` ausente |
| 401 | Sin sesión |
| 403 | La conversación no pertenece al usuario |
| 500 | Error Supabase |

---

## Evaluaciones (diagnóstico, post-test, recurrente)

### GET `/api/diagnostic`
Verifica si el usuario autenticado completó el diagnóstico inicial.

#### Response 200
```json
{ "completed": true }
```
| Status | Causa |
|--------|-------|
| 401 | Sin sesión |

---

### POST `/api/diagnostic`
Guarda el resultado del diagnóstico y desbloquea el acceso a la plataforma.

**Validado con Zod** (`diagnosticBodySchema`, `lib/validators/evaluation.ts`): `score`
y `total` enteros no negativos con `score <= total`; `topicsPerformance` es un record
cuyas claves deben ser exactamente una de los 8 `topic_key` reales de
`diagnosticTopics` (no cualquier string).

#### Request
```json
{
  "score": 12,
  "total": 16,
  "topicsPerformance": {
    "phishing": { "correct": 2, "total": 2 },
    "ia_amenazas": { "correct": 1, "total": 2 }
  }
}
```

#### Response 200
```json
{ "ok": true }
```

**Efectos colaterales:** INSERT en `diagnostic_results` + `auth.admin.updateUserById`
→ `user_metadata.diagnostic_done = true`. El middleware desbloquea rutas protegidas en
la siguiente request.

| Status | Causa |
|--------|-------|
| 400 | Falla de validación Zod (`fieldErrors` por campo) |
| 401 | Sin sesión |
| 500 | Error Supabase al insertar o al actualizar metadata |

---

### GET `/api/posttest` — HU19/HU20
Arma una evaluación de 16 preguntas (2 por cada uno de los 8 temas) extraídas del banco
fijo `posttest_questions`, excluyendo las preguntas que el usuario ya vio
(`seen_questions`). Si algún tema se queda sin preguntas no vistas, completa con las
vistas más antiguas de ese tema (reinicio de ciclo). Requiere `diagnostic_done = true`.

#### Response 200
```json
{
  "questions": [
    {
      "id": "uuid-de-posttest_questions",
      "topicKey": "phishing",
      "question": "texto",
      "options": ["a", "b", "c", "d"],
      "correctIndex": 1,
      "explanation": "texto"
    }
  ],
  "testType": "posttest"
}
```
`testType` es `"posttest"` si es el primer intento del usuario, `"recurrente"` en
adelante (se determina por si ya existe alguna fila en `evaluation_attempts`).

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 403 | Diagnóstico aún no completado |
| 500 | Banco de preguntas incompleto para algún tema (menos de 2 activas), o error Supabase |

---

### POST `/api/quiz`
Guarda el resultado de un intento de evaluación (post-test o recurrente).

**Validado con Zod** (`quizBodySchema`): `score`/`total` como en diagnóstico;
`testType` opcional (`"posttest"` | `"recurrente"`, default `"posttest"`);
`topicsPerformance` opcional con las mismas reglas de topic_key válido;
`questionIds` opcional, arreglo de UUIDs (deben ser IDs reales de `posttest_questions`).

#### Request
```json
{
  "score": 12,
  "total": 16,
  "testType": "recurrente",
  "topicsPerformance": { "phishing": { "correct": 2, "total": 2 } },
  "questionIds": ["uuid1", "uuid2"]
}
```

#### Response 200
```json
{ "ok": true }
```

**Efectos colaterales:** INSERT en `quiz_results` (legacy) + INSERT en
`evaluation_attempts` + UPSERT en `seen_questions` por cada `questionId` recibido.

| Status | Causa |
|--------|-------|
| 400 | Falla de validación Zod |
| 401 | Sin sesión |
| 500 | Error Supabase en cualquiera de los 3 inserts/upserts |

---

### GET `/api/recurring-test/status` — HU20
Indica si al usuario le corresponde rendir la evaluación recurrente (≥5 días desde su
último intento completado). La recurrencia solo arranca después de completar el primer
post-test.

#### Response 200
```json
{
  "due": true,
  "blocking": true,
  "daysSince": 6,
  "lastCompletedAt": "2026-09-01T10:00:00Z",
  "nextDueAt": "2026-09-06T10:00:00Z"
}
```
`blocking` es `true` solo si `due` y el rol es `employee` — para `admin` la evaluación
recurrente es un recordatorio omitible, nunca bloqueante (ver `docs/user-stories.md`
HU20, Escenario 9).

Si el diagnóstico no está completo: `{ "due": false, "reason": "diagnostic_pending" }`.
Si nunca completó un post-test: `{ "due": false, "reason": "posttest_pending" }`.

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 500 | Error Supabase |

---

## Aprendizaje guiado — HU11

### GET `/api/learning-path`
Devuelve el nivel de dominio por tema (según el diagnóstico más reciente) y el estado
de progreso (`pendiente`/`en_progreso`/`completado`) persistido en `learning_progress`.

#### Response 200
```json
{
  "hasData": true,
  "path": [{ "key": "phishing", "label": "...", "icon": "...", "starterPrompt": "...", "level": "bajo", "pct": 40, "isWeak": true, "status": "pendiente" }],
  "shortcuts": [ /* mismo shape, todos los temas, débiles primero */ ]
}
```
`path` = solo temas débiles (nivel ≠ "alto"), ordenados por nivel y luego por %.

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 500 | Error Supabase (nota: si `learning_progress` falla, degrada a "pendiente" en vez de fallar) |

---

### POST `/api/learning-path`
Persiste el progreso de un tema de la ruta de aprendizaje.

#### Request
```json
{ "topicKey": "phishing", "status": "en_progreso" }
```

#### Response 200
```json
{ "ok": true }
```

| Status | Causa |
|--------|-------|
| 400 | `topicKey` no existe en el catálogo, o `status` no es uno de los 3 válidos |
| 401 | Sin sesión |
| 500 | Error Supabase |

---

### GET `/api/recommendations`
Genera (vía Groq + RAG sobre documentos de la empresa del usuario) hasta 4 tarjetas de
recomendación personalizadas, priorizando los temas de menor dominio del diagnóstico.

#### Response 200
```json
{
  "recommendations": [
    {
      "topicKey": "phishing",
      "topicLabel": "Phishing",
      "title": "string corto",
      "summary": "2-3 oraciones",
      "priority": "Alto",
      "suggestedPrompt": "pregunta corta para el chatbot"
    }
  ]
}
```
Si aún no hay diagnóstico: `{ "recommendations": [], "reason": "no_diagnostic" }`.
Si Groq responde JSON no parseable: `{ "recommendations": [], "reason": "parse_error" }`.

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 500 | Error inesperado (nota: fallos de Groq/RAG individuales degradan a `reason`, no a 500) |

---

## Dashboard personal

### GET `/api/dashboard`
Agrega diagnóstico + historial de evaluaciones + uso del chatbot + recomendaciones IA
para el dashboard personal del empleado.

#### Response 200
```json
{
  "diagnostic": { "score": 12, "total": 16, "pct": 75, "topicsPerformance": {}, "completedAt": "..." },
  "postTest": { "score": 14, "total": 16, "pct": 88, "takenAt": "..." },
  "postTestHistory": [{ "score": 14, "total": 16, "pct": 88, "takenAt": "...", "testType": "recurrente" }],
  "currentTopicsPerformance": { "phishing": { "correct": 2, "total": 2 } },
  "nextEvaluation": { "lastCompletedAt": "...", "nextDueAt": "...", "due": false },
  "improvement": 13,
  "riskLevel": "low",
  "chatbotUsage": { "totalQueries": 24, "lastInteraction": "..." },
  "strongTopics": ["Phishing"],
  "weakTopics": ["Contraseñas"],
  "recommendations": ["texto 1", "texto 2", "texto 3"],
  "topicLabels": { "phishing": "Phishing e Ingeniería Social" }
}
```
`currentTopicsPerformance` y las áreas críticas (`strongTopics`/`weakTopics`) se
calculan sobre el intento más reciente de `evaluation_attempts` que tenga
`topics_performance`, con fallback al diagnóstico inicial si aún no hay ninguno.
`recommendations` usa el LLM (`qwen/qwen3.8-27b`) — se genera en cada request, sin cache
(a diferencia de `/api/org-summary`, que sí cachea).

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 500 | Error Supabase |

---

## Administración de empleados

### GET `/api/admin/employees`
Lista los empleados con `user_metadata.ruc` igual al del admin autenticado. Requiere
rol `admin` con RUC configurado en su metadata.

#### Response 200
```json
{
  "employees": [
    { "id": "uuid", "email": "empleado@empresa.com", "full_name": "Juan Pérez", "first_name": "Juan", "last_name": "Pérez", "ruc": "20123456789", "status": "pending", "created_at": "..." }
  ],
  "counts": { "all": 10, "active": 7, "pending": 2, "rejected": 1 },
  "ruc": "20123456789"
}
```

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 400 | Admin sin RUC configurado en su metadata |
| 403 | Usuario sin rol `admin` |
| 500 | Error Supabase |

---

### PATCH `/api/admin/employees`
Aprueba, rechaza o edita el nombre de un empleado de la misma empresa. Requiere rol
`admin`.

**Validado con Zod** (`employeePatchSchema`, `lib/validators/employees.ts`): `userId`
debe ser un UUID válido; `action` restringido al enum `approve | reject | edit`;
`firstName`/`lastName` opcionales (solo letras/espacios si se envían).

#### Request
```json
{ "userId": "uuid", "action": "approve" }
```
o para editar:
```json
{ "userId": "uuid", "action": "edit", "firstName": "Juan", "lastName": "Pérez" }
```

#### Response 200
```json
{ "ok": true }
```

| Status | Causa |
|--------|-------|
| 400 | Falla de validación Zod (`fieldErrors`), o admin sin RUC configurado |
| 401 | Sin sesión |
| 403 | Sin rol `admin`, o el empleado no pertenece al RUC del admin autenticado |
| 404 | `userId` no corresponde a ningún usuario existente |
| 500 | Error Supabase |

---

## Dashboard organizacional — HU17/HU18/HU20

### GET `/api/org-dashboard`
Métricas agregadas de la organización del admin autenticado (usa `lib/orgMetrics.ts`).
Requiere rol `admin` con RUC configurado.

#### Response 200 (forma resumida — ver `lib/orgMetrics.ts` para el tipo `OrgMetrics` completo)
```json
{
  "empty": false,
  "ruc": "20123456789",
  "totals": { "employees": 10, "active": 7, "pending": 2, "rejected": 1, "completedDiagnostic": 8, "completionRate": 80 },
  "scores": { "avgDiagnostic": 55, "avgPostTest": 78, "improvement": 23 },
  "overallAwarenessPct": 78,
  "complianceRate": 90,
  "periodComparison": { "period": "month", "currentAvg": 78, "previousAvg": 65, "deltaPP": 13 },
  "topicsAvg": [{ "key": "phishing", "label": "Phishing", "avgPct": 82, "count": 8 }],
  "weakestTopics": [ /* top 3 */ ],
  "riskDistribution": { "low": 5, "medium": 2, "high": 1 },
  "chatbotUsage": { "totalQueries": 340 },
  "priorityEmployees": [ /* hasta 15, ordenados por riesgo */ ],
  "allEmployees": [ /* todos, para export */ ],
  "recurring": {
    "avgLatestPct": 80, "avgDeltaPP": 5,
    "employeesUpToDate": 6, "employeesOverdue": 1, "employeesNotStarted": 1,
    "upToDateRate": 86, "criticalTopics": [ /* top 3 */ ]
  }
}
```

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 403 | Sin rol `admin` |
| 400 | Admin sin RUC configurado |
| 500 | Error Supabase |

---

### GET `/api/org-dashboard/export?type=summary\|employees` — HU18
Exporta CSV (UTF-8 con BOM, delimitado por coma) de las métricas organizacionales o el
detalle por empleado. Requiere rol `admin`.

#### Query params
| Param | Valores | Requerido |
|-------|---------|-----------|
| `type` | `summary` \| `employees` | ✓ |

#### Response 200
`Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment`, header
`X-Filename` con el nombre sugerido (`cyberchat-resumen-organizacional-<ruc>-<fecha>.csv`
o `cyberchat-empleados-<ruc>-<fecha>.csv`).

| Status | Causa |
|--------|-------|
| 400 | `type` ausente o inválido, o admin sin RUC |
| 401 | Sin sesión |
| 403 | Sin rol `admin` |
| 404 | No hay datos para exportar (`metrics.empty`) |
| 500 | Error Supabase |

---

### GET `/api/org-summary?period=week\|month\|quarter\|all` — HU17
Resumen ejecutivo generado por IA sobre datos **agregados y anonimizados** (nunca
nombres/correos/IDs individuales — ver `buildAnonymizedPayload` en el código). Cachea
por `(ruc, period)` con TTL de 1 hora en `org_summaries`; si la cache expiró, genera uno
nuevo automáticamente. Requiere rol `admin`.

#### Response 200 (cache vigente o recién generado)
```json
{ "summary": "texto markdown con ## subtítulos", "generatedAt": "...", "period": "month", "warnings": [], "cached": true }
```

#### Response 200 (datos insuficientes — no bloquea con error HTTP)
```json
{ "insufficient": true, "warnings": ["Se requiere al menos 1 evaluación diagnóstica completada..."], "period": "month" }
```

| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 403 | Sin rol `admin` |
| 400 | Admin sin RUC configurado |
| 500 | Falta `GROQ_API_KEY`, error Groq, o error inesperado (mensaje genérico, no se filtra el error crudo al cliente) |

---

### POST `/api/org-summary`
Regenera el resumen ejecutivo bajo demanda, ignorando la cache. Mismo contrato de
respuesta que el GET.

#### Request
```json
{ "period": "quarter" }
```
`period` opcional, default `"month"`. Si el body no es JSON válido, se usa `"month"` sin
error (fallback silencioso).

---

## Notas generales
- Todos los endpoints (salvo login, que no tiene route propio) validan sesión con
  `supabaseServer().auth.getUser()` antes de leer el body — nunca se confía en
  `user_id`/rol enviados desde el cliente para operaciones sensibles.
- Los endpoints marcados "**Validado con Zod**" rechazan payloads inválidos con `400` y
  `fieldErrors` por campo, verificado con `curl` directo (bypaseando el navegador) —
  ver PRs #13 y #15. El resto de endpoints con body (`conversations/*`, `messages/*`,
  `learning-path` POST) todavía solo hacen chequeos manuales de presencia (`if (!x)`),
  no validación de forma/tipo — candidato a una próxima iteración del mismo patrón.
- No hay paginación implementada en ningún endpoint — `listUsers` trae hasta 1000
  usuarios por página y no pagina más allá de eso; a la escala actual (3 MYPEs, 32
  empleados) no es un problema.
