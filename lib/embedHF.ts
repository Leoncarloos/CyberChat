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

export async function embedHF(text: string): Promise<number[]> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("Falta HF_TOKEN");

  const input = text.trim().replace(/\s+/g, " ").slice(0, 512);

  const resp = await fetch(
    `https://router.huggingface.co/hf-inference/models/${EMBED_MODEL}/pipeline/feature-extraction`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: input, options: { wait_for_model: true } }),
      cache: "no-store",
    }
  );

  const rawText = await resp.text();
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
