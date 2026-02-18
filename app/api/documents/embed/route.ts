export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { document_id } = await req.json();
  if (!document_id) return NextResponse.json({ error: "document_id requerido" }, { status: 400 });

  const supabase = supabaseServer();

  const { data: chunks, error } = await supabase
    .from("document_chunks")
    .select("id, content")
    .eq("document_id", document_id)
    .order("chunk_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!chunks?.length) return NextResponse.json({ ok: true, updated: 0 });

  const texts = chunks.map((c: any) => c.content);

  // llama a tu endpoint HF (pooling 1D ya aplicado)
  const embRes = await fetch("http://localhost:3000/api/embeddings/hf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts }),
  });

  if (!embRes.ok) {
    const t = await embRes.text();
    return NextResponse.json({ error: "Embeddings error", details: t }, { status: 500 });
  }

  const { embeddings } = await embRes.json();

  // guarda embedding por chunk
  for (let i = 0; i < chunks.length; i++) {
    await supabase
      .from("document_chunks")
      .update({ embedding: embeddings[i] })
      .eq("id", chunks[i].id);
  }

  return NextResponse.json({ ok: true, updated: chunks.length });
}