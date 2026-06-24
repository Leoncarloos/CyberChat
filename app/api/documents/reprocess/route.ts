export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedHF } from "@/lib/embedHF";

type DocumentRow = { id: string; storage_path: string; name: string };
type ChunkRow = { id: string; document_id: string; content: string; chunk_index: number };

export async function POST() {
  try {
    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }
    if (auth.user.user_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Solo admins" }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const userId = auth.user.id;

    const { data: docs, error: docsErr } = await admin
      .from("documents")
      .select("id, storage_path, name")
      .eq("uploaded_by", userId);

    if (docsErr) return NextResponse.json({ error: docsErr.message }, { status: 500 });

    const documents = (docs ?? []) as DocumentRow[];
    if (documents.length === 0) {
      return NextResponse.json({ ok: true, reprocessed: 0, totalChunks: 0 });
    }

    let totalChunks = 0;

    for (const doc of documents) {
      const { data: existingChunks, error: chunksReadErr } = await admin
        .from("document_chunks")
        .select("id, document_id, content, chunk_index")
        .eq("document_id", doc.id)
        .order("chunk_index", { ascending: true });

      if (chunksReadErr) continue;

      const chunks = (existingChunks ?? []) as ChunkRow[];
      if (chunks.length === 0) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [];
      for (const chunk of chunks) {
        const embedding = await embedHF(chunk.content);
        rows.push({
          document_id: chunk.document_id,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          embedding,
        });
      }

      await admin.from("document_chunks").delete().eq("document_id", doc.id);
      const { error: insertErr } = await admin.from("document_chunks").insert(rows);
      if (insertErr) {
        return NextResponse.json(
          { error: `Error al re-procesar "${doc.name}": ${insertErr.message}` },
          { status: 500 }
        );
      }

      totalChunks += rows.length;
    }

    return NextResponse.json({
      ok: true,
      reprocessed: documents.length,
      totalChunks,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
