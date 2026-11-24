-- RAG híbrido v2: búsqueda léxica y reindexación con respaldo.
-- Reconstruido el 2026-11-23 desde el catálogo de la base de producción (se había aplicado
-- desde el editor SQL, sin migración). Requiere documents, document_chunks y pgvector.
-- Lo usan lib/ragRetrieval.ts (búsqueda léxica) y /api/documents/reprocess (reindexación).
-- Se puede ejecutar más de una vez.

-- Búsqueda léxica de texto completo sobre los fragmentos.
create index if not exists document_chunks_fts_simple_idx
  on public.document_chunks using gin (to_tsvector('simple'::regconfig, content));

-- Copia de los fragmentos anteriores de un documento cada vez que se reindexa.
create table if not exists public.rag_index_backups (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null,
  replacement_version text not null,
  previous_chunks jsonb not null,
  created_at timestamptz not null default now()
);

-- Solo la service_role la usa: RLS activo y sin políticas.
alter table public.rag_index_backups enable row level security;
revoke all on public.rag_index_backups from public, anon, authenticated;

-- SECURITY INVOKER: se llama con supabaseAdmin y el filtro de empresa va en filter_user_id
-- (id del dueño de los documentos).
create or replace function public.match_document_chunks_lexical_scoped(
  search_terms text,
  filter_user_id uuid,
  filter_document_id uuid,
  match_count integer
)
returns table(id uuid, document_id uuid, content text, lexical_score real)
language sql
stable
set search_path to 'public'
as $function$
  select c.id, c.document_id, c.content,
    ts_rank_cd(to_tsvector('simple', c.content), to_tsquery('simple', search_terms))
  from public.document_chunks c join public.documents d on d.id = c.document_id
  where d.uploaded_by = filter_user_id
    and (filter_document_id is null or d.id = filter_document_id)
    and to_tsvector('simple', c.content) @@ to_tsquery('simple', search_terms)
  order by 4 desc, c.id
  limit least(greatest(match_count, 1), 50);
$function$;

-- Reemplaza los fragmentos de un documento en una sola transacción y guarda los anteriores
-- en rag_index_backups. Si algo falla, el documento conserva sus fragmentos.
create or replace function public.replace_document_chunks_v2(
  target_document_id uuid,
  owner_id uuid,
  index_version text,
  new_chunks jsonb
)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare inserted_count integer;
begin
  perform 1 from public.documents d where d.id = target_document_id
    and d.uploaded_by = owner_id for update;
  if not found then raise exception 'Document does not belong to owner'; end if;
  if jsonb_typeof(new_chunks) is distinct from 'array' then raise exception 'Invalid index'; end if;
  if jsonb_array_length(new_chunks) = 0 then raise exception 'Empty index'; end if;
  if exists (select 1 from jsonb_array_elements(new_chunks) c
    where length(trim(c->>'content')) = 0 or c->>'content' is null
      or jsonb_typeof(c->'embedding') is distinct from 'array') then
    raise exception 'Invalid chunk';
  end if;
  if exists (select 1 from jsonb_array_elements(new_chunks) c
    where jsonb_array_length(c->'embedding') <> 384) then raise exception 'Invalid dimensions'; end if;
  insert into public.rag_index_backups(document_id, owner_id, replacement_version, previous_chunks)
    select target_document_id, owner_id, index_version, coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
    from public.document_chunks c where c.document_id = target_document_id;
  delete from public.document_chunks where document_id = target_document_id;
  insert into public.document_chunks(document_id, chunk_index, content, embedding)
    select target_document_id, (c->>'chunk_index')::integer, c->>'content',
      (c->'embedding')::text::vector(384)
    from jsonb_array_elements(new_chunks) c;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

-- Solo la service_role (API routes) puede ejecutarlas.
revoke all on function public.match_document_chunks_lexical_scoped(text, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.replace_document_chunks_v2(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.match_document_chunks_lexical_scoped(text, uuid, uuid, integer) to service_role;
grant execute on function public.replace_document_chunks_v2(uuid, uuid, text, jsonb) to service_role;
