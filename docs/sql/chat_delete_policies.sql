-- Políticas de borrado del historial de chat.
-- Sin ellas, RLS deniega el DELETE sin devolver error: el chat mostraba
-- "Conversación eliminada" pero la conversación seguía en la base y reaparecía
-- al recargar. lib/db.ts borra primero los mensajes y luego la conversación.

create policy conversations_delete_own
  on public.conversations for delete
  to authenticated
  using (auth.uid() = user_id);

create policy messages_delete_own
  on public.messages for delete
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
