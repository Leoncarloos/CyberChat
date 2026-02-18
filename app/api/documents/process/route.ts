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

export async function POST(req: Request) {
  try {
    const { document_id } = await req.json();
    if (!document_id)
      return NextResponse.json({ error: "document_id requerido" }, { status: 400 });

    const supabase = supabaseServer();

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id,name,storage_path")
      .eq("id", document_id)
      .single();

    if (docErr || !doc)
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });

    const { data: file, error: fileErr } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);

    if (fileErr || !file)
      return NextResponse.json({ error: "No se pudo descargar el archivo" }, { status: 500 });

    const arrayBuffer = await file.arrayBuffer();
    const ext = getExt(doc.name);
    let text = "";

    if (ext === "txt") {
      text = new TextDecoder("utf-8").decode(arrayBuffer);
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      text = result.value || "";
    } else if (ext === "pdf") {
      // ✅ pdf-extraction (Node)
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
    if (!text)
      return NextResponse.json(
        { error: "Documento sin texto legible (puede ser escaneado)" },
        { status: 400 }
      );

    const chunks = chunkText(text);

    await supabase.from("document_chunks").delete().eq("document_id", document_id);

    const rows = chunks.map((content, chunk_index) => ({
      document_id,
      content,
      chunk_index,
    }));

    const { error: insErr } = await supabase.from("document_chunks").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, chunks: rows.length, type: ext });
  } catch (e: any) {
    console.error("ERROR PROCESANDO:", e);
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
