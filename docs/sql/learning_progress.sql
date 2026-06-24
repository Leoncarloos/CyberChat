-- HU11 — Ruta de aprendizaje guiada en el chatbot
-- Persistencia del progreso por tema (estado de la ruta entre sesiones).
-- Ejecutar en el editor SQL de Supabase.

create table if not exists public.learning_progress (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  topic_key   text not null,
  status      text not null default 'pendiente'
              check (status in ('pendiente', 'en_progreso', 'completado')),
  updated_at  timestamptz not null default now(),
  unique (user_id, topic_key)
);

alter table public.learning_progress enable row level security;

-- El usuario solo ve y modifica su propio progreso.
create policy "learning_progress_select_own"
  on public.learning_progress for select
  using (auth.uid() = user_id);

create policy "learning_progress_insert_own"
  on public.learning_progress for insert
  with check (auth.uid() = user_id);

create policy "learning_progress_update_own"
  on public.learning_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists learning_progress_user_idx
  on public.learning_progress (user_id);
