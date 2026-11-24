# Inconsistencias — Plan de Continuidad OE4 vs. plataforma real

Revisión de `Plan_de_Continuidad_OE4.docx` contra el código en este repositorio.

## 1. Backend descrito como "Node.js/Nest.js"

**Ubicaciones en el doc:** secciones 1.4.1, 1.6.5, 1.9.1.2, 1.10.3.3.

**Realidad:** no existe Nest.js en el proyecto. `package.json` solo declara Next.js 16. Frontend y backend viven en el mismo framework vía API routes (`app/api/**/route.ts`).

**Corrección sugerida:** reemplazar "Node.js/Nest.js" por "Next.js (API routes)".

## 2. Pipeline RAG descrito como orquestado con LangChain

**Ubicaciones en el doc:** secciones 1.4.1, 1.7.2.1, 1.9.1.2.

**Realidad:** no hay dependencia `langchain` en `package.json`. El pipeline es directo: [lib/embedHF.ts](lib/embedHF.ts) genera el embedding → RPC Supabase `match_document_chunks_scoped` → fetch directo a Groq en [app/api/chat/route.ts](app/api/chat/route.ts). Sin capa de orquestación intermedia.

**Corrección sugerida:** reemplazar "framework de orquestación RAG (LangChain)" por "pipeline RAG propio (embeddings HF → RPC Supabase pgvector → Groq)". Si LangChain es una migración planeada a futuro, decirlo explícitamente como propuesta, no como estado actual.

## 3. Autenticación presentada como "JWT" propio

**Ubicación en el doc:** sección 1.10.1.1.

**Realidad:** la autenticación la gestiona Supabase Auth (que usa JWT internamente), no una implementación propia con `jsonwebtoken` u otra librería — no hay ninguna en el proyecto.

**Corrección sugerida:** "autenticación gestionada por Supabase Auth (JWT), con control de acceso basado en roles (admin/employee) validado en cada `page.tsx` vía `supabase.auth.getUser()`".

## 4. Trazabilidad de fuentes (P7) — confirmado como brecha real, no solo percibida

**Ubicación en el doc:** secciones 1.7.1, 1.8.2.1 (ya lo identifican correctamente como cambio mayor pendiente).

**Verificación en código:** [app/api/chat/route.ts:174](app/api/chat/route.ts:174) devuelve `sources` como preview de texto del chunk (`content.slice(0, 220)`), sin cita a artículo, sección o control normativo específico. Confirma que el hallazgo del Experto 1 (falta de trazabilidad ISO 27001/CIS) es un gap real de implementación, no solo una percepción del panel. No requiere corrección — el plan ya lo diagnostica bien; se deja como nota de refuerzo.

## 5. No mencionado en el plan: HU19/HU20 (evaluación evolutiva)

**Realidad no reflejada en el doc:** banco fijo de 200 preguntas (`posttest_questions`) y evaluación recurrente cada 5 días con áreas críticas medibles (`evaluation_attempts`, `seen_questions`), ya en producción.

**Sugerencia:** mencionar brevemente en 1.12.5 (Mantenimiento) o como quinto objetivo específico — es evidencia adicional a favor de la sostenibilidad del proceso de concientización en el tiempo (núcleo del OE4).

## No verificable desde el repositorio

Cifras del piloto de validación (176.3% de mejora, RAGAS 0.855, d de Cohen 10.19, V de Aiken por ítem, disponibilidad 99.8%, incidente de 8 min) provienen de un instrumento de evaluación externo al código — no se pueden confirmar ni refutar desde este repositorio.
