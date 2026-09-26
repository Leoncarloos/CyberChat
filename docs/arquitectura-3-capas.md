# Arquitectura en 3 capas — CyberChat

Vista clásica en tres capas: **UI** (presentación), **BLL** (lógica de negocio) y **DAL** (acceso a
datos). Los servicios de IA se tratan como una fuente externa más: la BLL decide cuándo usarlos y
la DAL se encarga de llamarlos. Versión editable: [arquitectura-3-capas.drawio](arquitectura-3-capas.drawio).

```mermaid
flowchart TB
    subgraph UI["UI · Capa de presentación — navegador, React 19 + Tailwind 4"]
        direction LR
        U1["Acceso<br/>login · registro<br/>recuperar contraseña"]
        U2["Empleado<br/>diagnóstico · chat con IA<br/>evaluaciones · dashboard"]
        U3["Administrador<br/>empleados · documentos<br/>dashboard organizacional"]
    end

    subgraph BLL["BLL · Capa de lógica de negocio — rutas /api de Next.js"]
        direction LR
        L1["Usuarios y acceso<br/>registro · aprobación · roles<br/>validación de datos"]
        L2["Asistente RAG<br/>indexar documentos<br/>buscar contexto · armar prompt"]
        L3["Evaluaciones<br/>diagnóstico · post-test · recurrente<br/>calificación en el servidor"]
        L4["Aprendizaje y métricas<br/>ruta de aprendizaje · recomendaciones<br/>métricas y resumen IA de la empresa"]
    end

    subgraph DAL["DAL · Capa de acceso a datos"]
        direction LR
        D1["Clientes Supabase<br/>sesión · servidor · administrador"]
        D2["Historial del chat<br/>lib/db.ts"]
        D3["Cliente de embeddings<br/>lib/embedHF.ts"]
        D4["Cliente del LLM<br/>API de Groq"]
    end

    subgraph EXT["Fuentes de datos y servicios de IA"]
        direction LR
        S1[("Supabase<br/>PostgreSQL + pgvector<br/>Auth · Storage")]
        S2["Hugging Face<br/>multilingual MiniLM<br/>embeddings 384 dim"]
        S3["Groq<br/>gpt-oss-20b<br/>generación de texto"]
    end

    UI == "HTTPS · JSON" ==> BLL
    BLL ==> DAL
    DAL ==> EXT

    classDef ui fill:#dae8fc,stroke:#6c8ebf,color:#1a1a1a
    classDef bll fill:#d5e8d4,stroke:#82b366,color:#1a1a1a
    classDef dal fill:#fff2cc,stroke:#d6b656,color:#1a1a1a
    classDef ia fill:#ffe6cc,stroke:#d79b00,color:#1a1a1a
    class U1,U2,U3 ui
    class L1,L2,L3,L4 bll
    class D1,D2,S1 dal
    class D3,D4,S2,S3 ia
```

## Responsabilidad de cada capa

| Capa | Responsabilidad | En el código |
|---|---|---|
| **UI** | Mostrar pantallas, capturar lo que hace el usuario y llamar a la BLL | `app/**/page.tsx`, `components/` |
| **BLL** | Validar sesión y rol, aplicar reglas de negocio, orquestar el RAG, calificar evaluaciones y calcular métricas | `app/api/**/route.ts`, `lib/orgMetrics.ts`, `lib/learningPath.ts`, `lib/evaluationConfig.ts`, `lib/diagnosticBank.ts`, `lib/orgAdmin.ts`, `lib/validators/` |
| **DAL** | Leer y escribir en la base, el almacenamiento y la autenticación; llamar a los modelos de IA | `lib/supabaseServer.ts`, `lib/supabaseAdmin.ts`, `lib/supabaseBrowser.ts`, `lib/db.ts`, `lib/embedHF.ts` |

## Dónde entra la IA

| Servicio | Lo usa | Para qué |
|---|---|---|
| Hugging Face · `paraphrase-multilingual-MiniLM-L12-v2` | Asistente RAG · Aprendizaje y métricas | Convertir documentos, preguntas y temas débiles en vectores para la búsqueda semántica |
| Groq · `openai/gpt-oss-20b` | Asistente RAG | Responder preguntas con el contexto recuperado |
| Groq · `openai/gpt-oss-20b` | Aprendizaje y métricas | Recomendaciones personalizadas y resumen ejecutivo de la empresa |

## Desviaciones del modelo en el código actual

- **La UI salta la BLL en el chat.** El historial de conversaciones se lee y escribe desde el
  navegador con `lib/db.ts`, directo contra Supabase. La protección la dan las políticas RLS.
- **Groq no tiene un cliente propio.** La llamada HTTP a Groq está escrita dentro de cuatro rutas
  (`chat`, `dashboard`, `org-summary`, `recommendations`) en vez de estar en un módulo de la DAL
  como `embedHF.ts`.
