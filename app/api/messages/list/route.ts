export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { conversation_id } = await req.json();
  if (!conversation_id) {
    return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  // seguridad: verificar que la conversación es del usuario
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id,user_id")
    .eq("id", conversation_id)
    .single();

  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  if (!conv || conv.user_id !== auth.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}
