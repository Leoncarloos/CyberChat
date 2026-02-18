export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  try {
    const supabase = await supabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: auth.user.id, title: "Nuevo chat" })
      .select("id,title,created_at,user_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ conversation: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
