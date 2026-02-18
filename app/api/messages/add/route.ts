export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { conversation_id, role, content } = await req.json();

  if (!conversation_id || !role || !content) {
    return NextResponse.json({ error: "conversation_id, role, content requeridos" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  // validar que la conversación es del usuario
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
    .insert({ conversation_id, role, content })
    .select("id,role,content,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}
