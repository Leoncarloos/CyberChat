export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function meanPool(tokens: number[][]) {
  const n = tokens.length || 1;
  const dim = tokens[0]?.length ?? 0;
  const out = new Array(dim).fill(0);

  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < dim; j++) out[j] += tokens[i][j];
  }
  for (let j = 0; j < dim; j++) out[j] /= n;

  return out;
}

// ✅ Acepta: number[], number[][], number[][][]
function normalizeHFEmbedding(raw: any): number[] {
  if (Array.isArray(raw) && typeof raw[0] === "number") return raw as number[];

  // tokens x dim
  if (Array.isArray(raw) && Array.isArray(raw[0]) && typeof raw[0][0] === "number") {
    return meanPool(raw as number[][]);
  }

  // batch => [tokens x dim] o [ [tokens x dim] ]
  if (Array.isArray(raw) && Array.isArray(raw[0]) && Array.isArray(raw[0][0])) {
    return meanPool(raw[0] as number[][]);
  }

  throw new Error("HF devolvió formato inesperado");
}

async function embedHF(text: string) {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("Falta HF_TOKEN");

  const url =
    "https://router.huggingface.co/hf-inference/models/" +
    "sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    cache: "no-store",
  });

  const rawText = await resp.text();
  let raw: any = null;
  try {
    raw = rawText ? JSON.parse(rawText) : null;
  } catch {}

  if (!resp.ok) {
    throw new Error(raw?.error ?? rawText ?? "HF error");
  }

  const emb = normalizeHFEmbedding(raw);
  if (emb.length !== 384) throw new Error(`Embedding dim inválida: ${emb.length}`);
  return emb;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = String(body?.query ?? "").trim();
    const document_id = body?.document_id ? String(body.document_id) : null;

    if (!query) {
      return NextResponse.json({ error: "query requerido" }, { status: 400 });
    }

    // ✅ OJO: supabaseServer() es async
    const supabase = await supabaseServer();

    // ✅ auth desde cookies SSR
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });

    const user = auth?.user;
    if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const query_embedding = await embedHF(query);

    const { data, error } = await supabase.rpc("match_document_chunks_scoped", {
      query_embedding,
      filter_user_id: user.id,
      filter_document_id: document_id, // puede ser null
      match_count: 5,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ matches: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
