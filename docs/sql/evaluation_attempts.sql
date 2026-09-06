-- HU20 — Evaluación recurrente cada 5 días
-- evaluation_attempts: registro append-only de cada evaluación (post-test y recurrentes)
-- con desempeño por tema para medir áreas críticas en el tiempo.
-- seen_questions: preguntas del banco ya respondidas por cada usuario (anti-repetición).

create table if not exists public.evaluation_attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  test_type           text not null check (test_type in ('posttest', 'recurrente')),
  score               int not null,
  total               int not null,
  topics_performance  jsonb not null default '{}'::jsonb,
  taken_at            timestamptz not null default now()
);

alter table public.evaluation_attempts enable row level security;

create policy "evaluation_attempts_select_own"
  on public.evaluation_attempts for select
  using (auth.uid() = user_id);

create index if not exists evaluation_attempts_user_idx
  on public.evaluation_attempts (user_id, taken_at desc);

create table if not exists public.seen_questions (
  user_id      uuid not null references auth.users (id) on delete cascade,
  question_id  uuid not null references public.posttest_questions (id) on delete cascade,
  seen_at      timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.seen_questions enable row level security;
-- Sin políticas públicas: solo supabaseAdmin (service_role) escribe/lee.
