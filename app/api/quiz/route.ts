export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { quizBodySchema } from "@/lib/validators/evaluation";
import { flattenFieldErrors } from "@/lib/validators/shared";
import { diagnosticTopics } from "@/lib/diagnosticTopics";
import { QUESTIONS_PER_TOPIC, TOTAL_QUESTIONS } from "@/lib/evaluationConfig";

type BankRow = {
  id: string;
  topic_key: string;
  correct_index: number;
  explanation: string;
};

export async function POST(req: Request) {
  const auth = await requireActiveUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  // Igual que GET /api/posttest: sin diagnóstico no hay línea base contra la cual
  // medir la mejora, así que tampoco se acepta un resultado de evaluación.
  if (!auth.claims.diagnosticDone) {
    return NextResponse.json({ error: "Completa el diagnóstico primero" }, { status: 403 });
  }

  const rawBody = await req.json();
  const parsed = quizBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", fieldErrors: flattenFieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  const { answers, testType: requestedType } = parsed.data;
  const questionIds = answers.map((a) => a.questionId);

  if (new Set(questionIds).size !== questionIds.length) {
    return NextResponse.json(
      { error: "Hay respuestas repetidas para la misma pregunta" },
      { status: 400 }
    );
  }

  // Sin este control, enviar una sola respuesta correcta daría 1/1 = 100%.
  if (answers.length !== TOTAL_QUESTIONS) {
    return NextResponse.json(
      { error: `La evaluación debe tener ${TOTAL_QUESTIONS} respuestas` },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();

  const { data: bankRows, error: bankErr } = await admin
    .from("posttest_questions")
    .select("id, topic_key, correct_index, explanation")
    .in("id", questionIds)
    .eq("active", true);

  if (bankErr) {
    return NextResponse.json({ error: bankErr.message }, { status: 500 });
  }

  const bank = new Map(((bankRows ?? []) as BankRow[]).map((r) => [r.id, r]));
  if (bank.size !== answers.length) {
    return NextResponse.json(
      { error: "Alguna pregunta enviada no existe o ya no está activa" },
      { status: 400 }
    );
  }

  // La evaluación servida es de 2 preguntas por cada uno de los 8 temas; exigir esa
  // composición evita armar un intento a medida con las preguntas más fáciles.
  const perTopic = new Map<string, number>();
  for (const row of bank.values()) {
    perTopic.set(row.topic_key, (perTopic.get(row.topic_key) ?? 0) + 1);
  }
  const composicionValida =
    perTopic.size === diagnosticTopics.length &&
    diagnosticTopics.every((t) => perTopic.get(t.key) === QUESTIONS_PER_TOPIC);

  if (!composicionValida) {
    return NextResponse.json(
      { error: `La evaluación debe cubrir los ${diagnosticTopics.length} temas con ${QUESTIONS_PER_TOPIC} preguntas cada uno` },
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
    const row = bank.get(answer.questionId)!;
    const isCorrect = answer.selectedIndex === row.correct_index;
    if (isCorrect) score++;

    if (!topicsPerformance[row.topic_key]) {
      topicsPerformance[row.topic_key] = { correct: 0, total: 0 };
    }
    topicsPerformance[row.topic_key].total++;
    if (isCorrect) topicsPerformance[row.topic_key].correct++;

    results.push({
      questionId: answer.questionId,
      selectedIndex: answer.selectedIndex,
      correctIndex: row.correct_index,
      isCorrect,
      explanation: row.explanation,
    });
  }

  const total = answers.length;
  const takenAt = new Date().toISOString();

  // El tipo no se toma del cliente sin verificar: si ya hay intentos previos es
  // recurrente, y si no, es el post-test inicial.
  const { count: priorAttempts } = await admin
    .from("evaluation_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const testType = (priorAttempts ?? 0) > 0 ? "recurrente" : "posttest";
  if (requestedType && requestedType !== testType) {
    console.warn(
      `[/api/quiz] el cliente declaró testType="${requestedType}" pero corresponde "${testType}"`
    );
  }

  const { error: insertErr } = await admin.from("quiz_results").insert({
    user_id: user.id,
    score,
    total,
    taken_at: takenAt,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error: attemptErr } = await admin.from("evaluation_attempts").insert({
    user_id: user.id,
    test_type: testType,
    score,
    total,
    topics_performance: topicsPerformance,
    taken_at: takenAt,
  });

  if (attemptErr) {
    return NextResponse.json({ error: attemptErr.message }, { status: 500 });
  }

  await admin.from("seen_questions").upsert(
    questionIds.map((qid) => ({
      user_id: user.id,
      question_id: qid,
      seen_at: takenAt,
    })),
    { onConflict: "user_id,question_id" }
  );

  return NextResponse.json({
    ok: true,
    score,
    total,
    testType,
    topicsPerformance,
    results,
  });
}
