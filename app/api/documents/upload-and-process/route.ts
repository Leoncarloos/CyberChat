export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedHF } from "@/lib/embedHF";

// Sentence-aware chunking — no corta oraciones a la mitad.
function chunkBySentences(text: string, maxChars = 800, overlapSentences = 1): string[] {
  const sentences = text
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const sentence of sentences) {
    if (currentLen + sentence.length > maxChars && current.length > 0) {
      chunks.push(current.join(" "));
      current = current.slice(-overlapSentences);
      currentLen = current.reduce((n, s) => n + s.length + 1, 0);
    }
    current.push(sentence);
    currentLen += sentence.length + 1;
  }

  if (current.length > 0) chunks.push(current.join(" "));

  return chunks.filter((c) => c.trim().length > 40);
}

function getExt(filename: string) {
  const parts = (filename || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // HU23-4 — 10 MB

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }
    const userId = auth.user.id;

    const admin = supabaseAdmin();

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return NextResponse.json(
        { error: `Archivo demasiado grande (${sizeMb} MB). El límite es 10 MB.` },
        { status: 400 }
      );
    }

    const ext = getExt(file.name) || "bin";
    const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const up = await admin.storage.from("documents").upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

    const ins = await admin
      .from("documents")
      .insert({ name: file.name, storage_path: storagePath, uploaded_by: userId })
      .select("id")
      .single();
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });

    const document_id = ins.data.id as string;

    const { data: dl, error: dlErr } = await admin.storage
      .from("documents")
      .download(storagePath);
    if (dlErr || !dl) {
      return NextResponse.json({ error: "No se pudo descargar el archivo" }, { status: 500 });
    }

    const arrayBuffer = await dl.arrayBuffer();
    let text = "";

    if (ext === "txt") {
      text = new TextDecoder("utf-8").decode(arrayBuffer);
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      text = result.value || "";
    } else if (ext === "pdf") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("pdf-extraction");
      const pdfExtract = mod?.default ?? mod;
      const parsed = await pdfExtract(Buffer.from(arrayBuffer));
      text = parsed?.text || "";
    } else {
      return NextResponse.json(
        { error: `Formato no soportado: .${ext}. Usa PDF, DOCX o TXT.` },
        { status: 400 }
      );
    }

    text = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: "Documento sin texto legible (puede ser una imagen escaneada)" },
        { status: 400 }
      );
    }

    const chunks = chunkBySentences(text);

    await admin.from("document_chunks").delete().eq("document_id", document_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
