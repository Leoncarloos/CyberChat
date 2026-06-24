export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type DiagnosticBody = {
  score: number;
  total: number;
  topicsPerformance: Record<string, { correct: number; total: number }>;
};

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "No auth" }, { status: 401 });
  }

  return NextResponse.json({
    completed: user.user_metadata?.diagnostic_done === true,
  });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "No auth" }, { status: 401 });
  }

  const body = (await req.json()) as DiagnosticBody;

  if (
    typeof body.score !== "number" ||
    typeof body.total !== "number" ||
    typeof body.topicsPerformance !== "object"
  ) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { error: insertErr } = await admin.from("diagnostic_results").insert({
    user_id: user.id,
    score: body.score,
    total: body.total,
    topics_performance: body.topicsPerformance,
    completed_at: new Date().toISOString(),
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, diagnostic_done: true },
  });

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
