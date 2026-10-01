export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
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
const SUPPORTED_EXTS = ["pdf", "docx", "txt"] as const;

async function extractText(ext: string, buffer: Buffer): Promise<string> {
  if (ext === "txt") return new TextDecoder("utf-8").decode(buffer);

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("pdf-extraction");
  const pdfExtract = mod?.default ?? mod;
  const parsed = await pdfExtract(buffer);
  return parsed?.text || "";
}

export async function POST(req: Request) {
  try {
    // La base documental es de la empresa y la consultan todos sus empleados
    // (ver lib/orgAdmin.ts), así que solo el dueño puede alimentarla.
    const auth = await requireAdmin({ forbiddenMessage: "Solo admins", requireRuc: false });
    if (!auth.ok) return auth.response;
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
    if (!(SUPPORTED_EXTS as readonly string[]).includes(ext)) {
      return NextResponse.json(
        { error: `Formato no soportado: .${ext}. Usa PDF, DOCX o TXT.` },
        { status: 400 }
      );
    }

    // Todo lo que puede fallar ocurre antes de escribir: un rechazo no debe dejar
    // el archivo en Storage ni una fila en documents con 0 chunks (HU23-2/HU23-3).
    const buffer = Buffer.from(await file.arrayBuffer());

    const text = String(await extractText(ext, buffer))
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
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "El documento no tiene suficiente texto aprovechable para indexarlo" },
        { status: 400 }
      );
    }

    const embeddings: number[][] = [];
    for (const content of chunks) {
      embeddings.push(await embedHF(content));
    }

    const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
    const up = await admin.storage.from("documents").upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

    const ins = await admin
      .from("documents")
      .insert({ name: file.name, storage_path: storagePath, uploaded_by: userId })
      .select("id")
      .single();
    if (ins.error) {
      await admin.storage.from("documents").remove([storagePath]);
      return NextResponse.json({ error: ins.error.message }, { status: 500 });
    }

    const document_id = ins.data.id as string;

    const { error: chunksErr } = await admin.from("document_chunks").insert(
      chunks.map((content, i) => ({
        document_id,
        chunk_index: i,
        content,
        embedding: embeddings[i],
      }))
    );

    if (chunksErr) {
      // Sin chunks el documento no aporta nada al RAG: se revierte entero.
      await admin.from("documents").delete().eq("id", document_id);
      await admin.storage.from("documents").remove([storagePath]);
      return NextResponse.json({ error: chunksErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      document_id,
      storage_path: storagePath,
      chunks: chunks.length,
      embedded: true,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
