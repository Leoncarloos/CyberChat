# Arquitectura física — CyberChat

Dónde se ejecuta cada parte del sistema y cómo se comunican. Toda la comunicación viaja por
HTTPS (TLS); ningún componente se conecta a la base de datos por TCP directo.

```mermaid
flowchart LR
    subgraph CLIENTE["Dispositivo del usuario"]
        NAV["Navegador web<br/>PC o móvil"]
    end

    subgraph VERCEL["Vercel · nube"]
        CDN["Red perimetral<br/>CDN + middleware de sesión"]
        FN["Funciones serverless Node.js<br/>Next.js 16: páginas y API"]
    end

    subgraph SUPA["Supabase · AWS us-west-2"]
        AUTH["Supabase Auth<br/>usuarios y sesiones"]
        API["API REST<br/>PostgREST"]
        DB[("PostgreSQL 17<br/>+ pgvector")]
        ST[("Storage<br/>bucket documents")]
    end

    subgraph IA["Servicios de IA externos"]
        GROQ["Groq Cloud<br/>LLM qwen3.8-27b"]
        HF["Hugging Face Inference<br/>paraphrase-multilingual-MiniLM-L12-v2"]
    end

    GH["GitHub<br/>repositorio"]

    NAV -- "HTTPS" --> CDN
    CDN --> FN
    NAV -- "HTTPS · sesión" --> AUTH
    NAV -- "HTTPS · historial del chat" --> API
    FN -- "HTTPS" --> AUTH
    FN -- "HTTPS" --> API
    API --> DB
    FN -- "HTTPS · archivos" --> ST
    FN -- "HTTPS · respuestas" --> GROQ
    FN -- "HTTPS · embeddings" --> HF
    GH -- "despliegue" --> VERCEL
```

| Nodo | Qué corre ahí |
|---|---|
| Navegador | Interfaz React; se conecta directo a Supabase solo para la sesión y el historial del chat (protegido por RLS) |
| Vercel · red perimetral | Entrega de archivos estáticos y refresco de la cookie de sesión |
| Vercel · funciones | Renderizado de páginas y todas las rutas `/api`; guardan las claves secretas |
| Supabase | Autenticación, base de datos con búsqueda vectorial y almacenamiento de documentos |
| Groq | Genera las respuestas del asistente y los resúmenes organizacionales |
| Hugging Face | Convierte texto en vectores de 384 dimensiones para la búsqueda semántica |
| GitHub | Código fuente desde el que Vercel construye y publica la aplicación |
