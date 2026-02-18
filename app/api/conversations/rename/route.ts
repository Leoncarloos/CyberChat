export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { conversation_id, title } = await req.json();
    if (!conversation_id || !title) {
      return NextResponse.json({ error: "conversation_id y title requeridos" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { error } = await supabase
      .from("conversations")
      .update({ title })
      .eq("id", conversation_id)
      .eq("user_id", auth.user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
