export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { diagnosticTopics } from "@/lib/diagnosticQuestions";

type TopicPerformance = Record<string, { correct: number; total: number }>;

const TOPIC_LABELS: Record<string, string> = Object.fromEntries(
  diagnosticTopics.map((t) => [t.key, t.label])
);

type DiagnosticRow = {
  score: number;
  total: number;
  topics_performance: TopicPerformance;
  completed_at: string;
};

type QuizRow = {
  score: number;
  total: number;
  taken_at: string;
};

type AttemptRow = {
  test_type: "posttest" | "recurrente";
  score: number;
  total: number;
  topics_performance: TopicPerformance;
  taken_at: string;
};

const RECURRENCE_DAYS = 5;

type MessageRow = { created_at: string };
type ConversationRow = { id: string };

function riskLevel(pct: number): "low" | "medium" | "high" {
  if (pct >= 75) return "low";
  if (pct >= 50) return "medium";
  return "high";
}

async function generateRecommendations(
  weakTopics: string[],
  strongTopics: string[],
  groqKey: string
): Promise<string[]> {
  if (!groqKey) return [];

  const prompt =
    weakTopics.length > 0
      ? `Eres un experto en ciberseguridad para MYPES peruanas. El empleado tiene debilidades en: ${weakTopics.join(", ")}. Sus fortalezas son: ${strongTopics.join(", ") || "ninguna aún"}. Da exactamente 3 recomendaciones específicas y accionables en español. Devuelve solo las 3 recomendaciones, una por línea, sin numeración ni viñetas, máximo 2 oraciones cada una.`
      : `El empleado tiene dominio completo en ciberseguridad para MYPES. Da 3 consejos avanzados para mantener y profundizar ese nivel. Una recomendación por línea, sin numeración, máximo 2 oraciones.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        temperature: 0.4,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }

    const admin = supabaseAdmin();
    const userId = user.id;

    const [diagRes, quizHistoryRes, attemptsRes, convsRes] = await Promise.all([
      admin
        .from("diagnostic_results")
        .select("score, total, topics_performance, completed_at")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("quiz_results")
        .select("score, total, taken_at")
        .eq("user_id", userId)
        .order("taken_at", { ascending: false }),
      admin
        .from("evaluation_attempts")
        .select("test_type, score, total, topics_performance, taken_at")
        .eq("user_id", userId)
        .order("taken_at", { ascending: false }),
      admin
        .from("conversations")
        .select("id")
        .eq("user_id", userId),
    ]);

    const diagnostic = diagRes.data as DiagnosticRow | null;
    const quizHistory = (quizHistoryRes.data ?? []) as QuizRow[];
    const attempts = (attemptsRes.data ?? []) as AttemptRow[];
    const quiz = quizHistory[0] ?? null;
    const conversations = (convsRes.data ?? []) as ConversationRow[];
    const convIds = conversations.map((c) => c.id);

    let totalQueries = 0;
    let lastInteraction: string | null = null;

    if (convIds.length > 0) {
      const [countRes, lastRes] = await Promise.all([
        admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convIds)
          .eq("role", "user"),
        admin
          .from("messages")
          .select("created_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      totalQueries = countRes.count ?? 0;
      lastInteraction = (lastRes.data as MessageRow | null)?.created_at ?? null;
    }

    const diagnosticPct = diagnostic
      ? Math.round((diagnostic.score / diagnostic.total) * 100)
      : null;

    const postTestPct = quiz
      ? Math.round((quiz.score / quiz.total) * 100)
      : null;

    const improvement =
      diagnosticPct !== null && postTestPct !== null
        ? postTestPct - diagnosticPct
        : null;

    const currentPct = postTestPct ?? diagnosticPct ?? 0;
    const risk = riskLevel(currentPct);

    const topicsPerformance = (diagnostic?.topics_performance ?? {}) as TopicPerformance;

    // Áreas críticas: evaluación más reciente con detalle por tema (HU22),
    // con fallback al diagnóstico inicial.
    const latestWithTopics = attempts.find(
      (a) => Object.keys(a.topics_performance ?? {}).length > 0
    );
    const currentTopicsPerformance = latestWithTopics?.topics_performance ?? topicsPerformance;

    const strongTopics = Object.entries(currentTopicsPerformance)
      .filter(([, v]) => v.correct === v.total)
      .map(([k]) => TOPIC_LABELS[k] ?? k);

    const weakTopics = Object.entries(currentTopicsPerformance)
      .filter(([, v]) => v.correct < v.total)
      .map(([k]) => TOPIC_LABELS[k] ?? k);

    const lastEvalAt = attempts[0]?.taken_at ?? quiz?.taken_at ?? null;
    const nextEvaluation = lastEvalAt
      ? {
          lastCompletedAt: lastEvalAt,
          nextDueAt: new Date(
            new Date(lastEvalAt).getTime() + RECURRENCE_DAYS * 86400000
          ).toISOString(),
          due:
            Date.now() - new Date(lastEvalAt).getTime() >=
            RECURRENCE_DAYS * 86400000,
        }
      : null;

    const groqKey = process.env.GROQ_API_KEY ?? "";
    const recommendations = await generateRecommendations(weakTopics, strongTopics, groqKey);

    return NextResponse.json({
      diagnostic: diagnostic
        ? {
            score: diagnostic.score,
            total: diagnostic.total,
            pct: diagnosticPct,
            topicsPerformance,
            completedAt: diagnostic.completed_at,
          }
        : null,
      postTest: quiz
        ? {
            score: quiz.score,
            total: quiz.total,
            pct: postTestPct,
            takenAt: quiz.taken_at,
          }
        : null,
      postTestHistory: quizHistory.map((q) => {
        const attempt = attempts.find((a) => a.taken_at === q.taken_at);
        return {
          score: q.score,
          total: q.total,
          pct: Math.round((q.score / q.total) * 100),
          takenAt: q.taken_at,
          testType: attempt?.test_type ?? "posttest",
        };
      }),
      currentTopicsPerformance,
      nextEvaluation,
      improvement,
      riskLevel: risk,
      chatbotUsage: {
        totalQueries,
        lastInteraction,
      },
      strongTopics,
      weakTopics,
      recommendations,
      topicLabels: TOPIC_LABELS,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
