-- Consentimiento y derechos ARCO (Ley N.° 29733 y su Reglamento, D.S. N.° 016-2024-JUS).
--
-- consent_records: prueba del consentimiento (la carga de la prueba es del responsable,
--   art. 9 del Reglamento). Una fila por finalidad y versión de la política; la revocación
--   se registra con revoked_at, sin borrar la fila.
-- arco_requests: solicitudes de información, acceso, rectificación, cancelación, oposición
--   y revocación. due_at lo calcula el servidor con los plazos del art. 69 en días hábiles.
-- Ambas se escriben solo con la service_role desde las rutas /api; el usuario lee las suyas.
-- user_id usa ON DELETE SET NULL: si se cancela la cuenta, la prueba del consentimiento y
-- de la respuesta a la solicitud se conserva (arts. 9 y 68.4 del Reglamento).

create table if not exists public.consent_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete set null,
  purpose        text not null check (purpose in ('servicio', 'investigacion')),
  policy_version text not null,
  granted        boolean not null,
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz
);

create index if not exists consent_records_user_idx on public.consent_records (user_id, purpose, granted_at desc);

alter table public.consent_records enable row level security;

create policy consent_records_select_own on public.consent_records for select to authenticated
  using (auth.uid() = user_id);

create table if not exists public.arco_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete set null,
  request_type  text not null check (request_type in
                  ('informacion', 'acceso', 'rectificacion', 'cancelacion', 'oposicion', 'revocacion')),
  detail        text not null check (char_length(detail) between 10 and 2000),
  contact_email text not null,
  status        text not null default 'recibida'
                  check (status in ('recibida', 'en_proceso', 'atendida', 'denegada')),
  created_at    timestamptz not null default now(),
  due_at        date not null,
  response      text,
  responded_at  timestamptz
);

create index if not exists arco_requests_user_idx on public.arco_requests (user_id, created_at desc);
create index if not exists arco_requests_status_idx on public.arco_requests (status, due_at);

alter table public.arco_requests enable row level security;

create policy arco_requests_select_own on public.arco_requests for select to authenticated
  using (auth.uid() = user_id);
