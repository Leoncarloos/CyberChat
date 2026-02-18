export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function chunkText(text: string, size = 800, overlap = 100) {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = start + size;
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

function getExt(filename: string) {
  const parts = (filename || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

function meanPool(tokenEmbeddings: number[][]): number[] {
  const tokens = tokenEmbeddings.length;
  const dim = tokenEmbeddings[0]?.length ?? 0;
  const out = new Array(dim).fill(0);

  for (let i = 0; i < tokens; i++) {
    const t = tokenEmbeddings[i];
    for (let j = 0; j < dim; j++) out[j] += t[j];
  }
  for (let j = 0; j < dim; j++) out[j] /= tokens || 1;
  return out;
}

function toSentenceEmbedding(hfOutput: any): number[] {
  // HF puede devolver:
  // - number[] (ya pooled)
  // - number[][] (tokens x dim)
  // - number[][][] (batch x tokens x dim)
  if (Array.isArray(hfOutput) && typeof hfOutput[0] === "number") return hfOutput;
  if (Array.isArray(hfOutput) && Array.isArray(hfOutput[0]) && typeof hfOutput[0][0] === "number") {
    return meanPool(hfOutput as number[][]);
  }
  // batch
  if (Array.isArray(hfOutput) && Array.isArray(hfOutput[0]) && Array.isArray(hfOutput[0][0])) {
    // hfOutput[0] = tokens x dim
    return meanPool(hfOutput[0] as number[][]);
  }
  throw new Error("Salida HF inesperada para embeddings");
}

async function embedHF(texts: string[]) {
  if (!Array.isArray(texts) || texts.length === 0) throw new Error("texts vacío");

  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("Falta HF_TOKEN en variables de entorno");

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

  const rawText = await resp.text();
  let raw: any = null;
  try {
    raw = rawText ? JSON.parse(rawText) : null;
  } catch {}

  if (!resp.ok) {
    throw new Error(`HF error (${resp.status}): ${raw?.error ?? rawText ?? "Respuesta vacía"}`);
  }

  // raw para batch suele ser Array< number[][] > (cada item: tokens x dim)
  const arr = Array.isArray(raw) ? raw : [raw];

  const embeddings = arr.map((item) => toSentenceEmbedding(item));

  if (embeddings[0]?.length !== 384) {
    throw new Error(`Dimensión inesperada embedding: ${embeddings[0]?.length ?? "?"} (esperado 384)`);
  }

  return embeddings;
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();

    // ---- 0) form-data
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const user_id = String(form.get("user_id") ?? "");

    if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });
    if (!user_id) return NextResponse.json({ error: "user_id requerido" }, { status: 400 });

    const ext = getExt(file.name);
    if (!["pdf", "docx", "txt"].includes(ext)) {
      return NextResponse.json(
        { error: `Tipo no soportado: .${ext}. Usa PDF, DOCX o TXT.` },
        { status: 400 }
      );
    }

    // ---- 1) subir a storage
    const storagePath = `${user_id}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const contentType =
      ext === "pdf"
        ? "application/pdf"
        : ext === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "text/plain";

    const up = await supabase.storage.from("documents").upload(storagePath, bytes, {
      contentType,
      upsert: false,
    });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

    // ---- 2) insertar en tabla documents
    const ins = await supabase
      .from("documents")
      .insert({
        name: file.name,
        storage_path: storagePath,
        uploaded_by: user_id,
      })
      .select("id")
      .single();

    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
    const document_id = ins.data.id as string;

    // ---- 3) extraer texto (desde bytes ya en memoria)
    const arrayBuffer = await file.arrayBuffer();
    let text = "";

    if (ext === "txt") {
      text = new TextDecoder("utf-8").decode(arrayBuffer);
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      text = result.value || "";
    } else if (ext === "pdf") {
      const mod: any = await import("pdf-extraction");
      const pdfExtract = mod?.default ?? mod;
      const parsed = await pdfExtract(Buffer.from(arrayBuffer));
      text = parsed?.text || "";
    }

    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return NextResponse.json(
        { error: "Documento sin texto legible (puede ser escaneado)" },
        { status: 400 }
      );
    }

    // ---- 4) chunking + guardar chunks
    const chunks = chunkText(text);

    // limpiar chunks previos
    await supabase.from("document_chunks").delete().eq("document_id", document_id);

    // insertamos primero content + index
    const rows = chunks.map((content, chunk_index) => ({
      document_id,
      content,
      chunk_index,
    }));

    const { data: inserted, error: insChunksErr } = await supabase
      .from("document_chunks")
      .insert(rows)
      .select("id, content, chunk_index");

    if (insChunksErr) return NextResponse.json({ error: insChunksErr.message }, { status: 500 });

    // ---- 5) embeddings batch
    const contents = (inserted ?? []).map((r: any) => String(r.content ?? ""));
    const embeddings = await embedHF(contents);

    // ---- 6) actualizar embedding por chunk_id
    // ⚠️ Requiere columna `embedding` en document_chunks (vector(384))
    const updates = (inserted ?? []).map((r: any, i: number) => ({
      id: r.id,
      embedding: embeddings[i],
    }));

    // update uno por uno (seguro)
    for (const u of updates) {
      const { error: upErr } = await supabase
        .from("document_chunks")
        .update({ embedding: u.embedding })
        .eq("id", u.id);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      document_id,
      storage_path: storagePath,
      uploaded: true,
      processed: true,
      embedded: true,
      chunks: chunks.length,
      type: ext,
    });
  } catch (e: any) {
    console.error("UPLOAD+PROCESS+EMBED ERROR:", e);
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}