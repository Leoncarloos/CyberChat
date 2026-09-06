"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type RiskLevel = "low" | "medium" | "high";

type TopicAvg = { key: string; label: string; avgPct: number; count: number };

type PriorityEmployee = {
  id: string;
  fullName: string;
  email: string;
  status: string;
  riskLevel: RiskLevel;
  diagnosticPct: number | null;
  postTestPct: number | null;
  worstTopicLabel: string;
  lastEvaluationDate: string | null;
};

type OrgData = {
  empty: boolean;
  ruc?: string;
  totals: {
    employees: number;
    active: number;
    pending: number;
    rejected: number;
    completedDiagnostic: number;
    completionRate: number;
  };
  scores: {
    avgDiagnostic: number | null;
    avgPostTest: number | null;
    improvement: number | null;
  };
  topicsAvg: TopicAvg[];
  weakestTopics: TopicAvg[];
  riskDistribution: { low: number; medium: number; high: number };
  chatbotUsage: { totalQueries: number };
  priorityEmployees: PriorityEmployee[];
  recurring?: {
    avgLatestPct: number | null;
    avgDeltaPP: number | null;
    employeesUpToDate: number;
    employeesOverdue: number;
    employeesNotStarted: number;
    upToDateRate: number | null;
    criticalTopics: TopicAvg[];
  };
  error?: string;
};

const RISK = {
  low:    { label: "Bajo",  dot: "🟢", color: "text-[var(--green)]",    bg: "bg-[rgba(46,125,82,0.1)]",   border: "border-[rgba(46,125,82,0.25)]" },
  medium: { label: "Medio", dot: "🟡", color: "text-[var(--amber-dim)]", bg: "bg-[rgba(232,117,10,0.08)]", border: "border-[rgba(232,117,10,0.25)]" },
  high:   { label: "Alto",  dot: "🔴", color: "text-[var(--red)]",       bg: "bg-[rgba(201,64,64,0.08)]",  border: "border-[rgba(201,64,64,0.25)]" },
};

