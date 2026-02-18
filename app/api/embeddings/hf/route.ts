export const runtime = "nodejs";

import { NextResponse } from "next/server";

function meanPool(tokenEmbeddings: any): number[] {
  // tokenEmbeddings: number[][]  (tokens x dim)
  const tokens = tokenEmbeddings.length;
  const dim = tokenEmbeddings[0].length;
  const out = new Array(dim).fill(0);

  for (let i = 0; i < tokens; i++) {
    const t = tokenEmbeddings[i];
    for (let j = 0; j < dim; j++) out[j] += t[j];
  }
  for (let j = 0; j < dim; j++) out[j] /= tokens;
  return out;
}

function toSentenceEmbedding(hfOutput: any): number[] {
  // HF puede devolver:
  // - number[] (ya pooled)
  // - number[][] (tokens x dim)
  if (Array.isArray(hfOutput) && typeof hfOutput[0] === "number") return hfOutput;
  if (Array.isArray(hfOutput) && Array.isArray(hfOutput[0])) return meanPool(hfOutput);
  throw new Error("Salida HF inesperada para embeddings");
}

export async function POST(req: Request) {
  const { texts } = await req.json();

  if (!Array.isArray(texts) || texts.length === 0) {
    return NextResponse.json({ error: "texts requerido" }, { status: 400 });
  }

  const token = process.env.HF_TOKEN;
  if (!token) return NextResponse.json({ error: "Falta HF_TOKEN" }, { status: 500 });

  const url =
    "https://router.huggingface.co/hf-inference/models/" +
    "sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: texts, // batch
      options: { wait_for_model: true },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return NextResponse.json({ error: "HF error", details: t }, { status: 500 });
  }

  const raw = await resp.json();

  // raw puede ser:
  // - para batch: Array< (number[] | number[][]) >
  // - para single: (number[] | number[][])
  const arr = Array.isArray(raw) ? raw : [raw];

  const embeddings = arr.map((item) => toSentenceEmbedding(item));

  // seguridad: all-MiniLM-L6-v2 debería ser 384 dims :contentReference[oaicite:1]{index=1}
  if (embeddings[0]?.length !== 384) {
    return NextResponse.json(
      { error: "Dimensión inesperada", got: embeddings[0]?.length },
      { status: 500 }
    );
  }

  return NextResponse.json({ embeddings });
}