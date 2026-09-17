# Flujo RAG — CyberChat

CyberChat usa **RAG (Retrieval-Augmented Generation, generación aumentada por recuperación)**:
antes de que el modelo de lenguaje responda, el sistema busca en los documentos de la empresa los
fragmentos más parecidos a la pregunta y se los entrega como contexto. Así las respuestas se basan
en las políticas reales de cada empresa y no solo en el conocimiento general del modelo.

El flujo tiene dos fases: la **indexación**, cuando el administrador sube un documento, y la
**consulta**, cada vez que alguien le pregunta algo al asistente.

```mermaid
flowchart TB
    subgraph F1["Fase 1 · Indexación (administrador)"]
        direction LR
        A1["Sube documento<br/>PDF, DOCX o TXT · máx. 10 MB"]
        A2["Extrae y limpia<br/>el texto"]
        A3["Fragmenta por oraciones<br/>máx. 800 caracteres<br/>solapa 1 oración"]
        A4["Genera un embedding<br/>por fragmento<br/>vector de 384 dimensiones"]
        A5[("Guarda archivo, documento<br/>y fragmentos con su vector<br/>índice HNSW")]
        A1 --> A2 --> A3 --> A4 --> A5
    end

    subgraph F2["Fase 2 · Consulta (cualquier usuario de la empresa)"]
        direction LR
        B1["Usuario pregunta<br/>en el chat"]
        B2["Genera el embedding<br/>de la pregunta<br/>mismo modelo"]
        B3["Identifica la empresa<br/>RUC de la sesión"]
        B4["Búsqueda semántica<br/>similitud coseno<br/>top 5 de su empresa"]
        B5["Quita duplicados y<br/>descarta similitud < 0.38"]
        B6{"¿Quedan<br/>fragmentos?"}
        B7["Prompt con los fragmentos<br/>como contexto documental"]
        B8["Prompt de conocimiento<br/>general + sugerencia de<br/>subir documentos"]
        B9["LLM genera la respuesta<br/>+ últimos 12 mensajes<br/>temperatura 0.15"]
        B10["Respuesta y fuentes<br/>con su % de similitud"]
        B1 --> B2 --> B3 --> B4 --> B5 --> B6
        B6 -- "Sí" --> B7 --> B9
        B6 -- "No" --> B8 --> B9
        B9 --> B10
    end

    F1 == "base de conocimiento de la empresa" ==> F2

    classDef idx fill:#dae8fc,stroke:#6c8ebf,color:#1a1a1a
    classDef qry fill:#d5e8d4,stroke:#82b366,color:#1a1a1a
    classDef ia fill:#ffe6cc,stroke:#d79b00,color:#1a1a1a
    class A1,A2,A3,A5 idx
    class B1,B3,B5,B6,B7,B8,B10 qry
    class A4,B2,B4,B9 ia
```

## Tecnologías en cada paso

| Paso | Tecnología |
|---|---|
| Extracción de texto | `pdf-extraction` (PDF) y `mammoth` (DOCX) |
| Embeddings | Hugging Face Inference · `paraphrase-multilingual-MiniLM-L12-v2`, multilingüe, 384 dimensiones |
| Almacenamiento de vectores | PostgreSQL 17 + `pgvector` en Supabase, índice HNSW con distancia coseno |
| Búsqueda semántica | Función `match_document_chunks_scoped`: devuelve los 5 fragmentos más cercanos, solo de documentos de la empresa |
| Generación | Groq · `qwen/qwen3.8-27b`, temperatura 0.15, máximo 900 tokens |

## Por qué funciona así

- **Mismo modelo en ambas fases.** La pregunta y los fragmentos se convierten en vectores con el
  mismo modelo; solo así la distancia entre ellos mide qué tan parecido es su significado.
- **Fragmentos por oraciones.** Cortar por oraciones completas, con una de solapamiento, evita
  partir ideas a la mitad y conserva el contexto entre fragmentos vecinos.
- **Aislamiento por empresa.** La empresa sale de la sesión del usuario, nunca de lo que envía el
  navegador, así que un usuario no puede recuperar documentos de otra empresa.
- **Umbral de 0.38.** Los fragmentos poco parecidos se descartan para que no desvíen la respuesta.
  Si no queda ninguno, el asistente responde con conocimiento general y lo indica.
- **Alcance limitado.** El prompt de sistema restringe al asistente a temas de ciberseguridad,
  aunque el usuario insista.
- **Fuentes visibles.** Cada respuesta muestra los fragmentos usados y su similitud, para que el
  usuario sepa en qué se basó.
