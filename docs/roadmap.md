# Roadmap

## Estado actual — v0.1 (MVP)
- [x] Auth con Supabase (login / registro)
- [x] Chat RAG con historial persistente
- [x] Ingesta de documentos PDF/DOCX/TXT
- [x] Embeddings con HuggingFace all-MiniLM-L6-v2
- [x] Búsqueda semántica con pgvector
- [x] Inferencia con Groq llama-3.1-8b-instant
- [x] Gestión de empleados (admin)
- [x] Quiz de ciberseguridad hardcodeado
- [x] UI multirol (empleado / admin)

---

## v0.2 — Estabilización
- [ ] Protección de rutas server-side en middleware (no solo client-side)
- [ ] Rate limiting en `/api/chat` (evitar abuso de créditos HF/Groq)
- [ ] Streaming de respuestas del LLM (reducir tiempo de espera percibido)
- [ ] UI de errores inline — reemplazar `alert()` por componentes de feedback
- [ ] Paginación en listado de empleados
- [ ] Enviar `document_id` desde el frontend al chat cuando el usuario filtre por documento

---

## v0.3 — Mejoras de producto
- [ ] Quiz dinámico — preguntas desde base de datos, editables por admin
- [ ] Historial de evaluaciones por empleado
- [ ] Múltiples documentos seleccionables en el chat (no solo uno a la vez)
- [ ] Preview de documentos subidos en módulo admin
- [ ] Eliminar documentos desde el módulo admin (con limpieza de chunks en BD)
- [ ] Notificaciones al admin cuando hay nuevos empleados pendientes

---

## v0.4 — Escala multiempresa
- [ ] Registro de empresa separado del registro de empleado
- [ ] Invitación de empleados por email desde el panel admin
- [ ] Dashboard con métricas de uso (consultas por empleado, documentos activos)
- [ ] Soporte para múltiples admins por empresa

---

## Backlog (sin prioridad definida)
- Soporte para imágenes en documentos (OCR)
- Exportar historial de conversaciones
- Modo oscuro
- Evaluaciones con preguntas generadas por IA basadas en los documentos de la empresa
- Integración con Microsoft 365 / Google Drive para ingesta de documentos
- API pública para integraciones externas
