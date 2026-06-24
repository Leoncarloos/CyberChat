"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { diagnosticTopics, totalQuestions } from "@/lib/diagnosticQuestions";

type Step = "intro" | number | "results";

type TopicPerformance = Record<string, { correct: number; total: number }>;

export default function DiagnosticPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [step, setStep] = useState<Step>("intro");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      if (data.user.user_metadata?.diagnostic_done === true) {
        router.push("/chat");
        return;
      }
      setIsCheckingAuth(false);
    })();
  }, [router, supabase]);

  function selectAnswer(questionId: string, optionIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  function canAdvance() {
    if (step === "intro") return true;
    if (typeof step !== "number") return false;
    const topic = diagnosticTopics[step];
    return topic.questions.every((q) => answers[q.id] !== undefined);
  }

  function advance() {
    if (step === "intro") {
      setStep(0);
      return;
    }
    if (typeof step === "number") {
      if (step < diagnosticTopics.length - 1) {
        setStep(step + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setStep("results");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }

  function computeResults(): { score: number; topicsPerformance: TopicPerformance } {
    let score = 0;
    const topicsPerformance: TopicPerformance = {};

    for (const topic of diagnosticTopics) {
      let correct = 0;
      for (const q of topic.questions) {
        if (answers[q.id] === q.correctIndex) {
          correct++;
          score++;
        }
      }
      topicsPerformance[topic.key] = { correct, total: topic.questions.length };
    }

    return { score, topicsPerformance };
  }

  async function submitDiagnostic() {
    setIsSubmitting(true);
    const { score, topicsPerformance } = computeResults();

    const res = await fetch("/api/diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, total: totalQuestions, topicsPerformance }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert("Error al guardar resultados: " + (data.error ?? "desconocido"));
      setIsSubmitting(false);
      return;
    }

    await supabase.auth.refreshSession();
    router.push("/chat");
  }

  if (isCheckingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
        <div className="animate-pulse text-[var(--muted)]">Verificando sesión...</div>
      </main>
    );
  }

  const { score, topicsPerformance } = step === "results" ? computeResults() : { score: 0, topicsPerformance: {} };
  const answeredCount = Object.keys(answers).length;
  const progressPct = Math.round((answeredCount / totalQuestions) * 100);

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(26,21,16,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(26,21,16,0.025)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      <header className="relative z-10 border-b border-[var(--border)] bg-[rgba(245,240,232,0.88)] px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="brand-mark !h-10 !w-10 !rounded-full !text-xs">C</div>
            <div>
              <p className="display-title text-xl font-bold">CyberChat</p>
              <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--muted)]">
                EVALUACIÓN DIAGNÓSTICA INICIAL
              </p>
            </div>
          </div>

          {step !== "intro" && step !== "results" && (
            <div className="flex items-center gap-3">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--paper-3)]">
                <div
                  className="h-full rounded-full bg-[var(--amber)] transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="font-mono text-[11px] text-[var(--muted)]">
                {answeredCount}/{totalQuestions}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-10">
        {step === "intro" && <IntroScreen onStart={advance} />}

        {typeof step === "number" && (
          <TopicScreen
            topicIndex={step}
            totalTopics={diagnosticTopics.length}
            answers={answers}
            onSelect={selectAnswer}
            onNext={advance}
            canAdvance={canAdvance()}
          />
        )}

        {step === "results" && (
          <ResultsScreen
            score={score}
            total={totalQuestions}
            topicsPerformance={topicsPerformance}
            isSubmitting={isSubmitting}
            onEnter={submitDiagnostic}
          />
        )}
      </div>
    </main>
  );
}

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-[var(--amber)] text-4xl text-white shadow-[0_16px_36px_rgba(232,117,10,0.28)]">
        🛡️
      </div>
      <h1 className="display-title text-6xl font-black leading-none">
        Evaluación <span className="text-[var(--amber)] italic">diagnóstica</span>
      </h1>
      <p className="mt-6 text-xl leading-9 text-[var(--muted)]">
        Antes de acceder a la plataforma necesitamos conocer tu nivel actual en ciberseguridad. Esta evaluación es obligatoria, toma unos minutos y solo se realiza una vez.
      </p>

      <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
        {[
          { icon: "📋", label: "16 preguntas", desc: "8 temáticas, 2 preguntas cada una" },
          { icon: "⏱️", label: "~10 minutos", desc: "Responde a tu propio ritmo" },
          { icon: "🔒", label: "Una sola vez", desc: "Los resultados se guardan automáticamente" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-[var(--border)] bg-white px-5 py-5 shadow-[0_6px_18px_rgba(26,21,16,0.07)]"
          >
            <div className="mb-2 text-3xl">{item.icon}</div>
            <div className="font-bold text-[var(--ink)]">{item.label}</div>
            <div className="mt-1 text-sm text-[var(--muted)]">{item.desc}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-[rgba(232,117,10,0.2)] bg-[rgba(232,117,10,0.06)] px-5 py-4 text-sm leading-7 text-[var(--ink)]">
        <strong>IMPORTANTE:</strong> No puedes acceder al chatbot, evaluaciones ni gestión hasta completar esta evaluación. No abandones la página antes de enviar tus respuestas.
      </div>

      <button
        className="primary-button mt-8 !px-10 !py-4 !text-base"
        onClick={onStart}
      >
        Comenzar evaluación →
      </button>
    </div>
  );
}

function TopicScreen({
  topicIndex,
  totalTopics,
  answers,
  onSelect,
  onNext,
  canAdvance,
}: {
  topicIndex: number;
  totalTopics: number;
  answers: Record<string, number>;
  onSelect: (questionId: string, optionIndex: number) => void;
  onNext: () => void;
  canAdvance: boolean;
}) {
  const topic = diagnosticTopics[topicIndex];
  const isLast = topicIndex === totalTopics - 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex gap-1.5">
          {Array.from({ length: totalTopics }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-8 rounded-full transition-all ${
                i < topicIndex
                  ? "bg-[var(--amber)]"
                  : i === topicIndex
                  ? "bg-[var(--amber-dim)] w-12"
                  : "bg-[var(--paper-3)]"
              }`}
            />
          ))}
        </div>
        <span className="font-mono text-[11px] text-[var(--muted)]">
          Temática {topicIndex + 1} de {totalTopics}
        </span>
      </div>

      <div className="rounded-[1.6rem] border border-[var(--border)] bg-white px-6 py-6 shadow-[0_12px_28px_rgba(26,21,16,0.08)]">
        <p className="eyebrow text-[var(--amber-dim)]">{topic.label}</p>
        <h2 className="display-title mt-2 text-4xl font-black leading-none">
          {topic.label}
        </h2>
      </div>

      {topic.questions.map((q, qi) => {
        const selected = answers[q.id];
        return (
          <div
            key={q.id}
            className="rounded-[1.5rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]"
          >
            <p className="eyebrow">Pregunta {qi + 1}</p>
            <h3 className="display-title mt-2 text-2xl font-black leading-snug">
              {q.question}
            </h3>

            <div className="mt-5 grid gap-3">
              {q.options.map((option, oi) => (
                <button
                  key={oi}
                  onClick={() => onSelect(q.id, oi)}
                  className={`rounded-xl border px-4 py-4 text-left text-sm leading-7 text-[var(--ink)] transition ${
                    selected === oi
                      ? "border-[var(--amber)] bg-[rgba(232,117,10,0.08)]"
                      : "border-[var(--border)] bg-white hover:border-[var(--amber)]"
                  }`}
                >
                  <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-xs font-semibold">
                    {String.fromCharCode(65 + oi)}
                  </span>
                  {option}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex justify-end pt-2">
        <button
          className="primary-button !px-8 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onNext}
          disabled={!canAdvance}
        >
          {isLast ? "Ver resultados →" : "Siguiente temática →"}
        </button>
      </div>

      {!canAdvance && (
        <p className="text-center text-sm text-[var(--muted)]">
          Responde todas las preguntas para continuar.
        </p>
      )}
    </div>
  );
}

function ResultsScreen({
  score,
  total,
  topicsPerformance,
  isSubmitting,
  onEnter,
}: {
  score: number;
  total: number;
  topicsPerformance: TopicPerformance;
  isSubmitting: boolean;
  onEnter: () => void;
}) {
  const pct = Math.round((score / total) * 100);
  const level = pct >= 80 ? "Alto" : pct >= 50 ? "Medio" : "Básico";
  const levelColor =
    pct >= 80 ? "text-[var(--green)]" : pct >= 50 ? "text-[var(--amber-dim)]" : "text-[var(--red)]";

  const strong = Object.entries(topicsPerformance)
    .filter(([, v]) => v.correct === v.total)
    .map(([k]) => diagnosticTopics.find((t) => t.key === k)?.label ?? k);

  const weak = Object.entries(topicsPerformance)
    .filter(([, v]) => v.correct < v.total)
    .map(([k]) => diagnosticTopics.find((t) => t.key === k)?.label ?? k);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-[1.6rem] border border-[var(--border)] bg-white px-8 py-8 text-center shadow-[0_12px_28px_rgba(26,21,16,0.08)]">
        <p className="eyebrow">Resultado diagnóstico</p>
        <div className={`display-title mt-4 text-8xl font-black ${levelColor}`}>
          {pct}%
        </div>
        <p className="mt-2 text-2xl font-bold text-[var(--ink)]">
          {score} de {total} respuestas correctas
        </p>
        <div className={`mt-3 font-mono text-sm uppercase tracking-[0.2em] ${levelColor}`}>
          Nivel: {level}
        </div>

        <div className="mx-auto mt-6 h-3 max-w-sm overflow-hidden rounded-full bg-[var(--paper-3)]">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              pct >= 80 ? "bg-[var(--green)]" : pct >= 50 ? "bg-[var(--amber)]" : "bg-[var(--red)]"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {strong.length > 0 && (
          <div className="rounded-[1.4rem] border border-[rgba(46,125,82,0.2)] bg-[rgba(46,125,82,0.06)] px-5 py-5">
            <p className="eyebrow text-[var(--green)]">Fortalezas</p>
            <ul className="mt-3 space-y-2">
              {strong.map((label) => (
                <li key={label} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                  <span className="mt-0.5 text-[var(--green)]">✓</span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {weak.length > 0 && (
          <div className="rounded-[1.4rem] border border-[rgba(201,64,64,0.2)] bg-[rgba(201,64,64,0.06)] px-5 py-5">
            <p className="eyebrow text-[var(--red)]">Áreas a reforzar</p>
            <ul className="mt-3 space-y-2">
              {weak.map((label) => (
                <li key={label} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                  <span className="mt-0.5 text-[var(--red)]">→</span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/80 px-5 py-5 shadow-[0_8px_20px_rgba(26,21,16,0.06)]">
        <p className="eyebrow">Detalle por temática</p>
        <div className="mt-4 space-y-3">
          {diagnosticTopics.map((topic) => {
            const perf = topicsPerformance[topic.key];
            if (!perf) return null;
            const topicPct = Math.round((perf.correct / perf.total) * 100);
            return (
              <div key={topic.key} className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-[var(--ink)]">
                      {topic.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--muted)]">
                      {perf.correct}/{perf.total}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--paper-3)]">
                    <div
                      className={`h-full rounded-full ${
                        topicPct === 100
                          ? "bg-[var(--green)]"
                          : topicPct >= 50
                          ? "bg-[var(--amber)]"
                          : "bg-[var(--red)]"
                      }`}
                      style={{ width: `${topicPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[1.4rem] border border-[rgba(232,117,10,0.2)] bg-[rgba(232,117,10,0.07)] px-5 py-4 text-sm leading-7 text-[var(--ink)]">
        {pct >= 80
          ? "Buen nivel de partida. El agente CyberChat complementará tu conocimiento con información específica de tu empresa."
          : pct >= 50
          ? "Conocimiento intermedio. Usa el chat para reforzar las áreas marcadas como débiles — pregunta directamente sobre ellas."
          : "Conviene reforzar los fundamentos. El agente CyberChat está diseñado para ayudarte paso a paso desde el nivel básico."}
      </div>

      <div className="flex justify-center pb-4">
        <button
          className="primary-button !px-10 !py-4 !text-base disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={onEnter}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Guardando..." : "Ingresar a la plataforma →"}
        </button>
      </div>
    </div>
  );
}
