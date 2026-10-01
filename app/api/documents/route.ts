export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type DocumentRow = { id: string; name: string; created_at: string };
type ChunkRow = { document_id: string };

export async function GET() {
  try {
    const auth = await requireAdmin({ forbiddenMessage: "Solo admins", requireRuc: false });
    if (!auth.ok) return auth.response;

    const admin = supabaseAdmin();
    const userId = auth.user.id;

    const { data: docs, error: docsErr } = await admin
      .from("documents")
      .select("id, name, created_at")
      .eq("uploaded_by", userId)
      .order("created_at", { ascending: false });

    if (docsErr) return NextResponse.json({ error: docsErr.message }, { status: 500 });

    const documents = (docs ?? []) as DocumentRow[];
    if (documents.length === 0) {
      return NextResponse.json({ documents: [] });
    }

    const ids = documents.map((d) => d.id);
    const { data: chunkRows, error: chunksErr } = await admin
      .from("document_chunks")
      .select("document_id")
      .in("document_id", ids);

    if (chunksErr) return NextResponse.json({ error: chunksErr.message }, { status: 500 });

    const chunkCounts = new Map<string, number>();
    for (const row of (chunkRows ?? []) as ChunkRow[]) {
      chunkCounts.set(row.document_id, (chunkCounts.get(row.document_id) ?? 0) + 1);
    }

    return NextResponse.json({
      documents: documents.map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: d.created_at,
        chunkCount: chunkCounts.get(d.id) ?? 0,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
