-- HU17 — Resumen inteligente organizacional mediante IA
-- Cache del resumen (TTL gestionado en el backend) + log de auditoría:
-- cada fila registra quién solicitó la generación, cuándo y sobre qué período.
-- Ejecutar en el editor SQL de Supabase.

create table if not exists public.org_summaries (
  id            uuid primary key default gen_random_uuid(),
  ruc           text not null,
  period        text not null default 'month'
                check (period in ('week', 'month', 'quarter', 'all')),
  summary_text  text not null,
  warnings      jsonb not null default '[]'::jsonb,
  metrics       jsonb,
  generated_by  uuid not null references auth.users (id) on delete set null,
  generated_at  timestamptz not null default now()
);

-- Lectura de cache: última generación por ruc + período.
create index if not exists org_summaries_ruc_period_idx
  on public.org_summaries (ruc, period, generated_at desc);

-- El acceso se hace solo vía service_role desde el backend (autorización por rol
-- admin en la API route). RLS habilitado sin políticas públicas = bloqueo total
-- para clientes anon/auth directos.
alter table public.org_summaries enable row level security;
