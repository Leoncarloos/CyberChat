-- match_document_chunks_scoped — búsqueda por similitud (pgvector) del pipeline RAG.
-- Usada por /api/chat y /api/recommendations. Se creó originalmente a mano en el
-- editor SQL de Supabase (nunca tuvo migración versionada) — este archivo documenta
-- su definición real, extraída con pg_get_functiondef() (issue #18).
--
-- Aislamiento por usuario: no hay columna user_id en document_chunks; el scope se
-- resuelve vía JOIN a documents.uploaded_by = filter_user_id.
--
-- Ejecutar en el editor SQL de Supabase (o mantener sincronizado si se vuelve a
-- editar ahí — este archivo debe reflejar siempre la definición real en producción).

CREATE OR REPLACE FUNCTION public.match_document_chunks_scoped(
  query_embedding vector,
  match_count integer,
  filter_user_id uuid,
  filter_document_id uuid
)
RETURNS TABLE(id uuid, document_id uuid, content text, similarity double precision)
LANGUAGE sql
STABLE
AS $function$
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
