---
title: CyberChat Embeddings
emoji: 🔎
colorFrom: blue
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Servicio de embeddings de CyberChat

Sirve `paraphrase-multilingual-MiniLM-L12-v2` (384 dimensiones) como alternativa a la API de Inference
Providers de Hugging Face, que consume créditos. Devuelve el mismo vector que el pipeline
`feature-extraction` (mean pooling, sin normalizar), así que **no hay que reindexar**.

## Despliegue (cuenta gratuita de Hugging Face)

1. En https://huggingface.co/new-space: nombre `cyberchat-embeddings`, SDK **Docker**, hardware **CPU basic (gratis)**.
   Puede ser público; la clave de abajo protege el endpoint.
2. Suba a ese Space los archivos de esta carpeta (`README.md`, `Dockerfile`, `requirements.txt`, `app.py`)
   con *Files → Add file → Upload files*.
3. En *Settings → Variables and secrets*, cree el secreto `EMBED_API_KEY` con un valor largo y aleatorio.
4. Espere a que el estado pase a **Running** (la primera construcción tarda varios minutos).
5. Pruebe: abra `https://<usuario>-cyberchat-embeddings.hf.space/` y debe mostrar `{"status":"ok",...}`.

## Conectarlo a CyberChat

En `.env.local` y en las variables de entorno de Vercel:

```
EMBED_URL=https://<usuario>-cyberchat-embeddings.hf.space/embed
EMBED_API_KEY=<el mismo valor del secreto>
```

Con `EMBED_URL` definida, `lib/embedHF.ts` usa este servicio; sin ella vuelve a la API de Hugging Face
(`HF_TOKEN`). Después, vuelva a desplegar.

## Verificar que los vectores coinciden

```bash
EMBED_URL=... EMBED_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python verify_vectors.py
```

Compara el vector del servicio con los vectores ya guardados en `document_chunks`. Debe dar similitud
coseno cercana a 1,0000 (el criterio del script es ≥ 0,999).

## Limitaciones

- Un Space gratuito **se duerme** tras un tiempo sin tráfico; la primera consulta después tarda en
  despertarlo. `embedHF` reintenta hasta 3 veces con 4 s de espera. Para evitarlo, un monitor gratuito
  (por ejemplo UptimeRobot) que haga `GET /` cada 30 minutos lo mantiene despierto.
- CPU básica: unas decenas de milisegundos por texto corto; suficiente para el chat.
