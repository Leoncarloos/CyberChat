# Contratos de API

Todos los endpoints viven bajo `/api/`. Runtime: Node.js. Auth: Supabase session cookie.

---

## POST `/api/chat`

Inferencia RAG + LLM. Requiere sesión activa (cualquier rol).

### Request
```json
{
  "messages": [
    { "role": "user", "content": "¿Qué es el phishing?" },
    { "role": "assistant", "content": "..." }
  ],
  "document_id": "uuid-opcional"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `messages` | `ChatMsg[]` | ✓ | Historial completo. Mínimo 1 mensaje. |
| `document_id` | string | — | Filtra RAG a un documento específico. Si omitido, busca en todos. |

### Response 200
```json
{
  "answer": "string",
  "matchesCount": 3,
  "bestSimilarity": 0.72,
  "usedContext": true,
  "sources": [
    { "rank": 1, "similarity": 0.72, "preview": "primeros 220 chars del chunk..." }
  ]
}
```

### Errores
| Status | Causa |
|--------|-------|
| 400 | `messages` vacío o ausente, o último mensaje de usuario vacío |
| 401 | Sin sesión o sesión inválida |
| 500 | Falta `GROQ_API_KEY`, error HF embedding, error Supabase RPC, error Groq |

---

## GET `/api/admin/employees`

Lista empleados de la empresa del admin autenticado. Requiere rol `admin`.

### Response 200
```json
{
  "employees": [
    {
      "id": "uuid",
      "email": "empleado@empresa.com",
      "full_name": "Juan Pérez",
      "first_name": "Juan",
      "last_name": "Pérez",
      "ruc": "20123456789",
      "status": "pending",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "counts": { "all": 10, "active": 7, "pending": 2, "rejected": 1 },
  "ruc": "20123456789"
}
```

### Errores
| Status | Causa |
|--------|-------|
| 401 | Sin sesión |
| 403 | Usuario sin rol `admin` |
| 500 | Error Supabase |

---

## PATCH `/api/admin/employees`

Aprueba, rechaza o edita nombre de un empleado. Requiere rol `admin`.

### Request
```json
{
  "userId": "uuid",
  "action": "approve" | "reject" | "edit",
  "firstName": "Juan",
  "lastName": "Pérez"
}
```

| Campo | Requerido para |
|-------|---------------|
| `userId` | Siempre |
| `action` | Siempre |
| `firstName` / `lastName` | Solo `action: "edit"` |

### Response 200
```json
{ "ok": true }
```

### Errores
| Status | Causa |
|--------|-------|
| 400 | `action` inválido o `userId` ausente |
| 401 | Sin sesión |
| 403 | Sin rol `admin` o empleado no pertenece al RUC del admin |
| 500 | Error Supabase |

---

## POST `/api/documents/upload-and-process`

Sube documento y ejecuta pipeline RAG completo. Requiere rol `admin`. Body: `multipart/form-data`.

### Request
```
Content-Type: multipart/form-data

file:    File (.pdf | .docx | .txt)
user_id: string (UUID del admin)
```

### Response 200
```json
{
  "document_id": "uuid",
  "chunks": 42
}
```

### Errores
| Status | Causa |
|--------|-------|
| 400 | Sin archivo, formato no soportado |
| 401 | Sin sesión |
| 403 | Sin rol `admin` |
| 500 | Error Storage, error extracción texto, error embedding, error inserción BD |

---

---

## GET `/api/diagnostic`

Verifica si el usuario autenticado ha completado la evaluación diagnóstica.

### Response 200
```json
{ "completed": true }
```

### Errores
| Status | Causa |
|--------|-------|
| 401 | Sin sesión |

---

## POST `/api/diagnostic`

Guarda los resultados del diagnóstico y desbloquea el acceso a la plataforma.

### Request
```json
{
  "score": 12,
  "total": 16,
  "topicsPerformance": {
    "phishing": { "correct": 2, "total": 2 },
    "ia_amenazas": { "correct": 1, "total": 2 }
  }
}
```

### Response 200
```json
{ "ok": true }
```

**Efectos colaterales:**
- INSERT en `diagnostic_results`
- `auth.admin.updateUserById` → `user_metadata.diagnostic_done = true`
- El middleware desbloquea rutas protegidas en la siguiente request

### Errores
| Status | Causa |
|--------|-------|
| 400 | Payload inválido (tipos incorrectos) |
| 401 | Sin sesión |
| 500 | Error Supabase al insertar o al actualizar metadata |

---

## Notas generales
- Todos los endpoints validan sesión con `supabaseServer().auth.getUser()` — nunca confiar en `user_id` del body para operaciones sensibles
- Los errores siempre devuelven `{ "error": "mensaje" }` con el status HTTP apropiado
- No hay paginación implementada actualmente — `/api/admin/employees` devuelve todos los empleados
