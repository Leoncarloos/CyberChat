-- HU19 — Banco fijo de preguntas para el POST TEST
-- Ejecutar en el editor SQL de Supabase (o via mcp apply_migration).

create table if not exists public.posttest_questions (
  id             uuid primary key default gen_random_uuid(),
  topic_key      text not null,
  question       text not null,
  options        jsonb not null,
  correct_index  int not null check (correct_index between 0 and 3),
  explanation    text not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.posttest_questions enable row level security;
-- Sin políticas públicas: solo supabaseAdmin (service_role) lee este banco desde /api/posttest.

create index if not exists posttest_questions_topic_idx
  on public.posttest_questions (topic_key) where active;
