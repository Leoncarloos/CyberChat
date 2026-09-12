export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }
    if (auth.user.user_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Solo admins" }, { status: 403 });
    }

    const admin = supabaseAdmin();

    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("id, storage_path, uploaded_by")
      .eq("id", id)
      .single();

    if (docErr || !doc) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }
    if (doc.uploaded_by !== auth.user.id) {
      return NextResponse.json({ error: "No permitido" }, { status: 403 });
    }

    const { error: storageErr } = await admin.storage
      .from("documents")
      .remove([doc.storage_path]);
    if (storageErr) {
      return NextResponse.json({ error: storageErr.message }, { status: 500 });
    }

    // document_chunks tiene ON DELETE CASCADE sobre document_id — se limpian solos.
    const { error: deleteErr } = await admin.from("documents").delete().eq("id", id);
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