async function downloadOrgCsv(type: "summary" | "employees") {
  try {
    const res = await fetch(`/api/org-dashboard/export?type=${type}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "No fue posible exportar los datos.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.headers.get("X-Filename") ?? `cyberchat-export-${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert("No fue posible exportar los datos.");
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function Bar({ pct, colorClass }: { pct: number; colorClass: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--paper-3)]">
      <div className={`h-full rounded-full transition-all duration-700 ${colorClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function KpiCard({ label, value, sub, colorClass = "text-[var(--amber-dim)]" }: { label: string; value: string; sub?: string; colorClass?: string }) {
  return (
    <div className="stat-card">
      <p className="eyebrow">{label}</p>
      <p className={`display-title mt-3 text-5xl font-black ${colorClass}`}>{value}</p>
      {sub ? <p className="mt-2 text-sm text-[var(--ink-soft)]">{sub}</p> : null}
    </div>
  );
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSummaryHtml(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  const html: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) { html.push(`<ul>${items.join("")}</ul>`); items = []; }
  };
  const inline = (s: string) =>
    escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("### ")) { flush(); html.push(`<h4>${inline(line.slice(4))}</h4>`); continue; }
    if (line.startsWith("## ")) { flush(); html.push(`<h4>${inline(line.slice(3))}</h4>`); continue; }
    if (line.startsWith("# ")) { flush(); html.push(`<h4>${inline(line.slice(2))}</h4>`); continue; }
    if (/^\d+\.\s+/.test(line) || line.startsWith("- ") || line.startsWith("* ")) {
      items.push(`<li>${inline(line.replace(/^\d+\.\s+/, "").replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    flush();
    html.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return html.join("");
}

type SummaryState = {
  summary?: string;
  generatedAt?: string;
  period?: string;
  warnings?: string[];
  insufficient?: boolean;
};

const PERIOD_LABEL: Record<string, string> = {
  week: "Última semana",
  month: "Último mes",
  quarter: "Último trimestre",
  all: "Histórico",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function OrganizationalSummary() {
  const [state, setState] = useState<SummaryState | null>(null);
  const [period, setPeriod] = useState<string>("month");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(force: boolean, selectedPeriod: string) {
    setIsLoading(true);
    setError("");
    try {
      const res = force
        ? await fetch("/api/org-summary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ period: selectedPeriod }),
          })
        : await fetch(`/api/org-summary?period=${selectedPeriod}`);
      const json = (await res.json()) as SummaryState & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No fue posible generar el resumen. Intenta nuevamente o contacta al soporte técnico.");
        setState(null);
      } else {
        setState(json);
      }
    } catch {
      setError("No fue posible generar el resumen. Intenta nuevamente o contacta al soporte técnico.");
      setState(null);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    void load(false, period);
    // Solo en montaje; los cambios de período/regeneración usan los handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPeriodChange(next: string) {
    setPeriod(next);
    void load(false, next);
  }

  return (
    <section
      className="rounded-[1.4rem] border border-[rgba(10,126,126,0.25)] bg-[rgba(10,126,126,0.05)] px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]"
      aria-label="Resumen ejecutivo generado por IA"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[rgba(10,126,126,0.25)] bg-[rgba(10,126,126,0.1)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--teal)]">
              ✨ Resumen IA
            </span>
            {state?.generatedAt && !isLoading ? (
              <span className="font-mono text-[10px] text-[var(--ink-soft)]">
                Generado {formatDateTime(state.generatedAt)}
              </span>
            ) : null}
          </div>
          <h2 className="display-title mt-2 text-2xl font-bold">Resumen ejecutivo organizacional</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="summary-period" className="sr-only">Período del resumen</label>
          <select
            id="summary-period"
            value={period}
            onChange={(e) => onPeriodChange(e.target.value)}
            disabled={isLoading}
            className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none disabled:opacity-60"
          >
            <option value="week">Última semana</option>
            <option value="month">Último mes</option>
            <option value="quarter">Último trimestre</option>
            <option value="all">Histórico</option>
          </select>
          <button
            className="rounded-xl border border-[rgba(10,126,126,0.25)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void load(true, period)}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? "Generando…" : "🔄 Generar resumen IA"}
          </button>
        </div>
      </div>

      <div className="mt-5" aria-live="polite">
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--teal)] border-t-transparent" />
              Analizando resultados organizacionales…
            </div>
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-black/5" style={{ width: `${90 - i * 12}%` }} />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[rgba(201,64,64,0.25)] bg-[rgba(201,64,64,0.06)] px-4 py-4 text-sm text-[var(--red)]" role="alert">
            {error}
            <button className="ml-3 underline hover:no-underline" onClick={() => void load(true, period)}>
              Reintentar
            </button>
          </div>
        ) : state?.insufficient ? (
          <div className="rounded-xl border border-[var(--border)] bg-white/70 px-4 py-4 text-sm text-[var(--ink-soft)]" role="status">
            <p className="font-semibold text-[var(--ink)]">Datos insuficientes para un resumen confiable.</p>
            {state.warnings?.map((w, i) => <p key={i} className="mt-1">• {w}</p>)}
          </div>
        ) : state?.summary ? (
          <>
            <div
              className="max-w-none text-[var(--ink)] [&_h4]:mb-2 [&_h4]:mt-5 [&_h4]:text-lg [&_h4]:font-bold [&_h4]:text-[var(--teal-dim)] first:[&_h4]:mt-0 [&_li]:mb-1.5 [&_li]:text-sm [&_li]:leading-7 [&_p]:mb-3 [&_p]:text-sm [&_p]:leading-7 [&_strong]:text-[var(--ink)] [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: renderSummaryHtml(state.summary) }}
            />
            {state.warnings?.length ? (
              <div className="mt-4 rounded-xl border border-[rgba(232,117,10,0.25)] bg-[rgba(232,117,10,0.06)] px-4 py-3 text-xs text-[var(--amber-dim)]">
                {state.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            ) : null}
            <p className="mt-3 font-mono text-[10px] text-[var(--ink-soft)]">
              Resumen interpretativo generado por IA · {PERIOD_LABEL[state.period ?? period] ?? ""} · complementa, no sustituye, los datos del dashboard.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default function OrgDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [data, setData] = useState<OrgData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");

  useEffect(() => {
    void (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.push("/login"); return; }
      if (authData.user.user_metadata?.role !== "admin") { router.push("/chat"); return; }
      setEmail(authData.user.email ?? "");

      const res = await fetch("/api/org-dashboard");
      const json = (await res.json()) as OrgData;
      setData(json);
      setIsLoading(false);
    })();
  }, [router, supabase]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--amber)] border-t-transparent" />
          <p className="text-[var(--ink-soft)]">Cargando dashboard organizacional...</p>
        </div>
      </main>
    );
  }

  if (!data || data.error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
        <div className="text-center">
          <p className="text-[var(--red)]">{data?.error ?? "Error al cargar el dashboard."}</p>
          <button className="primary-button mt-4" onClick={() => router.push("/manage")}>← Volver</button>
        </div>
      </main>
    );
  }

  const { totals, scores, topicsAvg, weakestTopics, riskDistribution, chatbotUsage, priorityEmployees, ruc } = data;
  const highRisk = riskDistribution.high;

  return (
    <main className="app-shell grid h-screen grid-cols-1 overflow-hidden bg-[var(--paper)] lg:grid-cols-[280px_1fr]">
      <aside className="flex flex-col overflow-hidden border-r border-white/10 bg-[var(--ink)] text-[var(--paper)]">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="brand-mark !h-10 !w-10 !rounded-xl text-sm">C</div>
            <div>
              <div className="display-title text-2xl font-black leading-none">CyberChat</div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.5)]">
                Panel Admin
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.42)]">
            Gestión
          </p>
          <div className="space-y-1">
            <button className="ui-nav" onClick={() => router.push("/manage")}>
              <span className="ui-nav-icon">📊</span>
              <span>Resumen</span>
            </button>
            <button className="ui-nav" onClick={() => router.push("/manage")}>
              <span className="ui-nav-icon">👥</span>
              <span>Empleados</span>
            </button>
          </div>

          <p className="px-2 pb-2 pt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.42)]">
            Otros módulos
          </p>
          <div className="space-y-1">
            <button className="ui-nav active">
              <span className="ui-nav-icon">📈</span>
              <span>Dashboard org.</span>
            </button>
            <button className="ui-nav" onClick={() => router.push("/admin")}>
              <span className="ui-nav-icon">📚</span>
              <span>Documentos RAG</span>
            </button>
            <button className="ui-nav" onClick={() => router.push("/chat")}>
              <span className="ui-nav-icon">💬</span>
              <span>Ir al chat</span>
            </button>
          </div>
        </div>

        <div className="mt-auto px-4 pb-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.42)]">
              RUC administrado
            </div>
            <div className="mt-1.5 text-base font-semibold text-[rgba(245,240,232,0.92)]">
              {ruc || "—"}
            </div>
          </div>
        </div>

        <div className="border-t border-white/8 px-4 py-4">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-[rgba(245,240,232,0.9)]">
              {(email.charAt(0) || "A").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-[rgba(245,240,232,0.88)]">
                {email || "Admin"}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[rgba(245,240,232,0.5)]">
                Administrador
              </div>
            </div>
          </div>
          <button
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm font-semibold text-[rgba(245,240,232,0.72)] transition hover:bg-white/12 hover:text-[rgba(245,240,232,0.96)]"
            onClick={() => void logout()}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--paper)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(26,21,16,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(26,21,16,0.025)_1px,transparent_1px)] bg-[size:32px_32px]" />

        <header className="relative z-10 border-b border-[var(--border)] bg-[rgba(245,240,232,0.88)] px-6 py-4 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="brand-mark !h-10 !w-10 !rounded-full !text-xs">C</div>
              <div>
                <p className="display-title text-xl font-bold">Dashboard organizacional</p>
                <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--ink-soft)]">
                  RUC {ruc} · CONCIENTIZACIÓN CIBERSEGURIDAD
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {!data?.empty && (
                <>
                  <button className="ghost-button !px-4 !py-2 !text-xs" onClick={() => void downloadOrgCsv("summary")}>
                    ⬇ Exportar resumen
                  </button>
                  <button className="ghost-button !px-4 !py-2 !text-xs" onClick={() => void downloadOrgCsv("employees")}>
                    ⬇ Exportar empleados
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="relative z-10 flex-1 overflow-y-auto"><div className="mx-auto max-w-7xl space-y-6 px-6 py-8">

        {/* Sin datos */}
        {data.empty && (
          <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/70 px-8 py-12 text-center">
            <p className="text-lg font-bold text-[var(--ink)]">No existen datos suficientes para generar métricas organizacionales.</p>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">Aprueba empleados y espera a que completen la evaluación diagnóstica.</p>
            <button className="secondary-button mt-6" onClick={() => router.push("/manage")}>Ir a gestión de empleados</button>
          </div>
        )}

        {!data.empty && (
          <>
            {/* KPIs fila 1 */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <KpiCard label="Total empleados" value={String(totals.employees)} sub={`${totals.active} activos`} />
              <KpiCard label="Pendientes" value={String(totals.pending)} sub="Esperando aprobación" colorClass="text-[var(--amber-dim)]" />
              <KpiCard label="Completaron diagnóstico" value={`${totals.completedDiagnostic}`} sub={`${totals.completionRate}% de activos`} colorClass="text-[var(--teal-dim)]" />
              <KpiCard
                label="Alto riesgo"
                value={String(highRisk)}
                sub="Empleados críticos"
                colorClass={highRisk > 0 ? "text-[var(--red)]" : "text-[var(--green)]"}
              />
              <KpiCard
                label="Promedio org."
                value={scores.avgDiagnostic !== null ? `${scores.avgDiagnostic}%` : "--"}
                sub="Test inicial"
              />
              <KpiCard label="Consultas totales" value={String(chatbotUsage.totalQueries)} sub="Al chatbot" colorClass="text-[var(--ink)]" />
            </div>

            {/* Resumen ejecutivo IA (HU17) */}
            <OrganizationalSummary />

            {/* Comparativa org + Distribución riesgo */}
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">

              {/* Comparativa */}
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
                <p className="eyebrow">Comparativa organizacional</p>
                <div className="mt-5 space-y-5">
                  <div>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-semibold text-[var(--ink)]">Promedio Test Inicial</span>
                      <span className="font-mono text-[var(--amber-dim)]">
                        {scores.avgDiagnostic !== null ? `${scores.avgDiagnostic}%` : "--"}
                      </span>
                    </div>
                    <Bar pct={scores.avgDiagnostic ?? 0} colorClass="bg-[var(--amber)]" />
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-semibold text-[var(--ink)]">Promedio Post-Test</span>
                      <span className="font-mono text-[var(--teal-dim)]">
                        {scores.avgPostTest !== null ? `${scores.avgPostTest}%` : "--"}
                      </span>
                    </div>
                    <Bar pct={scores.avgPostTest ?? 0} colorClass="bg-[var(--teal)]" />
                    {scores.avgPostTest === null && (
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">Los empleados aún no han completado el post-test.</p>
                    )}
                  </div>
                  {scores.improvement !== null && (
                    <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                      scores.improvement >= 0
                        ? "border-[rgba(46,125,82,0.25)] bg-[rgba(46,125,82,0.07)] text-[var(--green)]"
                        : "border-[rgba(201,64,64,0.25)] bg-[rgba(201,64,64,0.07)] text-[var(--red)]"
                    }`}>
                      {scores.improvement >= 0 ? "+" : ""}{scores.improvement} pp de mejora organizacional
                    </div>
                  )}
                </div>
              </div>

              {/* Distribución de riesgo */}
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
                <p className="eyebrow">Distribución de riesgo</p>
                <div className="mt-5 space-y-3">
                  {(["high", "medium", "low"] as RiskLevel[]).map((r) => {
                    const cfg = RISK[r];
                    const count = riskDistribution[r];
                    const total = riskDistribution.low + riskDistribution.medium + riskDistribution.high;
                    const p = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={r} className={`rounded-xl border px-4 py-4 ${cfg.bg} ${cfg.border}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{cfg.dot}</span>
                            <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
                          </div>
                          <div className="text-right">
                            <span className={`display-title text-3xl font-black ${cfg.color}`}>{count}</span>
                            <span className="ml-2 text-xs text-[var(--ink-soft)]">{p}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <p className="pt-1 text-xs text-[var(--ink-soft)]">
                    Solo empleados con al menos un diagnóstico registrado.
                  </p>
                </div>
              </div>
            </div>

            {/* Desempeño por temática */}
            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
                <p className="eyebrow">Nivel de conocimiento por temática — promedio organizacional</p>
                <div className="mt-5 space-y-4">
                  {topicsAvg.map((t) => {
                    const barColor =
                      t.avgPct >= 75
                        ? "bg-[var(--green)]"
                        : t.avgPct >= 50
                        ? "bg-[var(--amber)]"
                        : "bg-[var(--red)]";
                    return (
                      <div key={t.key}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-[var(--ink)]">{t.label}</span>
                          <span className="shrink-0 font-mono text-[11px] text-[var(--ink-soft)]">
                            {t.count > 0 ? `${t.avgPct}%` : "--"}
                          </span>
                        </div>
                        <Bar pct={t.avgPct} colorClass={barColor} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Temas más débiles */}
              <div className="rounded-[1.4rem] border border-[rgba(201,64,64,0.2)] bg-[rgba(201,64,64,0.05)] px-5 py-6">
                <p className="eyebrow text-[var(--red)]">Áreas críticas org.</p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">Temáticas con mayor % de errores</p>
                {weakestTopics.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {weakestTopics.map((t, i) => (
                      <div key={t.key} className="rounded-xl border border-[rgba(201,64,64,0.15)] bg-white/70 px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--red)] font-mono text-[10px] font-bold text-white">
                            {i + 1}
                          </span>
                          <span className="text-sm font-semibold text-[var(--ink)]">{t.label}</span>
                        </div>
                        <p className="mt-1 pl-8 font-mono text-[11px] text-[var(--red)]">{t.avgPct}% promedio</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[var(--ink-soft)]">Sin datos suficientes.</p>
                )}
              </div>
            </div>

            {/* HU20 — Evaluación recurrente */}
            {data.recurring && (
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
                <p className="eyebrow">Evaluación recurrente (cada 5 días)</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Seguimiento continuo de concientización y áreas críticas de la organización.
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-4">
                  <KpiCard
                    label="Promedio último test"
                    value={data.recurring.avgLatestPct !== null ? `${data.recurring.avgLatestPct}%` : "--"}
                    sub="Evaluaciones recurrentes"
                    colorClass={
                      data.recurring.avgLatestPct !== null && data.recurring.avgLatestPct >= 75
                        ? "text-[var(--green)]"
                        : "text-[var(--amber-dim)]"
                    }
                  />
                  <KpiCard
                    label="Tendencia"
                    value={
                      data.recurring.avgDeltaPP !== null
                        ? `${data.recurring.avgDeltaPP > 0 ? "+" : ""}${data.recurring.avgDeltaPP}pp`
                        : "--"
                    }
                    sub="vs. intento anterior"
                    colorClass={
                      data.recurring.avgDeltaPP !== null && data.recurring.avgDeltaPP >= 0
                        ? "text-[var(--green)]"
                        : "text-[var(--red)]"
                    }
                  />
                  <KpiCard
                    label="Al día"
                    value={data.recurring.upToDateRate !== null ? `${data.recurring.upToDateRate}%` : "--"}
                    sub={`${data.recurring.employeesUpToDate} al día · ${data.recurring.employeesOverdue} vencidas`}
                    colorClass="text-[var(--teal-dim)]"
                  />
                  <KpiCard
                    label="Sin iniciar ciclo"
                    value={String(data.recurring.employeesNotStarted)}
                    sub="Post-test pendiente"
                    colorClass="text-[var(--ink-soft)]"
                  />
                </div>

                {data.recurring.criticalTopics.length > 0 && (
                  <div className="mt-5">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      Áreas críticas actuales (última evaluación por empleado)
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {data.recurring.criticalTopics.map((t, i) => (
                        <div
                          key={t.key}
                          className="rounded-xl border border-[rgba(201,64,64,0.15)] bg-[rgba(201,64,64,0.04)] px-4 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--red)] font-mono text-[10px] font-bold text-white">
                              {i + 1}
                            </span>
                            <span className="text-sm font-semibold text-[var(--ink)]">{t.label}</span>
                          </div>
                          <p className="mt-1 pl-8 font-mono text-[11px] text-[var(--red)]">
                            {t.avgPct}% promedio · {t.count} empleado{t.count === 1 ? "" : "s"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tabla de atención prioritaria */}
            <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
              <div className="border-b border-[var(--border)] px-6 py-5">
                <p className="eyebrow">Tabla de atención prioritaria</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Empleados ordenados por nivel de riesgo. Solo incluye quienes completaron el diagnóstico.
                </p>
              </div>

              {priorityEmployees.length === 0 ? (
                <div className="px-6 py-8 text-sm text-[var(--ink-soft)]">
                  No hay empleados con evaluaciones completadas aún.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[1.6fr_1.4fr_0.8fr_1.4fr_1fr] gap-4 border-b border-[var(--border)] px-5 py-3 text-xs font-semibold text-[var(--ink-soft)]">
                    <div>Empleado</div>
                    <div>Tema más débil</div>
                    <div>Riesgo</div>
                    <div>Diagnóstico / Post-Test</div>
                    <div>Última evaluación</div>
                  </div>
                  {priorityEmployees.map((emp) => {
                    const risk = RISK[emp.riskLevel];
                    return (
                      <div
                        key={emp.id}
                        className="grid grid-cols-[1.6fr_1.4fr_0.8fr_1.4fr_1fr] gap-4 border-b border-[var(--border)] px-5 py-4 last:border-b-0"
                      >
                        <div>
                          <div className="font-semibold text-sm text-[var(--ink)]">{emp.fullName}</div>
                          <div className="mt-0.5 truncate text-xs text-[var(--ink-soft)]">{emp.email}</div>
                        </div>
                        <div className="self-center text-sm text-[var(--ink)]">{emp.worstTopicLabel}</div>
                        <div className="self-center">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${risk.bg} ${risk.border} ${risk.color}`}>
                            {risk.dot} {risk.label}
                          </span>
                        </div>
                        <div className="self-center">
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <span className="text-[var(--amber-dim)]">
                              {emp.diagnosticPct !== null ? `${emp.diagnosticPct}%` : "--"}
                            </span>
                            {emp.postTestPct !== null && (
                              <>
                                <span className="text-[var(--ink-soft)]">→</span>
                                <span className="text-[var(--teal-dim)]">{emp.postTestPct}%</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="self-center text-xs text-[var(--ink-soft)]">
                          {emp.lastEvaluationDate ? formatDate(emp.lastEvaluationDate) : "--"}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="flex justify-center pb-4">
              <button className="ghost-button !px-8" onClick={() => router.push("/manage")}>
                ← Volver a gestión
              </button>
            </div>
          </>
        )}
        </div>
        </div>
      </section>
    </main>
  );
}
