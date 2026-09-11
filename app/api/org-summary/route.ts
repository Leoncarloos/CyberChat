export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeOrgMetrics, type OrgMetrics, type Period } from "@/lib/orgMetrics";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const MIN_COMPLETED_DIAGNOSTICS = 1;
const VALID_PERIODS: Period[] = ["week", "month", "quarter", "all"];

const PERIOD_LABEL: Record<Period, string> = {
  week: "última semana",
  month: "último mes",
  quarter: "último trimestre",
  all: "histórico completo",
};

type AdminCtx = { userId: string; ruc: string };
type AuthFail = { status: number; error: string };

async function authorizeAdmin(): Promise<AdminCtx | AuthFail> {
  const supabase = await supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return { status: 401, error: "No auth" };

  const meta = user.user_metadata ?? {};
  if (meta.role !== "admin") return { status: 403, error: "Solo administradores" };
  const ruc: string = meta.ruc ?? "";
  if (!ruc) return { status: 400, error: "Administrador sin RUC configurado" };

  return { userId: user.id, ruc };
}

function isAuthFail(v: AdminCtx | AuthFail): v is AuthFail {
  return "error" in v;
}

// Verifica que haya datos mínimos para un resumen confiable (Escenario 3).
function checkSufficiency(metrics: OrgMetrics): string[] {
  const warnings: string[] = [];
  if (metrics.empty || metrics.totals.completedDiagnostic < MIN_COMPLETED_DIAGNOSTICS) {
    warnings.push(
      `Se requiere al menos ${MIN_COMPLETED_DIAGNOSTICS} evaluación diagnóstica completada en el período para generar un resumen confiable.`
    );
  }
  return warnings;
}

// Advertencias informativas (datos parciales) que no impiden la generación.
function partialWarnings(metrics: OrgMetrics): string[] {
  const warnings: string[] = [];
  if (metrics.scores.avgPostTest === null) {
    warnings.push("Aún no hay post-tests completados; el progreso se basa solo en el diagnóstico inicial.");
  }
  if (metrics.periodComparison.previousAvg === null && metrics.periodComparison.period !== "all") {
    warnings.push("No hay datos del período anterior para comparar la evolución.");
  }
  return warnings;
}

// Solo datos agregados y anonimizados — nunca nombres, correos ni IDs.
function buildAnonymizedPayload(metrics: OrgMetrics, period: Period) {
  return {
    periodo: PERIOD_LABEL[period],
    nivel_general: {
      indice_concientizacion_pct: metrics.overallAwarenessPct,
      empleados_en_cumplimiento_pct: metrics.complianceRate,
      promedio_diagnostico_pct: metrics.scores.avgDiagnostic,
      promedio_post_test_pct: metrics.scores.avgPostTest,
    },
    cobertura: {
      empleados_activos: metrics.totals.active,
      completaron_diagnostico: metrics.totals.completedDiagnostic,
      tasa_completitud_pct: metrics.totals.completionRate,
    },
    progreso: {
      mejora_diag_a_postest_pp: metrics.scores.improvement,
      comparativa_periodo: metrics.periodComparison,
    },
    temas_mayor_riesgo: metrics.weakestTopics.map((t) => ({ tema: t.label, promedio_pct: t.avgPct })),
    desempeno_por_tema: metrics.topicsAvg
      .filter((t) => t.count > 0)
      .map((t) => ({ tema: t.label, promedio_pct: t.avgPct })),
    grupos_por_riesgo: metrics.riskDistribution,
    uso_chatbot: metrics.chatbotUsage,
  };
}

