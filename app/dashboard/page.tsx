"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { diagnosticTopics } from "@/lib/diagnosticQuestions";

type TopicPerf = { correct: number; total: number };

type DashboardData = {
  diagnostic: {
    score: number;
    total: number;
    pct: number;
    topicsPerformance: Record<string, TopicPerf>;
    completedAt: string;
  } | null;
  postTest: {
    score: number;
    total: number;
    pct: number;
    takenAt: string;
  } | null;
  postTestHistory: {
    score: number;
    total: number;
    pct: number;
    takenAt: string;
    testType?: "posttest" | "recurrente";
  }[];
  currentTopicsPerformance: Record<string, TopicPerf>;
  nextEvaluation: {
    lastCompletedAt: string;
    nextDueAt: string;
    due: boolean;
  } | null;
  improvement: number | null;
  riskLevel: "low" | "medium" | "high";
  chatbotUsage: {
    totalQueries: number;
    lastInteraction: string | null;
  };
  strongTopics: string[];
  weakTopics: string[];
  recommendations: string[];
  topicLabels: Record<string, string>;
  error?: string;
};

type RecommendationCard = {
  topicKey: string;
  topicLabel: string;
  title: string;
  summary: string;
  priority: "Alto" | "Medio" | "Bajo";
  suggestedPrompt: string;
};

const PRIORITY_CONFIG = {
  Alto:  { color: "text-[var(--red)]",       bg: "bg-[rgba(201,64,64,0.08)]",   border: "border-[rgba(201,64,64,0.2)]" },
  Medio: { color: "text-[var(--amber-dim)]", bg: "bg-[rgba(232,117,10,0.08)]", border: "border-[rgba(232,117,10,0.2)]" },
  Bajo:  { color: "text-[var(--green)]",     bg: "bg-[rgba(46,125,82,0.08)]",   border: "border-[rgba(46,125,82,0.2)]" },
};

