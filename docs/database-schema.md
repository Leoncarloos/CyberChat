# Esquema de base de datos

## Proveedor
Supabase (PostgreSQL 15 + extensión pgvector)

## Tablas

### `conversations`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | Propietario |
| `title` | text | Nombre de la conversación (default: "Nuevo chat") |
| `created_at` | timestamptz | Fecha de creación |

Índices: `user_id`, `created_at DESC`
RLS: usuario solo ve sus propias conversaciones

---

### `messages`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `conversation_id` | uuid FK → conversations | Conversación padre |
| `role` | text CHECK ('user','assistant') | Rol del mensaje |
| `content` | text | Contenido del mensaje |
| `created_at` | timestamptz | Timestamp |

Índices: `conversation_id`, `created_at ASC`
RLS: usuario solo ve mensajes de sus conversaciones

---

### `documents`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | Admin que subió el documento |
| `filename` | text | Nombre original del archivo |
| `storage_path` | text | Path en Supabase Storage |
| `created_at` | timestamptz | Fecha de subida |

RLS: admin solo ve sus propios documentos

---

### `document_chunks`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `document_id` | uuid FK → documents | Documento origen |
| `user_id` | uuid FK → auth.users | Admin propietario |
| `content` | text | Texto del chunk |
| `embedding` | vector(384) | Embedding HF all-MiniLM-L6-v2 |
| `created_at` | timestamptz | Timestamp |

Índices: HNSW sobre `embedding` para búsqueda ANN
RLS: solo el propietario accede a sus chunks

---

### `profiles` / `employees`
> Tabla que extiende `auth.users` con datos del empleado y su estado dentro de una empresa.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK FK → auth.users | Mismo ID que auth |
| `email` | text | Email del empleado |
| `first_name` | text | Nombres |
| `last_name` | text | Apellidos |
| `full_name` | text GENERATED | `first_name || ' ' || last_name` |
| `ruc` | text | RUC de la empresa a la que pertenece |
| `status` | text CHECK ('active','pending','rejected') | Estado de acceso |
| `created_at` | timestamptz | Fecha de registro |

RLS: admin ve todos los empleados de su RUC; empleado solo se ve a sí mismo

---

## Funciones RPC

### `match_document_chunks_scoped`
Búsqueda semántica de chunks con filtros de usuario y documento.

```sql
match_document_chunks_scoped(
  query_embedding  vector(384),
  match_count      int,
  filter_user_id   uuid,
  filter_document_id uuid  -- NULL = busca en todos los documentos del usuario
)
RETURNS TABLE (
  id          uuid,
  content     text,
  similarity  float
)
```

Usa `1 - (embedding <=> query_embedding)` como similitud coseno.
Filtra por `user_id` siempre; `document_id` solo si no es NULL.

---

### `diagnostic_results`
Almacena el resultado de la evaluación diagnóstica inicial por usuario.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | Usuario evaluado |
| `score` | int | Respuestas correctas |
| `total` | int | Total de preguntas (16) |
| `topics_performance` | jsonb | `{ [topicKey]: { correct: number, total: number } }` |
| `completed_at` | timestamptz | Momento de finalización |

RLS: usuario solo ve su propio resultado; admin puede ver todos los de su empresa.

SQL de creación:
```sql
create table public.diagnostic_results (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade not null,
  score          int not null,
  total          int not null,
  topics_performance jsonb not null default '{}',
  completed_at   timestamptz not null default now()
);

alter table public.diagnostic_results enable row level security;

create policy "Usuario ve su resultado"
  on public.diagnostic_results for select
  using (auth.uid() = user_id);

create policy "Service role inserta"
  on public.diagnostic_results for insert
  with check (true);
```

Completar el diagnóstico marca `user_metadata.diagnostic_done = true` en `auth.users` via `auth.admin.updateUserById()` (service_role). El middleware verifica este flag para bloquear el acceso a rutas protegidas.

---

### `quiz_results`
Almacena resultados del post-test (evaluación del módulo Evaluaciones en /chat).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | Usuario evaluado |
| `score` | int | Respuestas correctas |
| `total` | int | Total de preguntas del quiz |
| `taken_at` | timestamptz | Momento de realización |

SQL de creación:
```sql
create table public.quiz_results (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users(id) on delete cascade not null,
  score    int not null,
  total    int not null,
  taken_at timestamptz not null default now()
);

alter table public.quiz_results enable row level security;

create policy "Usuario ve sus resultados"
  on public.quiz_results for select
  using (auth.uid() = user_id);

create policy "Service role inserta"
  on public.quiz_results for insert
  with check (true);
```

---

## Storage

### Bucket `documents`
- Acceso: privado (solo service_role y admin autenticado)
- Path: `{user_id}/{uuid}{ext}`
- Formatos permitidos: `.pdf`, `.docx`, `.txt`

---

## Notas RLS
- Todas las tablas tienen RLS habilitado
- Las API routes que requieren acceso privilegiado usan `supabaseAdmin` (service_role key) — solo en server, nunca expuesto al cliente
