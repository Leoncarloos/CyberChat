export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { diagnosticBodySchema } from "@/lib/validators/evaluation";
import { flattenFieldErrors } from "@/lib/validators/shared";
import { diagnosticBank, type DiagnosticQuestion } from "@/lib/diagnosticBank";
import { totalQuestions } from "@/lib/diagnosticTopics";

type Entry = { topicKey: string; question: DiagnosticQuestion };

const BANK = new Map<string, Entry>(
  diagnosticBank.flatMap((topic) =>
    topic.questions.map((q) => [q.id, { topicKey: topic.key, question: q }] as const)
  )
);

export async function GET() {
  const auth = await requireActiveUser();
  if (!auth.ok) return auth.response;

  return NextResponse.json({ completed: auth.claims.diagnosticDone });
}

export async function POST(req: Request) {
  const auth = await requireActiveUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  // El diagnóstico se rinde una sola vez (HU12-1). Sin esto, un empleado podría
  // repetirlo respondiendo mal a propósito para inflar su porcentaje de mejora.
  if (auth.claims.diagnosticDone) {
    return NextResponse.json(
      { error: "Ya completaste el diagnóstico inicial" },
      { status: 409 }
    );
  }

  const rawBody = await req.json();
  const parsed = diagnosticBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", fieldErrors: flattenFieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  const { answers } = parsed.data;
  const ids = answers.map((a) => a.questionId);

  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { error: "Hay respuestas repetidas para la misma pregunta" },
      { status: 400 }
    );
  }

  // El diagnóstico es un banco fijo y completo: se exige el set exacto de preguntas,
  // así no se puede puntuar sobre un subconjunto favorable.
  if (answers.length !== totalQuestions || ids.some((id) => !BANK.has(id))) {
    return NextResponse.json(
      { error: `Debes responder las ${totalQuestions} preguntas del diagnóstico` },
      { status: 400 }
    );
  }

  const topicsPerformance: Record<string, { correct: number; total: number }> = {};
  const results: {
    questionId: string;
    selectedIndex: number;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }[] = [];
  let score = 0;

  for (const answer of answers) {
    const { topicKey, question } = BANK.get(answer.questionId)!;
    const isCorrect = answer.selectedIndex === question.correctIndex;
    if (isCorrect) score++;

    if (!topicsPerformance[topicKey]) {
      topicsPerformance[topicKey] = { correct: 0, total: 0 };
    }
    topicsPerformance[topicKey].total++;
    if (isCorrect) topicsPerformance[topicKey].correct++;

    results.push({
      questionId: answer.questionId,
      selectedIndex: answer.selectedIndex,
      correctIndex: question.correctIndex,
      isCorrect,
      explanation: question.explanation,
    });
  }

  const admin = supabaseAdmin();

  const { error: insertErr } = await admin.from("diagnostic_results").insert({
    user_id: user.id,
    score,
    total: totalQuestions,
    topics_performance: topicsPerformance,
    completed_at: new Date().toISOString(),
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, diagnostic_done: true },
  });

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    score,
    total: totalQuestions,
    topicsPerformance,
    results,
  });
}