const RISK_CONFIG = {
  low:    { label: "Bajo",   color: "text-[var(--green)]",    bg: "bg-[rgba(46,125,82,0.1)]",    border: "border-[rgba(46,125,82,0.25)]",    dot: "🟢" },
  medium: { label: "Medio",  color: "text-[var(--amber-dim)]", bg: "bg-[rgba(232,117,10,0.08)]", border: "border-[rgba(232,117,10,0.25)]",    dot: "🟡" },
  high:   { label: "Alto",   color: "text-[var(--red)]",       bg: "bg-[rgba(201,64,64,0.08)]",  border: "border-[rgba(201,64,64,0.25)]",     dot: "🔴" },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function ProgressBar({
  pct,
  colorClass,
}: {
  pct: number;
  colorClass: string;
}) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--paper-3)]">
      <div
        className={`h-full rounded-full transition-all duration-700 ${colorClass}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  colorClass = "text-[var(--amber-dim)]",
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="stat-card">
      <p className="eyebrow">{label}</p>
      <p className={`display-title mt-3 text-5xl font-black ${colorClass}`}>{value}</p>
      {sub ? <p className="mt-2 text-sm text-[var(--ink-soft)]">{sub}</p> : null}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<RecommendationCard[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    void (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.push("/login");
        return;
      }
      setEmail(authData.user.email ?? "");
      setRole(typeof authData.user.user_metadata?.role === "string" ? authData.user.user_metadata.role : "");

      const res = await fetch("/api/dashboard");
      const json = (await res.json()) as DashboardData;
      setData(json);
      setIsLoading(false);

      if (json.diagnostic) {
        setRecsLoading(true);
        try {
          const recRes = await fetch("/api/recommendations");
          const recJson = (await recRes.json()) as { recommendations?: RecommendationCard[] };
          setRecommendations(recJson.recommendations ?? []);
        } catch {}
        setRecsLoading(false);
      }
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
          <p className="text-[var(--ink-soft)]">Cargando tu dashboard...</p>
        </div>
      </main>
    );
  }

  if (!data || data.error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
        <div className="text-center">
          <p className="text-[var(--red)]">Error al cargar el dashboard.</p>
          <button className="primary-button mt-4" onClick={() => router.push("/chat")}>
            Volver al chat
          </button>
        </div>
      </main>
    );
  }

  const risk = RISK_CONFIG[data.riskLevel];
  const hasDiagnostic = Boolean(data.diagnostic);

  return (
    <main className="app-shell grid h-screen grid-cols-1 overflow-hidden bg-[var(--paper)] lg:grid-cols-[280px_1fr]">
      <aside className="flex flex-col overflow-hidden border-r border-[rgba(212,204,188,0.18)] bg-[var(--ink)] text-[var(--paper)]">
        <div className="border-b border-white/10 px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="brand-mark !h-11 !w-11 !rounded-2xl">C</div>
            <div>
              <div className="display-title text-3xl font-black leading-none">CyberChat</div>
              <div className="mt-1 text-sm text-[rgba(245,240,232,0.55)]">Protección MYPE</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-b border-white/8 px-4 py-4">
          <button
            className="mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-[rgba(245,240,232,0.72)] transition hover:bg-white/6"
            onClick={() => router.push("/chat")}
          >
            <span>💬</span>
            <span>Chat de IA</span>
          </button>
          <button
            className="mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold bg-[rgba(232,117,10,0.16)] text-[var(--amber-glow)]"
            onClick={() => router.push("/dashboard")}
          >
            <span>📊</span>
            <span>Mi Dashboard</span>
          </button>
          {role === "admin" ? (
            <button
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-[rgba(245,240,232,0.72)] transition hover:bg-white/6"
              onClick={() => router.push("/manage")}
            >
              <span>↩</span>
              <span>Volver a gestión</span>
            </button>
          ) : null}
        </div>

        <div className="border-t border-white/8 px-5 py-4">
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(245,240,232,0.36)]">
              Usuario
            </div>
            <div className="mt-2 text-sm text-[rgba(245,240,232,0.76)]">{email || "sesión activa"}</div>
          </div>
          <button className="ghost-button mt-3 w-full !rounded-xl !py-3 !text-xs" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      </aside>

      <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--paper)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(26,21,16,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(26,21,16,0.025)_1px,transparent_1px)] bg-[size:32px_32px]" />

        {/* Header */}
        <header className="relative z-10 border-b border-[var(--border)] bg-[rgba(245,240,232,0.88)] px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="brand-mark !h-10 !w-10 !rounded-full !text-xs">C</div>
              <div>
                <p className="display-title text-xl font-bold">Dashboard personal</p>
                <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--ink-soft)]">
                  PROGRESO EN CIBERSEGURIDAD
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="ghost-button !px-4 !py-2 !text-xs" onClick={() => router.push("/chat")}>
                ← Volver al chat
              </button>
            </div>
          </div>
        </header>

        <div className="relative z-10 flex-1 overflow-y-auto"><div className="mx-auto max-w-6xl space-y-6 px-6 py-8">

        {/* Sin diagnóstico */}
        {!hasDiagnostic && (
          <div className="rounded-[1.4rem] border border-[rgba(232,117,10,0.25)] bg-[rgba(232,117,10,0.07)] px-6 py-6 text-center">
            <p className="text-lg font-bold text-[var(--ink)]">Completa la evaluación diagnóstica para ver tus métricas.</p>
            <button className="primary-button mt-4" onClick={() => router.push("/diagnostic")}>
              Ir a la evaluación
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label="Test Inicial"
            value={data.diagnostic ? `${data.diagnostic.pct}%` : "--"}
            sub={data.diagnostic ? `${data.diagnostic.score}/${data.diagnostic.total} correctas` : "Sin datos"}
          />
          <KpiCard
            label="Post-Test"
            value={data.postTest ? `${data.postTest.pct}%` : "--"}
            sub={data.postTest ? `${data.postTest.score}/${data.postTest.total} correctas` : "Pendiente"}
            colorClass={data.postTest ? "text-[var(--teal-dim)]" : "text-[var(--ink-soft)]"}
          />
          <KpiCard
            label="Mejora"
            value={
              data.improvement !== null
                ? `${data.improvement >= 0 ? "+" : ""}${data.improvement} pp`
                : "--"
            }
            sub={data.improvement !== null ? "puntos porcentuales" : "Completa el post-test"}
            colorClass={
              data.improvement === null
                ? "text-[var(--ink-soft)]"
                : data.improvement >= 0
                ? "text-[var(--green)]"
                : "text-[var(--red)]"
            }
          />
          <div className={`stat-card border ${risk.border} ${risk.bg}`}>
            <p className="eyebrow">Nivel de riesgo</p>
            <p className={`display-title mt-3 text-5xl font-black ${risk.color}`}>
              {risk.dot} {risk.label}
            </p>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Basado en {data.postTest ? "post-test" : data.diagnostic ? "diagnóstico" : "sin datos"}
            </p>
          </div>
          <KpiCard
            label="Consultas al chat"
            value={String(data.chatbotUsage.totalQueries)}
            sub={
              data.chatbotUsage.lastInteraction
                ? `Última: ${formatDate(data.chatbotUsage.lastInteraction)}`
                : "Sin interacciones"
            }
          />
        </div>

        {/* Comparativa Test Inicial vs Post-Test */}
        {hasDiagnostic && (
          <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
            <p className="eyebrow">Comparativa de evaluaciones</p>
            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--ink)]">
                    Test Inicial ({data.diagnostic!.score}/{data.diagnostic!.total})
                  </span>
                  <span className="font-mono text-sm text-[var(--amber-dim)]">
                    {data.diagnostic!.pct}%
                  </span>
                </div>
                <ProgressBar pct={data.diagnostic!.pct} colorClass="bg-[var(--amber)]" />
                <p className="mt-1 font-mono text-[10px] text-[var(--ink-soft)]">
                  {formatDate(data.diagnostic!.completedAt)}
                </p>
              </div>

              {data.postTest ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--ink)]">
                      Post-Test ({data.postTest.score}/{data.postTest.total})
                    </span>
                    <span className="font-mono text-sm text-[var(--teal-dim)]">
                      {data.postTest.pct}%
                    </span>
                  </div>
                  <ProgressBar pct={data.postTest.pct} colorClass="bg-[var(--teal)]" />
                  <p className="mt-1 font-mono text-[10px] text-[var(--ink-soft)]">
                    {formatDate(data.postTest.takenAt)}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--ink-soft)]">
                  Post-Test pendiente — completa la evaluación en el módulo{" "}
                  <button
                    className="font-semibold text-[var(--amber-dim)] underline"
                    onClick={() => router.push("/chat")}
                  >
                    Evaluaciones
                  </button>{" "}
                  del chat.
                </div>
              )}

              {data.postTestHistory.length > 1 && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-[var(--ink)]">
                    Historial de evaluaciones
                  </p>
                  <ul className="space-y-1.5">
                    {data.postTestHistory.map((h, i) => (
                      <li
                        key={`${h.takenAt}-${i}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
                      >
                        <span className="font-mono text-[var(--ink-soft)]">
                          {formatDate(h.takenAt)}
                        </span>
                        <span className="rounded-full border border-[var(--border)] bg-[var(--paper-3)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                          {h.testType === "recurrente" ? "Recurrente" : "Post-test"}
                        </span>
                        <span className="font-mono font-semibold text-[var(--teal-dim)]">
                          {h.score}/{h.total} ({h.pct}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.nextEvaluation && (
                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    data.nextEvaluation.due
                      ? "border-[rgba(201,64,64,0.28)] bg-[rgba(201,64,64,0.06)] text-[var(--red)]"
                      : "border-[var(--border)] bg-[var(--paper-3)] text-[var(--ink-soft)]"
                  }`}
                >
                  {data.nextEvaluation.due ? (
                    <>
                      <span className="font-semibold">Evaluación recurrente pendiente</span> — ríndela
                      en el módulo{" "}
                      <button
                        className="font-semibold underline"
                        onClick={() => router.push("/chat")}
                      >
                        Evaluaciones
                      </button>{" "}
                      del chat.
                    </>
                  ) : (
                    <>
                      Próxima evaluación recurrente:{" "}
                      <span className="font-semibold text-[var(--ink)]">
                        {formatDate(data.nextEvaluation.nextDueAt)}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Desempeño por temática + Fortalezas/Debilidades */}
        {hasDiagnostic && (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            {/* Barras por temática */}
            <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
              <p className="eyebrow">Desempeño por temática</p>
              <div className="mt-5 space-y-4">
                {diagnosticTopics.map((topic) => {
                  const perf = data.diagnostic!.topicsPerformance[topic.key];
                  if (!perf) return null;
                  const pct = Math.round((perf.correct / perf.total) * 100);
                  const barColor =
                    pct === 100
                      ? "bg-[var(--green)]"
                      : pct >= 50
                      ? "bg-[var(--amber)]"
                      : "bg-[var(--red)]";
                  return (
                    <div key={topic.key}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-[var(--ink)]">
                          {topic.label}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-[var(--ink-soft)]">
                          {perf.correct}/{perf.total}
                        </span>
                      </div>
                      <ProgressBar pct={pct} colorClass={barColor} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fortalezas / Debilidades */}
            <div className="space-y-4">
              {data.strongTopics.length > 0 && (
                <div className="rounded-[1.4rem] border border-[rgba(46,125,82,0.2)] bg-[rgba(46,125,82,0.06)] px-5 py-5">
                  <p className="eyebrow text-[var(--green)]">Fortalezas</p>
                  <ul className="mt-3 space-y-2">
                    {data.strongTopics.map((t) => (
                      <li key={t} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                        <span className="mt-0.5 shrink-0 text-[var(--green)]">✓</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.weakTopics.length > 0 && (
                <div className="rounded-[1.4rem] border border-[rgba(201,64,64,0.2)] bg-[rgba(201,64,64,0.06)] px-5 py-5">
                  <p className="eyebrow text-[var(--red)]">Áreas a reforzar</p>
                  <ul className="mt-3 space-y-2">
                    {data.weakTopics.map((t) => (
                      <li key={t} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                        <span className="mt-0.5 shrink-0 text-[var(--red)]">→</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.strongTopics.length === 0 && data.weakTopics.length === 0 && (
                <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/70 px-5 py-5">
                  <p className="text-sm text-[var(--ink-soft)]">Completa la evaluación para ver fortalezas y debilidades.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recomendaciones IA */}
        {data.recommendations.length > 0 && (
          <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
            <div className="flex items-center gap-3">
              <p className="eyebrow">Recomendaciones personalizadas</p>
              <span className="rounded-full border border-[rgba(10,126,126,0.2)] bg-[rgba(10,126,126,0.08)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--teal)]">
                IA
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {data.recommendations.map((rec, i) => (
                <div
                  key={i}
                  className="flex gap-4 rounded-xl border border-[var(--border)] bg-white/70 px-4 py-4"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--amber)] font-mono text-xs font-bold text-white">
                    {i + 1}
                  </div>
                  <p className="text-sm leading-7 text-[var(--ink)]">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recomendado para ti */}
        {hasDiagnostic && (
          <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
            <div className="flex items-center gap-3">
              <p className="eyebrow">Recomendado para ti</p>
              <span className="rounded-full border border-[rgba(10,126,126,0.2)] bg-[rgba(10,126,126,0.08)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--teal)]">
                IA · RAG
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Basado en tus resultados y los documentos de tu empresa
            </p>

            {recsLoading ? (
              <div className="mt-6 flex items-center gap-3 text-sm text-[var(--ink-soft)]">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--amber)] border-t-transparent" />
                Generando recomendaciones personalizadas...
              </div>
            ) : recommendations.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--ink-soft)]">
                No se pudieron generar recomendaciones. Intenta más tarde.
              </p>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {recommendations.map((rec) => {
                  const prio = PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.Bajo;
                  return (
                    <div
                      key={rec.topicKey}
                      className={`flex flex-col gap-3 rounded-xl border px-5 py-4 ${prio.border} ${prio.bg}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-bold leading-snug text-[var(--ink)]">
                          {rec.title}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${prio.color} border ${prio.border}`}
                        >
                          {rec.priority}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        {rec.topicLabel}
                      </p>
                      <p className="text-sm leading-6 text-[var(--ink-muted)]">{rec.summary}</p>
                      <button
                        className="mt-1 self-start rounded-xl border border-[var(--border)] bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--amber)] hover:text-white"
                        onClick={() =>
                          router.push(
                            `/chat?q=${encodeURIComponent(rec.suggestedPrompt)}`
                          )
                        }
                      >
                        💬 Consultar con el chatbot →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-center pb-4">
          <button className="ghost-button !px-8" onClick={() => router.push("/chat")}>
            ← Volver al chat
          </button>
        </div>
        </div>
        </div>
      </section>
    </main>
  );
}
