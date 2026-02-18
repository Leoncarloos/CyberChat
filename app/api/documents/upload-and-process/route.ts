export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function chunkText(text: string, size = 800, overlap = 100) {
  const clean = (text || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const chunks: string[] = [];
  let i = 0;

  while (i < clean.length) {
    const end = Math.min(i + size, clean.length);
    chunks.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks.filter((c) => c.trim().length > 0);
}

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

// Acepta: [[[...]]], [[...]], [...]
function normalizeHFEmbedding(raw: any): number[] {
  // [dim]
  if (Array.isArray(raw) && typeof raw[0] === "number") return raw as number[];

  // [[dim]]
  if (Array.isArray(raw) && Array.isArray(raw[0]) && typeof raw[0][0] === "number") {
    return raw[0] as number[];
  }

  // [[[token][dim]]] -> mean pool
  if (Array.isArray(raw) && Array.isArray(raw[0]) && Array.isArray(raw[0][0])) {
    return meanPool(raw[0] as number[][]);
  }

  throw new Error("HF devolvió formato inesperado");
}

async function embedHF(text: string) {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) throw new Error("Falta HF_TOKEN");

  const hfRes = await fetch(
    "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
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

async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  // ✅ pdf-extraction (Node). En Vercel requiere el d.ts (lo dejo abajo)
  const mod: any = await import("pdf-extraction");
  const pdfExtract = mod?.default ?? mod;
  const parsed = await pdfExtract(Buffer.from(arrayBuffer));
  return (parsed?.text ?? "").toString();
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();

    // 1) leer multipart
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const user_id = String(form.get("user_id") ?? "");

    if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });
    if (!user_id) return NextResponse.json({ error: "user_id requerido" }, { status: 400 });

    const filename = file.name || "document.pdf";
    const ext = filename.split(".").pop()?.toLowerCase();

    if (ext !== "pdf") {
      return NextResponse.json({ error: "Solo se permite PDF" }, { status: 400 });
    }

    // 2) subir a storage
    const path = `${user_id}/${crypto.randomUUID()}-${filename}`;
    const arrayBuffer = await file.arrayBuffer();

    const up = await supabase.storage.from("documents").upload(path, Buffer.from(arrayBuffer), {
      contentType: "application/pdf",
      upsert: false,
    });

    if (up.error) {
      return NextResponse.json({ error: "Storage upload error", details: up.error.message }, { status: 500 });
    }

    // 3) insertar registro documents
    //    Ajusta nombres de columnas según tu tabla real
    const insDoc = await supabase
      .from("documents")
      .insert({
        user_id,
        filename,
        storage_path: path, // si tu columna se llama distinto, cámbiala aquí
        status: "uploaded",
      })
      .select("id")
      .single();

    if (insDoc.error) {
      return NextResponse.json({ error: "DB documents insert error", details: insDoc.error.message }, { status: 500 });
    }

    const document_id = insDoc.data.id as string;

    // 4) extraer texto
    const text = await extractPdfText(arrayBuffer);

    if (!text || text.trim().length < 20) {
      await supabase.from("documents").update({ status: "empty_text" }).eq("id", document_id);
      return NextResponse.json({
        error: "No se pudo extraer texto del PDF (posible escaneado/imagen).",
        document_id,
      }, { status: 400 });
    }

    // 5) chunking
    const chunks = chunkText(text, 800, 100);

    // 6) generar embeddings e insertar chunks
    // ⚠️ para no reventar HF, mandamos secuencial (más estable en free)
    let inserted = 0;

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];

      const embedding = await embedHF(content); // devuelve number[]

      const insChunk = await supabase.from("document_chunks").insert({
        document_id,
        chunk_index: i,
        content,
        embedding, // vector
      });

      if (insChunk.error) {
        await supabase.from("documents").update({ status: "chunk_insert_error" }).eq("id", document_id);
        return NextResponse.json(
          { error: "Error insertando chunks", details: insChunk.error.message, document_id, at_chunk: i },
          { status: 500 }
        );
      }

      inserted++;
    }

    // 7) marcar documento listo
    await supabase.from("documents").update({ status: "ready", chunks: inserted }).eq("id", document_id);

    return NextResponse.json({
      ok: true,
      document_id,
      storage_path: path,
      chunks: inserted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Error desconocido" }, { status: 500 });
  }
}
