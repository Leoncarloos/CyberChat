export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { conversation_id } = await req.json();
    if (!conversation_id) return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    // (Opcional) validar que la conversación sea del usuario:
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversation_id)
      .eq("user_id", auth.user.id)
      .single();

    if (!conv) return NextResponse.json({ error: "No permitido" }, { status: 403 });

    const { data, error } = await supabase
      .from("messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
