-- El navegador solo puede insertar mensajes con role 'user'. La respuesta del asistente
-- la guarda /api/chat con la service_role; así un usuario no puede fabricar en su
-- historial mensajes que parezcan del asistente.
-- Aplicar DESPUÉS de desplegar la versión de /api/chat que guarda la respuesta: con el
-- código anterior, el navegador ya no podría guardar las respuestas.

drop policy messages_insert_own on public.messages;
create policy messages_insert_own on public.messages for insert to authenticated
  with check (
    role = 'user'
    and (select private.is_active_user())
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );
