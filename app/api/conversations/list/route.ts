export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
    if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,created_at,user_id")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ conversations: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
