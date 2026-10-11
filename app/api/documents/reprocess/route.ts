export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedHF } from "@/lib/embedHF";
import { chunkDocument, extractDocumentText, INDEX_VERSION } from "@/lib/ragText";

export async function POST() {
  try {
    const auth = await requireAdmin({ forbiddenMessage: "Solo admins", requireRuc: false });
    if (!auth.ok) return auth.response;
    const admin = supabaseAdmin();
    // Check schema before spending embedding quota; never delete from the client.
    const ready = await admin.from("rag_index_backups").select("id").limit(0);
    if (ready.error) return NextResponse.json({ error: "Ejecuta docs/sql/rag_hybrid_v2.sql antes de reindexar. No se modificaron los documentos." }, { status: 409 });
    const { data: docs, error } = await admin.from("documents").select("id,name,storage_path")
      .eq("uploaded_by", auth.user.id);
    if (error) throw new Error(error.message);
    let totalChunks = 0;
    let reprocessed = 0;
    const failures: { documentId: string; name: string }[] = [];
    for (const doc of docs ?? []) {
      try {
        const downloaded = await admin.storage.from("documents").download(doc.storage_path);
        if (downloaded.error || !downloaded.data) throw new Error("No se pudo leer el archivo original");
        const text = await extractDocumentText(doc.name, Buffer.from(await downloaded.data.arrayBuffer()));
        const chunks = await chunkDocument(text, doc.name);
        if (!chunks.length) throw new Error("Sin fragmentos");
        const rows = [];
        for (const [index, content] of chunks.entries()) {
          rows.push({ chunk_index: index, content, embedding: await embedHF(content) });
        }
        // Backup + replacement run in a single transaction per document.
        const replaced = await admin.rpc("replace_document_chunks_v2", {
          target_document_id: doc.id, owner_id: auth.user.id,
          index_version: INDEX_VERSION, new_chunks: rows,
        });
        if (replaced.error) throw new Error(replaced.error.message);
        reprocessed++; totalChunks += rows.length;
      } catch (error) {
        console.error("[/api/documents/reprocess]", doc.id, error);
        failures.push({ documentId: doc.id, name: doc.name });
      }
    }
    return NextResponse.json({ ok: failures.length === 0, reprocessed, totalChunks,
      failures, indexVersion: INDEX_VERSION }, { status: failures.length ? 207 : 200 });
  } catch (error) {
    console.error("[/api/documents/reprocess]", error);
    return NextResponse.json({ error: "No se pudo reindexar. Los cambios son atomicos por documento." }, { status: 500 });
  }
}
