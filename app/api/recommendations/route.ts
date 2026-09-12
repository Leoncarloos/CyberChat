export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { diagnosticTopics } from "@/lib/diagnosticQuestions";
import { embedHF } from "@/lib/embedHF";

type TopicPerf = { correct: number; total: number };

function pct(s: number, t: number) {
  return t > 0 ? Math.round((s / t) * 100) : 0;
}

export type RecommendationCard = {
  topicKey: string;
  topicLabel: string;
  title: string;
  summary: string;
  priority: "Alto" | "Medio" | "Bajo";
  suggestedPrompt: string;
};

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const meta = user.user_metadata ?? {};
    const userRuc: string = meta.ruc ?? "";

    const admin = supabaseAdmin();

    // Latest diagnostic
    const { data: diagRows } = await admin
      .from("diagnostic_results")
      .select("score, total, topics_performance, completed_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false })
      .limit(1);

    if (!diagRows || diagRows.length === 0) {
      return NextResponse.json({ recommendations: [], reason: "no_diagnostic" });
    }

    const diag = diagRows[0] as {
      score: number;
      total: number;
      topics_performance: Record<string, TopicPerf>;
    };
    const topicsPerf = diag.topics_performance ?? {};

    // Weakest 4 topics sorted ascending by pct
    const sortedTopics = diagnosticTopics
      .map((t) => {
        const perf = topicsPerf[t.key];
        const p = perf ? pct(perf.correct, perf.total) : 0;
        return { ...t, pct: p };
      })
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 4);

    // Find admin of same RUC
    let adminUserId: string | null = null;
    if (userRuc) {
      const { data: usersData } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const adminUser = (usersData?.users ?? []).find((u) => {
        const m = u.user_metadata ?? {};
        return m.role === "admin" && m.ruc === userRuc;
      });
      adminUserId = adminUser?.id ?? null;
    }

    // RAG per topic
    type TopicContext = { key: string; label: string; pct: number; context: string };
    const topicContexts: TopicContext[] = await Promise.all(
      sortedTopics.map(async (t) => {
        let context = "";
        if (adminUserId) {
          try {
            const embedding = await embedHF(`${t.label} ciberseguridad MYPE`);
            const { data: chunks } = await admin.rpc("match_document_chunks_scoped", {
              query_embedding: embedding,
              match_count: 3,
              filter_user_id: adminUserId,
              filter_document_id: null,
            });
            if (chunks && chunks.length > 0) {
              context = (chunks as { content: string }[])
                .map((c) => c.content)
                .join("\n\n");
            }
          } catch {}
        }
        return { key: t.key, label: t.label, pct: t.pct, context };
      })
    );

    // Build Groq prompt
    const topicsBlock = topicContexts
      .map(
        (t, i) =>
          `## Tema ${i + 1}: ${t.label} (dominio actual: ${t.pct}%)\n` +
          (t.context
            ? `Contexto de documentos de la empresa:\n${t.context}`
            : "Sin documentos empresariales — usar conocimiento general de ciberseguridad para MYPES peruanas.")
      )
      .join("\n\n---\n\n");

    const prompt = `Eres un asistente de capacitación en ciberseguridad para MYPES peruanas.
Genera recomendaciones de aprendizaje personalizadas para un empleado con los siguientes temas de menor desempeño:

${topicsBlock}

Responde ÚNICAMENTE con un JSON válido sin bloques de código markdown:
{
  "recommendations": [
    {
      "topicKey": "clave exacta del tema",
      "topicLabel": "nombre del tema",
      "title": "título corto y motivador (máx 10 palabras)",
      "summary": "qué debe aprender y por qué es importante para su empresa (2-3 oraciones directas)",
      "priority": "Alto",
      "suggestedPrompt": "pregunta específica para el chatbot (máx 15 palabras)"
    }
  ]
}

Regla de prioridad: dominio < 50% → "Alto", 50-74% → "Medio", 75%+ → "Bajo".
Los temas ya están ordenados del más débil al más fuerte. Genera una recomendación por tema.`;

    const groqKey = process.env.GROQ_API_KEY ?? "";
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.25,
        max_tokens: 900,
      }),
    });
    const groqJson = (await groqRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const raw = groqJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: { recommendations: RecommendationCard[] } = { recommendations: [] };
    try {
      const clean = raw
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(clean) as { recommendations: RecommendationCard[] };
    } catch {
      return NextResponse.json({ recommendations: [], reason: "parse_error" });
    }

    return NextResponse.json({ recommendations: parsed.recommendations ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
