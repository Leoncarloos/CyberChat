-- RLS: solo cuentas aprobadas acceden a sus datos, y se quitan los INSERT abiertos.
--
-- 1. Las rutas /api ya exigen cuenta activa (lib/authz.ts), pero el navegador consulta
--    algunas tablas directo contra Supabase con la clave anon: un empleado pendiente o
--    rechazado con sesión podía leer y crear sus conversaciones. Ahora cada política
--    exige además private.is_active_user(), que lee el estado VIGENTE de auth.users
--    (el del JWT se renueva recién cada ~1 h).
-- 2. diagnostic_results y quiz_results tenían "Service role inserta" con
--    WITH CHECK (true) para el rol public: cualquiera, incluso sin sesión, podía insertar
--    resultados para cualquier usuario. La service_role ignora RLS, así que la política
--    no hacía falta; se elimina.

create schema if not exists private;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select raw_app_meta_data->>'approval_status' = 'active'
       from auth.users where id = auth.uid()),
    false);
$$;

revoke all on function private.is_active_user() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_user() to authenticated;

-- (select …) hace que Postgres evalúe la función una vez por consulta, no por fila.

-- conversations
drop policy conversations_select_own on public.conversations;
drop policy conversations_insert_own on public.conversations;
drop policy conversations_update_own on public.conversations;
drop policy conversations_delete_own on public.conversations;
create policy conversations_select_own on public.conversations for select to authenticated
  using (auth.uid() = user_id and (select private.is_active_user()));
create policy conversations_insert_own on public.conversations for insert to authenticated
  with check (auth.uid() = user_id and (select private.is_active_user()));
create policy conversations_update_own on public.conversations for update to authenticated
  using (auth.uid() = user_id and (select private.is_active_user()))
  with check (auth.uid() = user_id and (select private.is_active_user()));
create policy conversations_delete_own on public.conversations for delete to authenticated
  using (auth.uid() = user_id and (select private.is_active_user()));

-- messages
drop policy messages_select_own on public.messages;
drop policy messages_insert_own on public.messages;
drop policy messages_delete_own on public.messages;
create policy messages_select_own on public.messages for select to authenticated
  using ((select private.is_active_user()) and exists (
    select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = auth.uid()));
create policy messages_insert_own on public.messages for insert to authenticated
  with check ((select private.is_active_user()) and exists (
    select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = auth.uid()));
create policy messages_delete_own on public.messages for delete to authenticated
  using ((select private.is_active_user()) and exists (
    select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = auth.uid()));

-- learning_progress
drop policy learning_progress_select_own on public.learning_progress;
drop policy learning_progress_insert_own on public.learning_progress;
drop policy learning_progress_update_own on public.learning_progress;
create policy learning_progress_select_own on public.learning_progress for select to authenticated
  using (auth.uid() = user_id and (select private.is_active_user()));
create policy learning_progress_insert_own on public.learning_progress for insert to authenticated
  with check (auth.uid() = user_id and (select private.is_active_user()));
create policy learning_progress_update_own on public.learning_progress for update to authenticated
  using (auth.uid() = user_id and (select private.is_active_user()))
  with check (auth.uid() = user_id and (select private.is_active_user()));

-- Resultados de evaluaciones: solo lectura propia; las escrituras van por service_role.
drop policy "Service role inserta" on public.diagnostic_results;
drop policy "Usuario ve su resultado" on public.diagnostic_results;
create policy "Usuario ve su resultado" on public.diagnostic_results for select to authenticated
  using (auth.uid() = user_id and (select private.is_active_user()));

drop policy "Service role inserta" on public.quiz_results;
drop policy "Usuario ve sus resultados" on public.quiz_results;
create policy "Usuario ve sus resultados" on public.quiz_results for select to authenticated
  using (auth.uid() = user_id and (select private.is_active_user()));

drop policy evaluation_attempts_select_own on public.evaluation_attempts;
create policy evaluation_attempts_select_own on public.evaluation_attempts for select to authenticated
  using (auth.uid() = user_id and (select private.is_active_user()));

-- Documentos: solo el dueño que los subió.
drop policy documents_select_own on public.documents;
create policy documents_select_own on public.documents for select to authenticated
  using (auth.uid() = uploaded_by and (select private.is_active_user()));

drop policy document_chunks_select_own on public.document_chunks;
create policy document_chunks_select_own on public.document_chunks for select to authenticated
  using ((select private.is_active_user()) and exists (
    select 1 from public.documents d where d.id = document_chunks.document_id and d.uploaded_by = auth.uid()));
