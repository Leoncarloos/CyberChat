export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  const supabase = supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: auth.user.id,
      title: "Nuevo chat",
    })
    .select("id,title,created_at,user_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: data });
}
