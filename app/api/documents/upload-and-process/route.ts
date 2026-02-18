export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function normalizeHFEmbedding(raw: any): number[] {
  if (Array.isArray(raw) && typeof raw[0] === "number") return raw as number[];
  if (Array.isArray(raw) && Array.isArray(raw[0]) && typeof raw[0][0] === "number") {
    return meanPool(raw as number[][]);
  }
  if (Array.isArray(raw) && Array.isArray(raw[0]) && Array.isArray(raw[0][0])) {
    return meanPool(raw[0] as number[][]);
  }
  throw new Error("HF devolvió formato inesperado");
}

async function embedHF(text: string): Promise<number[]> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("Falta HF_TOKEN");

  const url =
    "https://router.huggingface.co/hf-inference/models/" +
    "sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });

  const rawText = await resp.text();
  let raw: any = null;
  try {
    raw = rawText ? JSON.parse(rawText) : null;
  } catch {}

  if (!resp.ok) throw new Error(raw?.error ?? rawText ?? "HF error");

  const emb = normalizeHFEmbedding(raw);
  if (emb.length !== 384) throw new Error(`Embedding dim inválida: ${emb.length}`);
  return emb;
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    // usuario logueado desde cookies (en nube esto es lo correcto)
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });
    const user_id = auth.user.id;

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });

    // 1) subir a storage
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const storagePath = `${user_id}/${crypto.randomUUID()}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const up = await supabase.storage.from("documents").upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

    // 2) insertar documento
    const ins = await supabase
      .from("documents")
      .insert({ name: file.name, storage_path: storagePath, uploaded_by: user_id })
      .select("id")
      .single();

    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });

    const document_id = ins.data.id as string;

    // 3) descargar y extraer texto
    const { data: downloaded, error: dlErr } = await supabase.storage.from("documents").download(storagePath);
    if (dlErr || !downloaded) return NextResponse.json({ error: "No se pudo descargar" }, { status: 500 });

    const arrayBuffer = await downloaded.arrayBuffer();
    const realExt = getExt(file.name);
    let text = "";

    if (realExt === "txt") {
      text = new TextDecoder("utf-8").decode(arrayBuffer);
    } else if (realExt === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      text = result.value || "";
    } else if (realExt === "pdf") {
      const mod: any = await import("pdf-extraction");
      const pdfExtract = mod?.default ?? mod;
      const parsed = await pdfExtract(Buffer.from(arrayBuffer));
      text = parsed?.text || "";
    } else {
      return NextResponse.json(
        { error: `Tipo no soportado: .${realExt}. Usa PDF, DOCX o TXT.` },
        { status: 400 }
      );
    }

    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text) return NextResponse.json({ error: "Documento sin texto legible" }, { status: 400 });

    const chunks = chunkText(text);

    // 4) guardar chunks
    await supabase.from("document_chunks").delete().eq("document_id", document_id);

    const rows = chunks.map((content, chunk_index) => ({
      document_id,
      content,
      chunk_index,
    }));

    const { error: chunkErr } = await supabase.from("document_chunks").insert(rows);
    if (chunkErr) return NextResponse.json({ error: chunkErr.message }, { status: 500 });

    // 5) embeddings + update en document_chunks.embedding
    const { data: allChunks, error: readErr } = await supabase
      .from("document_chunks")
      .select("id,content")
      .eq("document_id", document_id)
      .order("chunk_index", { ascending: true });

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    let updated = 0;
    for (const ch of allChunks ?? []) {
      const emb = await embedHF(ch.content);
      const { error: upErr } = await supabase.from("document_chunks").update({ embedding: emb }).eq("id", ch.id);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      updated++;
    }

    return NextResponse.json({
      ok: true,
      document_id,
      storage_path: storagePath,
      chunks: rows.length,
      embedded: updated,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
