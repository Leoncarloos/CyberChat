-- Esquema mínimo para la rama de desarrollo del arnés de evaluación (rag-eval).
-- Las migraciones versionadas de producción no incluyen estas tablas (se crearon a mano en
-- el editor SQL), así que una rama nueva no las trae. Esto replica su definición real,
-- extraída de producción el 2026-10-04. NUNCA se aplica en producción.

create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  content text not null,
  chunk_index integer not null,
  created_at timestamptz not null default now(),
  embedding extensions.vector(384)
);

create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

create or replace function public.match_document_chunks_scoped(
  query_embedding extensions.vector,
  match_count integer,
  filter_user_id uuid,
  filter_document_id uuid
)
returns table(id uuid, document_id uuid, content text, similarity double precision)
language sql
stable
set search_path = public, extensions
as $function$
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
$function$;
