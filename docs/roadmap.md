# Roadmap

## Estado actual — implementado
- [x] Auth con Supabase: login, recuperación de contraseña
- [x] Registro separado: dueño + empresa (`/register/admin`) y solicitud de empleado (`/register/employee`)
- [x] Aprobación/rechazo/edición de empleados por el dueño (`/manage`)
- [x] Autorización en tres capas: `requireActiveUser()`/`requireAdmin()` en API, RLS con cuenta activa, middleware server-side
- [x] Rol, RUC y estado en `app_metadata` (solo escribible por service_role)
- [x] Chat RAG con historial persistente (conversaciones renombrables y eliminables)
- [x] Base documental por empresa: el dueño sube, todos los empleados del RUC consultan
- [x] Ingesta de documentos PDF/DOCX/TXT (máx. 10 MB), listado, eliminación y reprocesamiento
- [x] Chunking por oraciones (800 caracteres, 1 oración de solapamiento)
- [x] Embeddings multilingües HuggingFace `paraphrase-multilingual-MiniLM-L12-v2` (384-dim)
- [x] Búsqueda semántica con pgvector + índice HNSW (top-5, umbral 0.38)
- [x] Inferencia con Groq `openai/gpt-oss-20b` (`reasoning_effort: low`)
- [x] Diagnóstico inicial obligatorio (16 preguntas, 8 temas × 2), calificado en servidor
- [x] Post-test y evaluación recurrente cada 5 días desde banco fijo de 200 preguntas, sin repetición
- [x] Ruta de aprendizaje por tema con atajos y progreso persistente
- [x] Dashboard personal con recomendaciones IA
- [x] Dashboard organizacional, exportación CSV y resumen ejecutivo IA con caché de 1 h
- [x] Errores inline con toasts en lugar de `alert()` (salvo exportación CSV en `/org-dashboard`)

---

## Próximas mejoras
- [ ] Streaming de respuestas del LLM (reducir tiempo de espera percibido)
- [ ] Rate limiting en `/api/chat` (evitar abuso de créditos HF/Groq)
- [ ] Cliente LLM centralizado (hoy la llamada a Groq se repite en cuatro rutas)
- [ ] Reemplazar los últimos `alert()` de la exportación CSV por toasts
- [ ] Paginación en listado de empleados y en `listUsers` (> 1000 usuarios)
- [ ] Enviar `document_id` desde el frontend al chat cuando el usuario filtre por documento
- [ ] Preview de documentos subidos en el módulo admin
- [ ] Notificaciones al admin cuando hay nuevos empleados pendientes

---

## Backlog (sin prioridad definida)
- Soporte para imágenes en documentos (OCR)
- Exportar historial de conversaciones
- Modo oscuro
- Invitación de empleados por email desde el panel admin
- Soporte para múltiples admins por empresa
- Integración con Microsoft 365 / Google Drive para ingesta de documentos
- API pública para integraciones externas
