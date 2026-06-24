# Estándares de código

## TypeScript
- Strict mode activado (`tsconfig.json`)
- Sin `any` implícito — usar tipos explícitos o `unknown` + type guards
- Preferir `type` sobre `interface` para shapes de datos simples
- `as` casting solo cuando se sabe con certeza el tipo — documentar por qué si no es obvio

## React / Next.js
- Componentes de página en `app/` — Server Components por defecto, `"use client"` solo cuando sea necesario
- API routes: `export const runtime = "nodejs"` explícito en routes que usen Node APIs
- `void` delante de promises flotantes en event handlers: `onClick={() => void handleAction()}`
- `useMemo` para instancias de Supabase en client components — evitar re-crear en cada render

## Seguridad
- **Nunca** confiar en `user_id` del request body para operaciones de escritura — siempre obtener de `supabase.auth.getUser()`
- `supabaseAdmin` (service_role) solo en API routes server-side — nunca en client components
- Siempre `escapeHtml()` antes de `dangerouslySetInnerHTML`
- Validar tipo y formato de embeddings antes de insertar en BD (longitud 384)

## Comentarios
- Sin comentarios por defecto
- Agregar solo si el WHY no es deducible del código
- Prohibido: comentarios que describen QUÉ hace el código (el nombre ya lo dice)
- Prohibido: referencias a issues, PRs o tareas dentro del código

## Nombrado
- Variables/funciones: camelCase
- Tipos/interfaces: PascalCase
- Constantes de módulo: camelCase (no SCREAMING_SNAKE salvo env vars)
- Archivos de componentes: PascalCase. Utilidades/libs: camelCase

## Manejo de errores
- API routes: siempre devolver `{ error: string }` con status HTTP apropiado
- Client: `alert()` solo para MVP — migrar a UI de errores inline en iteraciones futuras
- `try/catch` en fetches — no asumir que `res.ok` implica JSON válido

## Supabase
- Usar `supabaseBrowser()` en client components (lib/supabaseBrowser.ts)
- Usar `supabaseServer()` en API routes que leen sesión (lib/supabaseServer.ts)
- Usar `supabaseAdmin()` en API routes que necesitan service_role (lib/supabaseAdmin.ts)
- Nunca mezclar clientes — cada uno tiene scope y permisos distintos

## Embeddings
- Siempre pasar por `normalizeHFEmbedding()` antes de usar
- Validar longitud === 384 antes de cualquier operación vectorial
- Umbral de similaridad mínimo: 0.25 (ajustable, documentar si se cambia)

## Formateo
- ESLint config en `eslint.config.mjs` — pasar lint antes de commit
- Sin reglas de formato de Prettier actualmente — consistencia manual
