export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { conversation_id, title } = await req.json();

  if (!conversation_id || !title) {
    return NextResponse.json({ error: "conversation_id y title requeridos" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  // validar dueño
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id,user_id")
    .eq("id", conversation_id)
    .single();

  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  if (!conv || conv.user_id !== auth.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { error } = await supabase.from("conversations").update({ title }).eq("id", conversation_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
