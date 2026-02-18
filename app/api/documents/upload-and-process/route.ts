export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function embedHF(text: string) {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("Falta HF_TOKEN");

  const url =
    "https://router.huggingface.co/hf-inference/models/" +
    "sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    cache: "no-store",
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

function getExt(filename: string) {
  const parts = (filename || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

export async function POST(req: Request) {
  try {
    // 1) user por cookies (anon)
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }
    const userId = auth.user.id;

    // 2) admin client (bypassea RLS)
    const admin = supabaseAdmin();

    // 3) leer archivo
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });

    const ext = getExt(file.name) || "bin";
    const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    // 4) subir a Storage (admin)
    const up = await admin.storage.from("documents").upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

    // 5) insertar documento (admin) -> evita RLS
    const ins = await admin
      .from("documents")
      .insert({
        name: file.name,
        storage_path: storagePath,
        uploaded_by: userId,
      })
      .select("id")
      .single();

    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });

    const document_id = ins.data.id as string;

    // 6) descargar para procesar (admin)
    const { data: dl, error: dlErr } = await admin.storage.from("documents").download(storagePath);
    if (dlErr || !dl) return NextResponse.json({ error: "No se pudo descargar" }, { status: 500 });

    const arrayBuffer = await dl.arrayBuffer();
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
    } else {
      return NextResponse.json(
        { error: `Tipo no soportado: .${ext}. Usa PDF, DOCX o TXT.` },
        { status: 400 }
      );
    }

    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return NextResponse.json(
        { error: "Documento sin texto legible (puede ser escaneado)" },
        { status: 400 }
      );
    }

    // 7) chunks
    const chunks = chunkText(text);

    // limpiar chunks previos (admin)
    await admin.from("document_chunks").delete().eq("document_id", document_id);

    // 8) embeddings + insert chunks con embedding (admin)
    // (puedes batcher luego, pero esto funciona)
    const rows: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const embedding = await embedHF(content);
      rows.push({ document_id, chunk_index: i, content, embedding });
    }

    const { error: chunksErr } = await admin.from("document_chunks").insert(rows);
    if (chunksErr) return NextResponse.json({ error: chunksErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      document_id,
      storage_path: storagePath,
      chunks: rows.length,
      embedded: true,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