async function generateSummaryText(metrics: OrgMetrics, period: Period): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY ?? "";
  if (!groqKey) throw new Error("GROQ_API_KEY no configurada");

  const payload = buildAnonymizedPayload(metrics, period);

  const system =
    "Eres un analista experto en ciberseguridad y concientización para MYPES peruanas. " +
    "Generas resúmenes ejecutivos claros para administradores, basándote EXCLUSIVAMENTE en los datos agregados entregados. " +
    "Nunca inventes datos ni menciones empleados individuales (no hay nombres). " +
    "Limítate al dominio de ciberseguridad y concientización. Máximo 450 palabras.";

  const user =
    `Datos organizacionales agregados (período: ${PERIOD_LABEL[period]}):\n` +
    "```json\n" + JSON.stringify(payload, null, 2) + "\n```\n\n" +
    "Redacta un resumen ejecutivo en español con estas secciones (usa subtítulos en negrita con ##):\n" +
    "1. Nivel general de concientización: interpreta el índice agregado de forma cualitativa.\n" +
    "2. Temas con mayor riesgo: lista los temas más débiles y su impacto potencial para la empresa.\n" +
    "3. Progreso organizacional: indica si hay mejora, estancamiento o retroceso según la comparativa.\n" +
    "4. Grupos con mejor y peor desempeño: descríbelos por nivel de riesgo (bajo/medio/alto), nunca por personas.\n" +
    "5. Recomendaciones: 2-3 acciones concretas y priorizadas.\n" +
    "Sé conciso y accionable.";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen/qwen3.8-27b",
      temperature: 0.3,
      max_tokens: 900,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Groq respondió ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Respuesta vacía del servicio de IA");
  return text;
}

type CachedRow = {
  summary_text: string;
  warnings: string[];
  period: Period;
  generated_at: string;
};

async function readCache(ruc: string, period: Period): Promise<CachedRow | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("org_summaries")
      .select("summary_text, warnings, period, generated_at")
      .eq("ruc", ruc)
      .eq("period", period)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as CachedRow;
  } catch {
    return null;
  }
}

// Inserta una fila por generación: sirve de cache (última) y de log de auditoría.
async function persistSummary(
  ruc: string,
  period: Period,
  text: string,
  warnings: string[],
  userId: string,
  metrics: OrgMetrics
) {
  try {
    await supabaseAdmin().from("org_summaries").insert({
      ruc,
      period,
      summary_text: text,
      warnings,
      generated_by: userId,
      generated_at: new Date().toISOString(),
      metrics: buildAnonymizedPayload(metrics, period),
    });
  } catch {
    // No bloquear la respuesta si falla la persistencia/auditoría.
  }
}

function parsePeriod(value: string | null): Period {
  return value && (VALID_PERIODS as string[]).includes(value) ? (value as Period) : "month";
}

// GET — devuelve cache fresca (< 1h) o genera automáticamente al cargar el dashboard.
export async function GET(req: Request) {
  try {
    const ctx = await authorizeAdmin();
    if (isAuthFail(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const period = parsePeriod(new URL(req.url).searchParams.get("period"));

    const cached = await readCache(ctx.ruc, period);
    if (cached && Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS) {
      return NextResponse.json({
        summary: cached.summary_text,
        generatedAt: cached.generated_at,
        period,
        warnings: cached.warnings ?? [],
        cached: true,
      });
    }

    return await generateAndRespond(ctx.userId, ctx.ruc, period);
  } catch {
    return NextResponse.json(
      { error: "No fue posible generar el resumen. Por favor, intenta nuevamente o contacta al soporte técnico." },
      { status: 500 }
    );
  }
}

// POST — regeneración bajo demanda con datos actualizados (ignora la cache).
export async function POST(req: Request) {
  try {
    const ctx = await authorizeAdmin();
    if (isAuthFail(ctx)) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    let period: Period = "month";
    try {
      const body = (await req.json()) as { period?: string };
      period = parsePeriod(body.period ?? null);
    } catch {
      period = "month";
    }

    return await generateAndRespond(ctx.userId, ctx.ruc, period);
  } catch {
    return NextResponse.json(
      { error: "No fue posible generar el resumen. Por favor, intenta nuevamente o contacta al soporte técnico." },
      { status: 500 }
    );
  }
}

async function generateAndRespond(userId: string, ruc: string, period: Period) {
  const metrics = await computeOrgMetrics(ruc, period);

  const blocking = checkSufficiency(metrics);
  if (blocking.length > 0) {
    return NextResponse.json({
      insufficient: true,
      warnings: blocking,
      period,
    });
  }

  const text = await generateSummaryText(metrics, period);
  const warnings = partialWarnings(metrics);
  const generatedAt = new Date().toISOString();

  await persistSummary(ruc, period, text, warnings, userId, metrics);

  return NextResponse.json({
    summary: text,
    generatedAt,
    period,
    warnings,
    cached: false,
  });
}
