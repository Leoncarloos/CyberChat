export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const supabase = supabaseServer();

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const user_id = String(form.get("user_id") ?? "");

  if (!file) return NextResponse.json({ error: "file requerido" }, { status: 400 });
  if (!user_id) return NextResponse.json({ error: "user_id requerido" }, { status: 400 });

  // 1) subir a storage
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const storagePath = `${user_id}/${crypto.randomUUID()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());

  const up = await supabase.storage.from("documents").upload(storagePath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  // 2) insertar en tabla documents
  const ins = await supabase
    .from("documents")
    .insert({
      name: file.name,
      storage_path: storagePath,
      uploaded_by: user_id,
    })
    .select("id")
    .single();

  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });

  const document_id = ins.data.id as string;

  // 3) procesar + 4) embeddings (llama endpoints internos)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  const p1 = await fetch(`${baseUrl}/api/documents/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id }),
  });

  const t1 = await p1.text();
  if (!p1.ok) return NextResponse.json({ error: "process fallo", details: t1 }, { status: 500 });

  const p2 = await fetch(`${baseUrl}/api/documents/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id }),
  });

  const t2 = await p2.text();
  if (!p2.ok) return NextResponse.json({ error: "embed fallo", details: t2 }, { status: 500 });

  // devuelve ok
  return NextResponse.json({
    ok: true,
    document_id,
    uploaded: true,
    processed: true,
    embedded: true,
  });
}
