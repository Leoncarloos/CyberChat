export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type QuizBody = {
  score: number;
  total: number;
};

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "No auth" }, { status: 401 });
  }

  const body = (await req.json()) as QuizBody;

  if (typeof body.score !== "number" || typeof body.total !== "number" || body.total === 0) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const { error: insertErr } = await supabaseAdmin()
    .from("quiz_results")
    .insert({
      user_id: user.id,
      score: body.score,
      total: body.total,
      taken_at: new Date().toISOString(),
    });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
