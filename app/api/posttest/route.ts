export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { diagnosticTopics } from "@/lib/diagnosticQuestions";

const QUESTIONS_PER_TOPIC = 2;

type BankRow = {
  id: string;
  topic_key: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const meta = user.user_metadata ?? {};
    if (!meta.diagnostic_done) {
      return NextResponse.json({ error: "Completa el diagnóstico primero" }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const topicKeys = diagnosticTopics.map((t) => t.key);

    const [bankRes, seenRes, attemptsRes] = await Promise.all([
      admin
        .from("posttest_questions")
        .select("id, topic_key, question, options, correct_index, explanation")
        .eq("active", true)
        .in("topic_key", topicKeys),
      admin
        .from("seen_questions")
        .select("question_id, seen_at")
        .eq("user_id", user.id),
      admin
        .from("evaluation_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

    if (bankRes.error) throw bankRes.error;

    const bank = (bankRes.data ?? []) as BankRow[];
    const seenAt = new Map<string, string>(
      ((seenRes.data ?? []) as { question_id: string; seen_at: string }[]).map((s) => [
        s.question_id,
        s.seen_at,
      ])
    );

    const hasPriorAttempt = (attemptsRes.count ?? 0) > 0;
    const testType = hasPriorAttempt ? "recurrente" : "posttest";

    const questions: {
      id: string;
      topicKey: string;
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }[] = [];

    for (const topicKey of topicKeys) {
      const pool = bank.filter((q) => q.topic_key === topicKey);
      if (pool.length < QUESTIONS_PER_TOPIC) {
        return NextResponse.json(
          { error: "Banco de preguntas incompleto para algún tema" },
          { status: 500 }
        );
      }

      const unseen = shuffle(pool.filter((q) => !seenAt.has(q.id)));
      let selected = unseen.slice(0, QUESTIONS_PER_TOPIC);

      // Reinicio de ciclo por tema: si no hay suficientes sin ver,
      // completa con las vistas más antiguas.
      if (selected.length < QUESTIONS_PER_TOPIC) {
        const seenSorted = pool
          .filter((q) => seenAt.has(q.id))
          .sort((a, b) => (seenAt.get(a.id)! < seenAt.get(b.id)! ? -1 : 1));
        selected = [
          ...selected,
          ...seenSorted.slice(0, QUESTIONS_PER_TOPIC - selected.length),
        ];
      }

      for (const q of selected) {
        questions.push({
          id: q.id,
          topicKey: q.topic_key,
          question: q.question,
          options: q.options,
          correctIndex: q.correct_index,
          explanation: q.explanation,
        });
      }
    }

    return NextResponse.json({ questions: shuffle(questions), testType });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
