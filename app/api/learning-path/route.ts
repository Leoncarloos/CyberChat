export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  learningTopics,
  learningTopicByKey,
  levelFromPct,
  type KnowledgeLevel,
  type ProgressStatus,
} from "@/lib/learningPath";

type TopicPerformance = Record<string, { correct: number; total: number }>;

type DiagnosticRow = { topics_performance: TopicPerformance };
type ProgressRow = { topic_key: string; status: ProgressStatus };

type TopicNode = {
  key: string;
  label: string;
  icon: string;
  starterPrompt: string;
  level: KnowledgeLevel;
  pct: number | null;
  isWeak: boolean;
  status: ProgressStatus;
};

const LEVEL_RANK: Record<KnowledgeLevel, number> = { bajo: 0, medio: 1, alto: 2 };
const VALID_STATUS: ProgressStatus[] = ["pendiente", "en_progreso", "completado"];

// La tabla learning_progress puede no existir todavía en algunos entornos; el
// código degrada con elegancia (status "pendiente") en vez de romper el chat.
async function fetchProgress(userId: string): Promise<Map<string, ProgressStatus>> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("learning_progress")
      .select("topic_key, status")
      .eq("user_id", userId);
    if (error) return new Map();
    return new Map((data as ProgressRow[]).map((r) => [r.topic_key, r.status]));
  } catch {
    return new Map();
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
    const [diagRes, progress] = await Promise.all([
      admin
        .from("diagnostic_results")
        .select("topics_performance")
        .eq("user_id", user.id)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchProgress(user.id),
    ]);

    const diagnostic = diagRes.data as DiagnosticRow | null;
    const performance = (diagnostic?.topics_performance ?? {}) as TopicPerformance;
    const hasData = diagnostic !== null && Object.keys(performance).length > 0;

    const topics: TopicNode[] = learningTopics.map((meta) => {
      const perf = performance[meta.key];
      const pct =
        perf && perf.total > 0 ? Math.round((perf.correct / perf.total) * 100) : null;
      const level = pct === null ? "bajo" : levelFromPct(pct);
      return {
        key: meta.key,
        label: meta.label,
        icon: meta.icon,
        starterPrompt: meta.starterPrompt,
        level,
        pct,
        isWeak: level !== "alto",
        status: progress.get(meta.key) ?? "pendiente",
      };
    });

    // Ruta = temas débiles, ordenados por nivel (más bajo primero) y luego por pct.
    const path = topics
      .filter((t) => t.isWeak)
      .sort(
        (a, b) =>
          LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
          (a.pct ?? 0) - (b.pct ?? 0)
      );

    // Atajos = todos los temas del catálogo, débiles primero (priorización visual).
    const shortcuts = [...topics].sort(
      (a, b) => Number(b.isWeak) - Number(a.isWeak)
    );

    return NextResponse.json({ hasData, path, shortcuts });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type ProgressBody = { topicKey?: string; status?: string };

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }

    const body = (await req.json()) as ProgressBody;
    const topicKey = body.topicKey;
    const status = body.status as ProgressStatus | undefined;

    if (!topicKey || !learningTopicByKey[topicKey]) {
      return NextResponse.json({ error: "Tema inválido" }, { status: 400 });
    }
    if (!status || !VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }

    const { error } = await supabaseAdmin()
      .from("learning_progress")
      .upsert(
        {
          user_id: user.id,
          topic_key: topicKey,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,topic_key" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
