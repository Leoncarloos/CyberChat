export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function meanPool(tokens: number[][]) {
  const nTokens = tokens.length;
  const dim = tokens[0]?.length ?? 0;
  const emb = new Array(dim).fill(0);

  for (let i = 0; i < nTokens; i++) {
    for (let j = 0; j < dim; j++) emb[j] += tokens[i][j];
  }
  for (let j = 0; j < dim; j++) emb[j] /= nTokens || 1;

  return emb;
}

// ✅ Acepta: [[[...]]], [[...]], [...]
function normalizeHFEmbedding(raw: any): number[] {
  // Caso C: [...]
  if (Array.isArray(raw) && typeof raw[0] === "number") return raw as number[];

  // Caso B: [[...384]]
  if (Array.isArray(raw) && Array.isArray(raw[0]) && typeof raw[0][0] === "number") {
    return raw[0] as number[];
  }

  // Caso A: [[[...384], [...384], ...]]
  if (Array.isArray(raw) && Array.isArray(raw[0]) && Array.isArray(raw[0][0])) {
    return meanPool(raw[0] as number[][]);
  }

  throw new Error("HF devolvió formato inesperado");
}

async function embedHF(query: string) {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) throw new Error("Falta HF_TOKEN en .env.local");

  const hfRes = await fetch(
    "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${hfToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: query, options: { wait_for_model: true } }),
    }
  );

  const rawText = await hfRes.text();
  let raw: any = null;
  try {
    raw = rawText ? JSON.parse(rawText) : null;
  } catch {}

  if (!hfRes.ok) {
    throw new Error(`HF error (${hfRes.status}): ${raw?.error ?? rawText ?? "Respuesta vacía"}`);
  }

  try {
    return normalizeHFEmbedding(raw);
  } catch {
    throw new Error(`HF devolvió formato inesperado: ${rawText}`);
  }
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query) return NextResponse.json({ error: "query requerido" }, { status: 400 });

    const supabase = supabaseServer();
    const emb = await embedHF(String(query));

    const { data, error } = await supabase.rpc("match_document_chunks", {
      query_embedding: emb,
      match_count: 5,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ matches: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Error desconocido" }, { status: 500 });
  }
}
