// Multilingual sentence-transformer — 384-dim, compatible con pgvector existente.
// Reemplaza all-MiniLM-L6-v2 (inglés) para mayor precisión en español.
const EMBED_MODEL =
  "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
export const EMBED_DIM = 384;

type EmbeddingRaw = number[] | number[][] | number[][][];

function meanPool(tokens: number[][]): number[] {
  const n = tokens.length || 1;
  const dim = tokens[0]?.length ?? 0;
  const out = new Array<number>(dim).fill(0);
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < dim; j++) out[j] += tokens[i][j];
  }
  for (let j = 0; j < dim; j++) out[j] /= n;
  return out;
}

function normalize(raw: EmbeddingRaw): number[] {
  if (Array.isArray(raw) && typeof raw[0] === "number") return raw as number[];
  if (
    Array.isArray(raw) &&
    Array.isArray(raw[0]) &&
    typeof (raw[0] as number[])[0] === "number"
  )
    return meanPool(raw as number[][]);
  if (Array.isArray(raw) && Array.isArray(raw[0]) && Array.isArray((raw[0] as number[][])[0]))
    return meanPool((raw as number[][][])[0] ?? []);
  throw new Error("HF devolvió formato de embedding inesperado");
}

const RETRIES = 3;
const RETRY_DELAY_MS = 4000;

// EMBED_URL apunta a un servicio propio con el mismo modelo (embedding-space/); sin ella se usa
// la API de Hugging Face, que depende de los créditos de Inference Providers.
export async function embedHF(text: string): Promise<number[]> {
  const url = process.env.EMBED_URL;
  const token = url ? process.env.EMBED_API_KEY : process.env.HF_TOKEN;
  if (!url && !token) throw new Error("Falta HF_TOKEN");

  const input = text.trim().replace(/\s+/g, " ").slice(0, 512);
  const endpoint =
    url ??
    `https://router.huggingface.co/hf-inference/models/${EMBED_MODEL}/pipeline/feature-extraction`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Un Space gratuito se duerme y tarda en despertar: se reintenta un 5xx o un corte de red.
  let resp: Response | null = null;
  let rawText = "";
  for (let attempt = 1; attempt <= (url ? RETRIES : 1); attempt++) {
    try {
      resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ inputs: input, options: { wait_for_model: true } }),
        cache: "no-store",
        signal: url ? AbortSignal.timeout(30000) : undefined,
      });
      rawText = await resp.text();
      if (resp.status < 500) break;
    } catch (error) {
      if (attempt === RETRIES) throw error;
    }
    if (attempt < RETRIES) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  if (!resp) throw new Error("Embedding sin respuesta");

  let raw: unknown = null;
  try {
    raw = rawText ? (JSON.parse(rawText) as EmbeddingRaw) : null;
  } catch {}

  if (!resp.ok) {
    const msg =
      typeof raw === "object" && raw ? JSON.stringify(raw) : rawText;
    throw new Error(msg || "HF embedding error");
  }

  const emb = normalize((raw ?? []) as EmbeddingRaw);
  if (emb.length !== EMBED_DIM)
    throw new Error(`Embedding inválida: ${emb.length} dims (esperado ${EMBED_DIM})`);
  return emb;
}
