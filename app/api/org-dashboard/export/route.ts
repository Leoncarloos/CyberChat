export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { computeOrgMetrics } from "@/lib/orgMetrics";
import { toCsv } from "@/lib/csv";
import { diagnosticTopics } from "@/lib/diagnosticQuestions";

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  pending: "Pendiente",
  rejected: "Rechazado",
};

const RISK_LABEL: Record<string, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }

    const meta = user.user_metadata ?? {};
    if (meta.role !== "admin") {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }
    const adminRuc: string = meta.ruc ?? "";
    if (!adminRuc) {
      return NextResponse.json({ error: "Administrador sin RUC configurado" }, { status: 400 });
    }

    const type = req.nextUrl.searchParams.get("type");
    if (type !== "summary" && type !== "employees") {
      return NextResponse.json({ error: "Parámetro 'type' inválido" }, { status: 400 });
    }

    const metrics = await computeOrgMetrics(adminRuc);
    if (metrics.empty) {
      return NextResponse.json({ error: "No hay datos para exportar" }, { status: 404 });
    }

    const today = new Date().toISOString().slice(0, 10);
    let csv: string;
    let filename: string;

    if (type === "summary") {
      csv = toCsv([
        ["Métrica", "Valor"],
        ["RUC", metrics.ruc],
        ["Total empleados", metrics.totals.employees],
        ["Activos", metrics.totals.active],
        ["Pendientes", metrics.totals.pending],
        ["Rechazados", metrics.totals.rejected],
        ["Completaron diagnóstico", metrics.totals.completedDiagnostic],
        ["Tasa de completitud (%)", metrics.totals.completionRate],
        ["Promedio diagnóstico (%)", metrics.scores.avgDiagnostic],
        ["Promedio post-test (%)", metrics.scores.avgPostTest],
        ["Mejora (pp)", metrics.scores.improvement],
        ["Índice general de concientización (%)", metrics.overallAwarenessPct],
        ["Tasa de cumplimiento (%)", metrics.complianceRate],
        ["Empleados en riesgo alto", metrics.riskDistribution.high],
        ["Empleados en riesgo medio", metrics.riskDistribution.medium],
        ["Empleados en riesgo bajo", metrics.riskDistribution.low],
        ["Consultas totales al chatbot", metrics.chatbotUsage.totalQueries],
        [],
        ["Tema", "Promedio (%)", "Evaluaciones registradas"],
        ...metrics.topicsAvg.map((t) => [t.label, t.count > 0 ? t.avgPct : "--", t.count]),
      ]);
      filename = `cyberchat-resumen-organizacional-${adminRuc}-${today}.csv`;
    } else {
      const topicHeaders = diagnosticTopics.map((t) => `${t.label} (%)`);
      csv = toCsv([
        ["Nombre", "Correo", "Estado", "Score diagnóstico (%)", "Score post-test (%)", "Nivel de riesgo", "Tema más débil", "Última evaluación", ...topicHeaders],
        ...metrics.allEmployees.map((e) => [
          e.fullName,
          e.email,
          STATUS_LABEL[e.status] ?? e.status,
          e.diagnosticPct,
          e.postTestPct,
          e.riskLevel ? RISK_LABEL[e.riskLevel] : "--",
          e.worstTopicLabel,
          e.lastEvaluationDate ? e.lastEvaluationDate.slice(0, 10) : "--",
          ...diagnosticTopics.map((t) => e.topicsPct[t.key] ?? "--"),
        ]),
      ]);
      filename = `cyberchat-empleados-${adminRuc}-${today}.csv`;
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Filename": filename,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
