-- Migración: rol, RUC, estado de aprobación y diagnóstico pasan de user_metadata a app_metadata.
--
-- Por qué: user_metadata (raw_user_meta_data) lo puede modificar el propio usuario con
-- supabase.auth.updateUser({ data }) usando la clave anon, así que un empleado podía
-- auto-aprobarse o ponerse role = 'admin'. app_metadata solo lo escribe la service_role.
--
-- Se ejecuta en dos partes para no dejar la app sin roles durante el despliegue:
--   PARTE A — justo ANTES de desplegar el código nuevo. Copia las claves a app_metadata
--             y deja user_metadata intacto: el código anterior sigue funcionando.
--   PARTE B — DESPUÉS de desplegar. Quita las claves de user_metadata.
-- Entre A y el despliegue no aprobar ni rechazar empleados: el código anterior solo
-- escribe user_metadata y ese cambio no llegaría a app_metadata.

-- ── Revisión previa (solo lectura) ─────────────────────────────────────────────
-- Cada RUC debe tener un único dueño. Si aparece un RUC con 2 o más, revisar esas
-- cuentas antes de migrar: pudo ser un empleado que se asignó role = 'admin'.
select raw_user_meta_data->>'ruc' as ruc, count(*) as duenos, array_agg(email) as correos
from auth.users
where raw_user_meta_data->>'role' = 'admin'
group by 1
having count(*) > 1;

-- ── PARTE A: copiar a app_metadata ────────────────────────────────────────────
begin;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'role', raw_user_meta_data->'role',
      'ruc', raw_user_meta_data->'ruc',
      'approval_status', raw_user_meta_data->'approval_status',
      'diagnostic_done', raw_user_meta_data->'diagnostic_done'
    ))
where raw_user_meta_data ?| array['role', 'ruc', 'approval_status', 'diagnostic_done'];

commit;

-- Verificación de A: no debe devolver filas.
select email
from auth.users
where raw_user_meta_data ? 'role'
  and raw_app_meta_data->>'role' is distinct from raw_user_meta_data->>'role';

-- ── PARTE B: limpiar user_metadata (después del despliegue) ─────────────────
begin;

-- Un diagnóstico rendido entre A y el despliegue quedó solo en user_metadata.
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"diagnostic_done": true}'::jsonb
where raw_user_meta_data->>'diagnostic_done' = 'true'
  and coalesce(raw_app_meta_data->>'diagnostic_done', 'false') <> 'true';

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'role' - 'ruc' - 'approval_status' - 'diagnostic_done'
where raw_user_meta_data ?| array['role', 'ruc', 'approval_status', 'diagnostic_done'];

commit;

-- Verificación de B: no debe devolver filas.
select email
from auth.users
where raw_user_meta_data ?| array['role', 'ruc', 'approval_status', 'diagnostic_done'];
