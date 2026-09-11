# ADR-0001 — Mantener CyberChat como monolito Next.js (frontend + API)

**Estado:** Aceptada
**Fecha:** 2026-09-11

## Contexto

CyberChat es un monolito Next.js 16 (App Router): el frontend (`/chat`, `/admin`,
`/manage`, `/dashboard`, `/org-dashboard`, etc.) y el backend (`/api/*`, corriendo como
funciones serverless de Vercel) viven en el mismo repositorio y se despliegan juntos.
El equipo son 2 personas (tesistas). El piloto real validado (OE3) corrió con 3 MYPEs y
32 empleados, con 99.8% de disponibilidad y latencia p95 de 2.9s.

La pregunta que motiva este ADR: ¿conviene separar frontend y backend en dos
despliegues/repos independientes, ahora o a corto plazo?

## Opciones consideradas

1. **Mantener el monolito Next.js** — frontend y API routes en el mismo repo y deploy
   de Vercel.
2. **Separar en frontend (Vercel) + backend dedicado** (Node/Express o similar) para la
   lógica de negocio y el pipeline RAG.
3. **Microservicios por dominio** — servicios independientes para auth, RAG, evaluaciones,
   etc.

## Decisión

**Se mantiene el monolito Next.js (opción 1).** No hay ningún indicador actual (carga,
latencia, costo, tamaño de equipo) que justifique separar. Auth, base de datos y storage
ya están desacoplados en Supabase — la separación que realmente importa (cómputo vs.
datos) ya existe; lo que está junto es solo el cómputo de frontend y de API, que en
Next.js siempre fue así por diseño.

Se decide, en cambio, introducir los patrones Repository/Service/Adapter (ver plan de
gestión, sección 3) para que la lógica de negocio no quede acoplada a estar corriendo
dentro de una función de Next.js — esto es lo que realmente prepara el código para
separarse *después* sin que sea un rewrite.

## Consecuencias

**Positivas:**
- Un solo pipeline de deploy — mínima fricción operativa para un equipo de 2 personas.
- Las funciones serverless de Vercel escalan automáticamente por request.
- No hay coordinación de CORS/auth entre dos despliegues.

**Riesgos a vigilar** (no son problema hoy, son las señales de cuándo reconsiderar):
- Rate limits de Groq si el volumen de MYPEs crece 10x.
- Timeout de funciones serverless de Vercel si el pipeline RAG agrega pasos (hoy corre
  en ~3s, con margen).
- Necesidad de procesos de larga duración (ej. reprocesar embeddings de todos los
  documentos) — esto no debe correr dentro de una función serverless de request.

**Triggers concretos para revisar esta decisión** (cualquiera de estos, no "en algún
momento"):
1. Se necesita un job en background que no responde a una request HTTP.
2. Un endpoint específico excede el timeout de función serverless de forma consistente.
3. El equipo crece a un punto donde frontend y backend los mantienen personas distintas
   con ritmos de release distintos.
4. Se necesita un runtime distinto para una pieza específica (ej. Python para un modelo
   propio).
5. El costo por invocación en Vercel supera lo que costaría un servidor dedicado para
   esa carga específica.

Ver `docs/plan-gestion-proyecto.md`, sección 4, para el análisis completo.
