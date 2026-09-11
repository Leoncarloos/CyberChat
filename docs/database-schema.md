# Esquema de base de datos

> Verificado contra el proyecto Supabase real (`wyzzrjeeuwjiqzseclob`) el 2026-09-11 —
> `information_schema`, `pg_policies`, `pg_indexes` y la definición real de la función RPC.
> Corrige dos imprecisiones de la versión anterior de este documento (ver sección
> [Discrepancias corregidas](#discrepancias-corregidas-en-esta-revisión)).

## Proveedor
Supabase (PostgreSQL 17 + extensión pgvector)

## Identidad de usuario — no hay tabla `employees`/`profiles` activa

El rol (`admin`/`employee`), el RUC de la empresa, el nombre, el estado de aprobación
(`active`/`pending`/`rejected`) y demás datos del usuario **viven en
`auth.users.user_metadata`**, gestionados vía `supabaseAdmin().auth.admin.*`
(`createUser`, `updateUserById`, `listUsers`). Ninguna ruta de la aplicación consulta
una tabla `employees` ni `profiles` — el filtrado por empresa se hace en memoria,
iterando `listUsers()` y comparando `user_metadata.ruc`.

Existe una tabla `profiles` (`id`, `email`, `role`, `created_at`) en la base de datos,
con RLS y políticas propias, pero **ningún código del repositorio la usa** (`grep` sobre
`app/` y `lib/` no encuentra ningún `.from("profiles")`). Es un remanente de un diseño
anterior — candidato a eliminar o a documentar explícitamente como deprecado.

## Tablas

### `conversations`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | Propietario |
| `title` | text | Nombre de la conversación (default: "Nuevo chat") |
| `created_at` | timestamptz | Fecha de creación |

RLS: políticas `conversations_select_own`, `conversations_insert_own`,
`conversations_update_own` (usuario solo ve/crea/actualiza las suyas).

---

### `messages`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `conversation_id` | uuid FK → conversations | Conversación padre |
| `role` | text CHECK ('user','assistant') | Rol del mensaje |
| `content` | text | Contenido del mensaje |
| `created_at` | timestamptz | Timestamp |

RLS: políticas `messages_select_own`, `messages_insert_own` (vía pertenencia de la
conversación al usuario).

---

### `documents`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `name` | text | Nombre original del archivo |
| `storage_path` | text | Path en Supabase Storage |
| `uploaded_by` | uuid FK → auth.users | Admin que subió el documento |
| `created_at` | timestamptz | Fecha de subida |

RLS: política `documents_select_own`.

---

### `document_chunks`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `document_id` | uuid FK → documents | Documento origen |
| `content` | text | Texto del chunk |
| `chunk_index` | int | Orden del chunk dentro del documento |
| `embedding` | vector(384) | Embedding HF all-MiniLM-L6-v2 |
| `created_at` | timestamptz | Timestamp |

**No tiene columna `user_id`.** El aislamiento por usuario se hace en la función RPC
`match_document_chunks_scoped` vía `JOIN` contra `documents.uploaded_by` (ver abajo).

RLS: política `document_chunks_select_own`.

**Índices:** solo la primary key (`document_chunks_pkey`, btree sobre `id`). **No existe
un índice HNSW/IVFFlat sobre `embedding`** — la búsqueda por similitud coseno hace un
scan secuencial. Es aceptable al volumen actual (piloto de 3 MYPEs), pero es el primer
cuello de botella esperable si la base documental crece; considerar `CREATE INDEX ...
USING hnsw (embedding vector_cosine_ops)` antes de escalar.

---

### `diagnostic_results`
Resultado de la evaluación diagnóstica inicial por usuario (14 preguntas hardcodeadas
en `lib/diagnosticQuestions.ts`, 8 temas × 2 — más info en `docs/user-stories.md`).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | Usuario evaluado |
| `score` | int | Respuestas correctas |
| `total` | int | Total de preguntas (16) |
| `topics_performance` | jsonb | `{ [topicKey]: { correct: number, total: number } }` |
| `completed_at` | timestamptz | Momento de finalización |

RLS: políticas `Usuario ve su resultado` (SELECT), `Service role inserta` (INSERT).

Completar el diagnóstico marca `user_metadata.diagnostic_done = true` en `auth.users`
vía `auth.admin.updateUserById()` (service_role). El middleware verifica este flag para
bloquear el acceso a rutas protegidas.

---

### `quiz_results` — legacy, doble escritura
Histórico de resultados de evaluación (post-test y recurrentes). Se mantiene por
compatibilidad; desde HU19/HU20 cada intento se escribe **también** en
`evaluation_attempts`, que es la fuente de verdad para desempeño por tema.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | Usuario evaluado |
| `score` | int | Respuestas correctas |
| `total` | int | Total de preguntas del intento |
| `taken_at` | timestamptz | Momento de realización |

RLS: políticas `Usuario ve sus resultados` (SELECT), `Service role inserta` (INSERT).

---

### `posttest_questions` — HU19
Banco fijo de 200 preguntas (25 por tema × 8 temas) para post-test y evaluaciones
recurrentes. Reemplazó la generación en vivo con Groq del post-test original.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `topic_key` | text | Uno de los 8 keys de `diagnosticTopics` |
| `question` | text | Enunciado |
| `options` | jsonb | Arreglo de 4 opciones (string[]) |
| `correct_index` | int CHECK 0–3 | Índice de la opción correcta |
| `explanation` | text | Justificación mostrada tras responder |
| `active` | boolean default true | Permite desactivar preguntas sin borrarlas |
| `created_at` | timestamptz | Timestamp |

RLS habilitado, **sin políticas públicas** — solo `supabaseAdmin` (service_role) lee/escribe.
SQL: `docs/sql/posttest_questions.sql` + seed en `docs/sql/posttest_questions_seed.sql`.

---

### `evaluation_attempts` — HU19/HU20
Registro append-only de cada intento de evaluación (post-test o recurrente), con
desempeño por tema — es lo que permite medir "áreas críticas" en el tiempo.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | Usuario evaluado |
| `test_type` | text CHECK ('posttest','recurrente') | Tipo de intento |
| `score` | int | Respuestas correctas |
| `total` | int | Total de preguntas |
| `topics_performance` | jsonb default `{}` | Desempeño por tema de ese intento |
| `taken_at` | timestamptz | Momento de realización |

RLS: política `evaluation_attempts_select_own` (SELECT). Insert solo vía service_role.
SQL: `docs/sql/evaluation_attempts.sql`.

---

### `seen_questions` — HU20
Anti-repetición: preguntas del banco ya respondidas por cada usuario. Cuando un tema
agota su pool de 25 preguntas sin ver, el ciclo se reinicia para ese tema (se vuelven a
mostrar las vistas más antiguas primero — ver `app/api/posttest/route.ts`).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `user_id` | uuid FK → auth.users | — |
| `question_id` | uuid FK → posttest_questions | — |
| `seen_at` | timestamptz | Cuándo se le mostró |

PK compuesta `(user_id, question_id)`. RLS habilitado, sin políticas públicas.
SQL: `docs/sql/evaluation_attempts.sql` (mismo archivo que `evaluation_attempts`).

---

### `learning_progress` — HU11
Progreso del usuario en la ruta de aprendizaje guiada del chatbot, persistido entre
sesiones.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | — |
| `topic_key` | text | Tema de `learningTopics` (`lib/learningPath.ts`) |
| `status` | text CHECK ('pendiente','en_progreso','completado') default 'pendiente' | — |
| `updated_at` | timestamptz | — |

`UNIQUE(user_id, topic_key)`. RLS: `learning_progress_select_own`,
`learning_progress_insert_own`, `learning_progress_update_own`.

`app/api/learning-path/route.ts` degrada con elegancia (todo "pendiente") si esta tabla
falla o no existe en un entorno — no rompe el chat.
SQL: `docs/sql/learning_progress.sql`.

---

### `org_summaries` — HU17
Cache (TTL 1h, gestionado en backend) + log de auditoría de los resúmenes ejecutivos IA
del dashboard organizacional. Cada fila es una generación — sirve de historial, no se
actualiza in place.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `ruc` | text | Empresa del resumen |
| `period` | text CHECK ('week','month','quarter','all') default 'month' | Ventana agregada |
| `summary_text` | text | Texto generado por IA |
| `warnings` | jsonb default `[]` | Advertencias de datos parciales/insuficientes |
| `metrics` | jsonb | Snapshot anonimizado usado como input del prompt |
| `generated_by` | uuid FK → auth.users (on delete set null) | Admin que disparó la generación |
| `generated_at` | timestamptz | — |

RLS habilitado, sin políticas públicas — acceso solo vía service_role desde el backend
(autorización por rol `admin` en la API route).
SQL: `docs/sql/org_summaries.sql`.

---

### `profiles` — sin uso, no eliminar sin confirmar
| Columna | Tipo |
|---------|------|
| `id` | uuid PK |
| `email` | text |
| `role` | text |
| `created_at` | timestamptz |

RLS: `profiles_select_own`, `profiles_update_own`. Sin ninguna referencia en el código
actual — ver nota al inicio del documento. No se documenta su SQL de creación porque no
hay migración rastreada en `docs/sql/` para ella (fue creada directo en el editor de
Supabase antes de existir ese flujo).

---

## Funciones RPC

### `match_document_chunks_scoped`
Búsqueda semántica de chunks, aislada por empresa vía `JOIN` a `documents.uploaded_by`
(no hay `user_id` directo en `document_chunks`).

```sql
CREATE OR REPLACE FUNCTION public.match_document_chunks_scoped(
  query_embedding     vector,
  match_count         integer,
  filter_user_id      uuid,
  filter_document_id  uuid
)
RETURNS TABLE(id uuid, document_id uuid, content text, similarity double precision)
LANGUAGE sql STABLE
AS $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where d.uploaded_by = filter_user_id
    and (filter_document_id is null or dc.document_id = filter_document_id)
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
```

`filter_document_id = NULL` busca en todos los documentos del usuario. No hay una
migración rastreada en `docs/sql/` para esta función — se creó directo en el editor SQL
de Supabase (mismo caso que `profiles`).

---

## Storage

### Bucket `documents`
- Acceso: privado (solo service_role y admin autenticado)
- Path: `{user_id}/{uuid}.{ext}`
- Formatos permitidos: `.pdf`, `.docx`, `.txt`

---

## Notas RLS
- Las 12 tablas de `public` tienen `relrowsecurity = true`.
- Los endpoints con lógica sensible (registro, aprobación de empleados, escritura de
  evaluaciones, dashboards) usan `supabaseAdmin` (service_role key, bypassa RLS) — solo
  en server, nunca expuesto al cliente. Las tablas nuevas (`posttest_questions`,
  `evaluation_attempts`, `seen_questions`, `org_summaries`) se diseñaron a propósito
  **sin políticas públicas**, forzando todo acceso a pasar por una API route que valida
  rol/pertenencia antes de tocar la tabla.

## Discrepancias corregidas en esta revisión
La versión anterior de este documento (previa a 2026-09-11) tenía dos imprecisiones
reales, encontradas al verificar contra la base de datos en vivo:
1. Documentaba una tabla `profiles`/`employees` con columnas `first_name`, `last_name`,
   `ruc`, `status` como si fuera la fuente de verdad de empleados — **nunca fue así**;
   siempre fue `auth.users.user_metadata`. La tabla `profiles` real que existe en la
   base de datos tiene un esquema distinto y no la usa ningún código.
2. Afirmaba un índice HNSW sobre `document_chunks.embedding` que nunca se creó.
