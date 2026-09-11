# ADR-0004 — pgvector vs. base de datos vectorial dedicada

**Estado:** Aceptada
**Fecha:** 2026-09-11

## Contexto

El pipeline RAG de CyberChat necesita búsqueda por similitud sobre embeddings de 384
dimensiones (HuggingFace `all-MiniLM-L6-v2`) generados a partir de los documentos que
cada administrador sube para su empresa, con aislamiento estricto: un empleado solo
debe recuperar contexto de los documentos de su propia organización.

## Opciones consideradas

1. **pgvector** — extensión de Postgres que agrega un tipo de columna `vector` y
   operadores de distancia (`<=>` para coseno), usable directo dentro de Supabase.
2. **Base de datos vectorial dedicada** (Pinecone, Weaviate, Qdrant) — servicio
   administrado separado, especializado en búsqueda vectorial a gran escala.

## Decisión

**Se elige pgvector dentro de la misma base Postgres de Supabase (opción 1).** Esto
permite que la función `match_document_chunks_scoped` combine, en una sola consulta
SQL, el `ORDER BY embedding <=> query_embedding` (similitud) con un `JOIN` a
`documents.uploaded_by` (aislamiento por organización) — sin sincronizar datos entre
dos sistemas distintos ni gestionar una cuenta y una capa de red adicional.

## Consecuencias

**Positivas:**
- No hay un servicio adicional que pagar, desplegar ni mantener.
- Consistencia transaccional entre `document_chunks`, `documents` y el resto de datos
  relacionales — el aislamiento por organización se resuelve con un `JOIN` normal, no
  con lógica de sincronización entre dos bases de datos.
- Una sola función RPC (`match_document_chunks_scoped`) concentra similitud + filtro de
  seguridad; más simple de auditar que combinar resultados de dos sistemas distintos.

**Riesgos / deuda generada:**
- `document_chunks` hoy solo tiene un índice primario (btree sobre `id`) — no existe
  ningún índice `HNSW`/`IVFFlat` sobre la columna `embedding`, confirmado con
  `pg_indexes`. La búsqueda por similitud coseno hace un scan secuencial completo de la
  tabla en cada consulta.
- Esto es aceptable al volumen actual del piloto (3 MYPEs, base documental pequeña),
  pero es el primer cuello de botella esperable si la base documental crece — tracked
  como issue #17 ("Crear índice HNSW sobre `document_chunks.embedding` antes de
  escalar"). Un índice `HNSW` es la mitigación estándar de pgvector para este escenario,
  y no requiere migrar a una base vectorial dedicada.
