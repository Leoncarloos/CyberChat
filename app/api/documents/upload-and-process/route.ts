export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedHF } from "@/lib/embedHF";
import { chunkDocument, extractDocumentText, INDEX_VERSION } from "@/lib/ragText";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin({ forbiddenMessage: "Solo admins", requireRuc: false });
    if (!auth.ok) return auth.response;
    const admin = supabaseAdmin();
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file requerido" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "El limite es 10 MB" }, { status: 400 });
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "docx", "txt"].includes(ext)) {
      return NextResponse.json({ error: "Formato no soportado. Usa PDF, DOCX o TXT." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractDocumentText(file.name, buffer);
    if (!text) return NextResponse.json({ error: "Documento sin texto legible" }, { status: 400 });
    const chunks = await chunkDocument(text, file.name);
    if (!chunks.length) return NextResponse.json({ error: "Documento sin fragmentos aprovechables" }, { status: 400 });
    const embeddings: number[][] = [];
    for (const chunk of chunks) embeddings.push(await embedHF(chunk));
    const storagePath = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
    const uploaded = await admin.storage.from("documents").upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream", upsert: false,
    });
    if (uploaded.error) throw new Error(uploaded.error.message);
    const inserted = await admin.from("documents").insert({
      name: file.name, storage_path: storagePath, uploaded_by: auth.user.id,
    }).select("id").single();
    if (inserted.error) {
      await admin.storage.from("documents").remove([storagePath]);
      throw new Error(inserted.error.message);
    }
    const documentId = inserted.data.id;
    const saved = await admin.from("document_chunks").insert(chunks.map((content, i) => ({
      document_id: documentId, chunk_index: i, content, embedding: embeddings[i],
    })));
    if (saved.error) {
      await admin.from("documents").delete().eq("id", documentId);
      await admin.storage.from("documents").remove([storagePath]);
      throw new Error(saved.error.message);
    }
    return NextResponse.json({ ok: true, document_id: documentId, storage_path: storagePath,
      chunks: chunks.length, embedded: true, indexVersion: INDEX_VERSION });
  } catch (error) {
    console.error("[/api/documents/upload]", error);
    return NextResponse.json({ error: "No se pudo procesar el documento. Revisa los registros del servidor." }, { status: 500 });
  }
}
