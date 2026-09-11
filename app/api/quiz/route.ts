export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { quizBodySchema } from "@/lib/validators/evaluation";
import { flattenFieldErrors } from "@/lib/validators/shared";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "No auth" }, { status: 401 });
  }

  const rawBody = await req.json();
  const parsed = quizBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", fieldErrors: flattenFieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const admin = supabaseAdmin();
  const takenAt = new Date().toISOString();
  const testType = body.testType === "recurrente" ? "recurrente" : "posttest";

  const { error: insertErr } = await admin.from("quiz_results").insert({
    user_id: user.id,
    score: body.score,
    total: body.total,
    taken_at: takenAt,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error: attemptErr } = await admin.from("evaluation_attempts").insert({
    user_id: user.id,
    test_type: testType,
    score: body.score,
    total: body.total,
    topics_performance: body.topicsPerformance ?? {},
    taken_at: takenAt,
  });

  if (attemptErr) {
    return NextResponse.json({ error: attemptErr.message }, { status: 500 });
  }

  const questionIds = (body.questionIds ?? []).filter(
    (id) => typeof id === "string" && id.length > 0
  );
  if (questionIds.length > 0) {
    await admin.from("seen_questions").upsert(
      questionIds.map((qid) => ({
        user_id: user.id,
        question_id: qid,
        seen_at: takenAt,
      })),
      { onConflict: "user_id,question_id" }
    );
  }

  return NextResponse.json({ ok: true });
}
