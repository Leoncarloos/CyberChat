# ADR-0002 — Supabase como backend-as-a-service

**Estado:** Aceptada
**Fecha:** 2026-09-11

## Contexto

CyberChat necesita, para un equipo de 2 personas y un cronograma de tesis universitaria:
autenticación de usuarios con roles (`employee`/`admin`), una base de datos relacional
para conversaciones/evaluaciones/métricas, almacenamiento de archivos (documentos que
suben los administradores) y búsqueda vectorial para el pipeline RAG (embeddings de
384 dimensiones sobre esos documentos). Todo esto con aislamiento estricto entre
organizaciones (multi-tenant por `ruc`/`user_id`).

## Opciones consideradas

1. **Firebase** — Auth + Firestore (NoSQL) + Storage. No tiene soporte nativo de
   búsqueda vectorial ni de SQL relacional; hubiera requerido una base de datos
   vectorial separada (ej. Pinecone) para el RAG.
2. **Postgres autoalojado + Auth propio** — control total, pero implica construir y
   mantener autenticación, sesiones, migraciones y una capa de storage desde cero, sin
   presupuesto de infraestructura para un equipo de 2 personas.
3. **Supabase** — Postgres administrado con extensión `pgvector`, Auth nativo (JWT +
   cookies SSR), Storage de archivos y Row Level Security, todo en una sola plataforma.

## Decisión

**Se elige Supabase (opción 3).** Permite tener auth + base de datos relacional +
búsqueda vectorial + storage de archivos en una sola plataforma, con RLS de Postgres
gestionando el aislamiento multiempresa sin necesidad de código de autorización
adicional en cada endpoint.

## Consecuencias

**Positivas:**
- Una sola plataforma para auth, datos, vectores y archivos reduce la superficie de
  integración a mantener por un equipo pequeño.
- RLS aplica el aislamiento por organización a nivel de base de datos, no solo en
  código de aplicación.
- `pgvector` permite hacer JOIN entre búsqueda por similitud y filtros relacionales
  (ej. `match_document_chunks_scoped` cruza `document_chunks` con `documents.uploaded_by`)
  en una sola función RPC.

**Riesgos / deuda generada (bajo seguimiento activo):**
- Cierto acoplamiento a mecanismos propios de Supabase (`auth.users.user_metadata` como
  fuente de identidad, funciones RPC en Postgres) que no portarían directo a otro
  proveedor.
- Algunas piezas del esquema se crearon directo en el editor SQL de Supabase sin
  migración versionada en el repo — corregido para `match_document_chunks_scoped` en
  `docs/sql/match_document_chunks_scoped.sql` (issue #18); persiste como pendiente la
  decisión sobre la tabla huérfana `profiles`, que existe en la base pero ningún código
  del repo consulta (issue #16).
