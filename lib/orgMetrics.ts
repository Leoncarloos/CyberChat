import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { diagnosticTopics } from "@/lib/diagnosticQuestions";

export type RiskLevel = "low" | "medium" | "high";
export type Period = "week" | "month" | "quarter" | "all";

type TopicPerf = { correct: number; total: number };
type TopicPerformance = Record<string, TopicPerf>;

type DiagRow = {
  user_id: string;
  score: number;
  total: number;
  topics_performance: TopicPerformance;
  completed_at: string;
};

type QuizRow = {
  user_id: string;
  score: number;
  total: number;
  taken_at: string;
};

type ConvRow = { id: string; user_id: string };

type AttemptRow = {
  user_id: string;
  test_type: "posttest" | "recurrente";
  score: number;
  total: number;
  topics_performance: TopicPerformance;
  taken_at: string;
};

const RECURRENCE_DAYS = 5;

export type TopicAvg = { key: string; label: string; avgPct: number; count: number };

export type PriorityEmployee = {
  id: string;
  fullName: string;
  email: string;
  status: "active" | "pending" | "rejected";
  riskLevel: RiskLevel;
  diagnosticPct: number | null;
  postTestPct: number | null;
  worstTopicKey: string;
  worstTopicLabel: string;
  lastEvaluationDate: string | null;
};

export type EmployeeExportRow = {
  fullName: string;
  email: string;
  status: "active" | "pending" | "rejected";
  diagnosticPct: number | null;
  postTestPct: number | null;
  riskLevel: RiskLevel | null;
  worstTopicLabel: string;
  lastEvaluationDate: string | null;
  topicsPct: Record<string, number | null>;
};

export type RecurringMetrics = {
  // Promedio de la evaluación recurrente más reciente por empleado.
  avgLatestPct: number | null;
  // Delta vs. el intento recurrente anterior de cada empleado (promedio de deltas).
  avgDeltaPP: number | null;
  employeesUpToDate: number;
  employeesOverdue: number;
  employeesNotStarted: number;
  // % de empleados al día entre los que ya iniciaron el ciclo de evaluación.
  upToDateRate: number | null;
  // Áreas críticas agregadas del último intento con detalle por tema de cada empleado.
  criticalTopics: TopicAvg[];
};

export type OrgMetrics = {
  empty: boolean;
  ruc: string;
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
  // Índice agregado de concientización: promedio de la última evaluación por empleado.
  overallAwarenessPct: number | null;
  // % de empleados en "zona de cumplimiento" (última evaluación >= 50%).
  complianceRate: number | null;
  // Comparativa contra el período anterior del mismo tamaño.
  periodComparison: {
    period: Period;
    currentAvg: number | null;
    previousAvg: number | null;
    deltaPP: number | null;
  };
  topicsAvg: TopicAvg[];
  weakestTopics: TopicAvg[];
  riskDistribution: Record<RiskLevel, number>;
  chatbotUsage: { totalQueries: number };
  priorityEmployees: PriorityEmployee[];
  allEmployees: EmployeeExportRow[];
  recurring: RecurringMetrics;
};

const TOPIC_LABELS: Record<string, string> = Object.fromEntries(
  diagnosticTopics.map((t) => [t.key, t.label])
);

const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

export function pct(score: number, total: number) {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

export function riskLevel(p: number): RiskLevel {
  if (p >= 75) return "low";
  if (p >= 50) return "medium";
  return "high";
}

function riskOrder(r: RiskLevel) {
  return r === "high" ? 0 : r === "medium" ? 1 : 2;
}

function worstTopic(topicsPerf: TopicPerformance): string {
  let key = "";
  let worst = Infinity;
  for (const [k, v] of Object.entries(topicsPerf)) {
    const p = v.total > 0 ? v.correct / v.total : 1;
    if (p < worst) { worst = p; key = k; }
  }
  return key;
}

function avg(arr: number[]) {
  return arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
}

export function emptyMetrics(ruc: string): OrgMetrics {
  return {
    empty: true,
    ruc,
    totals: { employees: 0, active: 0, pending: 0, rejected: 0, completedDiagnostic: 0, completionRate: 0 },
    scores: { avgDiagnostic: null, avgPostTest: null, improvement: null },
    overallAwarenessPct: null,
    complianceRate: null,
    periodComparison: { period: "month", currentAvg: null, previousAvg: null, deltaPP: null },
    topicsAvg: [],
    weakestTopics: [],
    riskDistribution: { low: 0, medium: 0, high: 0 },
    chatbotUsage: { totalQueries: 0 },
    priorityEmployees: [],
    allEmployees: [],
    recurring: {
      avgLatestPct: null,
      avgDeltaPP: null,
      employeesUpToDate: 0,
      employeesOverdue: 0,
      employeesNotStarted: 0,
      upToDateRate: null,
      criticalTopics: [],
    },
  };
}

// Compara el promedio de la última evaluación por empleado entre el período
// actual y el período anterior del mismo tamaño (semana/mes/trimestre).
function computePeriodComparison(
  period: Period,
  latestEval: Map<string, { pct: number; date: string }>
): OrgMetrics["periodComparison"] {
  if (period === "all") {
    return { period, currentAvg: null, previousAvg: null, deltaPP: null };
  }
  const days = PERIOD_DAYS[period];
  const now = Date.now();
  const curStart = now - days * 86400000;
  const prevStart = now - 2 * days * 86400000;

  const current: number[] = [];
  const previous: number[] = [];
  for (const ev of latestEval.values()) {
    const t = new Date(ev.date).getTime();
    if (t >= curStart) current.push(ev.pct);
    else if (t >= prevStart) previous.push(ev.pct);
  }
  const currentAvg = avg(current);
  const previousAvg = avg(previous);
  const deltaPP =
    currentAvg !== null && previousAvg !== null ? currentAvg - previousAvg : null;
  return { period, currentAvg, previousAvg, deltaPP };
}

export async function computeOrgMetrics(
  adminRuc: string,
  period: Period = "month"
): Promise<OrgMetrics> {
  const admin = supabaseAdmin();

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const allUsers = usersData?.users ?? [];

  type EmpUser = { id: string; email: string; fullName: string; status: PriorityEmployee["status"] };
  const employees: EmpUser[] = allUsers
    .filter((u) => {
      const m = u.user_metadata ?? {};
      return m.role === "employee" && m.ruc === adminRuc;
    })
    .map((u) => {
      const m = u.user_metadata ?? {};
      const firstName = String(m.first_name ?? "").trim();
      const lastName = String(m.last_name ?? "").trim();
      const fullName = String(m.full_name ?? "").trim() || `${firstName} ${lastName}`.trim() || "Sin nombre";
      const rawStatus = m.approval_status;
      const status: EmpUser["status"] =
        rawStatus === "active" || rawStatus === "rejected" ? rawStatus : "pending";
      return { id: u.id, email: u.email ?? "", fullName, status };
    });

  const employeeIds = employees.map((e) => e.id);
  if (employeeIds.length === 0) return emptyMetrics(adminRuc);

  const [diagRes, quizRes, attemptsRes, convsRes] = await Promise.all([
    admin
      .from("diagnostic_results")
      .select("user_id, score, total, topics_performance, completed_at")
      .in("user_id", employeeIds),
    admin
      .from("quiz_results")
      .select("user_id, score, total, taken_at")
      .in("user_id", employeeIds),
    admin
      .from("evaluation_attempts")
      .select("user_id, test_type, score, total, topics_performance, taken_at")
      .in("user_id", employeeIds),
    admin
      .from("conversations")
      .select("id, user_id")
      .in("user_id", employeeIds),
  ]);

  const diagnostics = (diagRes.data ?? []) as DiagRow[];
  const quizzes = (quizRes.data ?? []) as QuizRow[];
  const attempts = (attemptsRes.data ?? []) as AttemptRow[];
  const conversations = (convsRes.data ?? []) as ConvRow[];

  const convIds = conversations.map((c) => c.id);
  let totalQueries = 0;
  if (convIds.length > 0) {
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", convIds)
      .eq("role", "user");
    totalQueries = count ?? 0;
  }

  const latestDiag = new Map<string, DiagRow>();
  for (const d of diagnostics) {
    const cur = latestDiag.get(d.user_id);
    if (!cur || d.completed_at > cur.completed_at) latestDiag.set(d.user_id, d);
  }

  const latestQuiz = new Map<string, QuizRow>();
  for (const q of quizzes) {
    const cur = latestQuiz.get(q.user_id);
    if (!cur || q.taken_at > cur.taken_at) latestQuiz.set(q.user_id, q);
  }

  const completedDiagnostic = [...new Set(diagnostics.map((d) => d.user_id))].filter((id) =>
    employeeIds.includes(id)
  ).length;
  const activeCount = employees.filter((e) => e.status === "active").length;
  const completionRate = activeCount > 0 ? Math.round((completedDiagnostic / activeCount) * 100) : 0;

  const diagPcts = [...latestDiag.values()].map((d) => pct(d.score, d.total));
  const quizPcts = [...latestQuiz.values()].map((q) => pct(q.score, q.total));

  const avgDiagnostic = avg(diagPcts);
  const avgPostTest = avg(quizPcts);
  const improvement =
    avgDiagnostic !== null && avgPostTest !== null ? avgPostTest - avgDiagnostic : null;

  // Última evaluación por empleado (post-test si existe, si no diagnóstico).
  const latestEval = new Map<string, { pct: number; date: string }>();
  for (const emp of employees) {
    const quiz = latestQuiz.get(emp.id);
    const diag = latestDiag.get(emp.id);
    if (quiz) latestEval.set(emp.id, { pct: pct(quiz.score, quiz.total), date: quiz.taken_at });
    else if (diag) latestEval.set(emp.id, { pct: pct(diag.score, diag.total), date: diag.completed_at });
  }
  const evalPcts = [...latestEval.values()].map((e) => e.pct);
  const overallAwarenessPct = avg(evalPcts);
  const complianceRate =
    evalPcts.length > 0
      ? Math.round((evalPcts.filter((p) => p >= 50).length / evalPcts.length) * 100)
      : null;

  const periodComparison = computePeriodComparison(period, latestEval);

  const topicsSum: Record<string, { correctSum: number; totalSum: number; count: number }> = {};
  for (const d of latestDiag.values()) {
    for (const [k, v] of Object.entries(d.topics_performance ?? {})) {
      if (!topicsSum[k]) topicsSum[k] = { correctSum: 0, totalSum: 0, count: 0 };
      topicsSum[k].correctSum += v.correct;
      topicsSum[k].totalSum += v.total;
      topicsSum[k].count++;
    }
  }

  const topicsAvg: TopicAvg[] = diagnosticTopics.map((t) => {
    const s = topicsSum[t.key];
    return {
      key: t.key,
      label: t.label,
      avgPct: s && s.totalSum > 0 ? Math.round((s.correctSum / s.totalSum) * 100) : 0,
      count: s?.count ?? 0,
    };
  });

  const weakestTopics = [...topicsAvg].filter((t) => t.count > 0).sort((a, b) => a.avgPct - b.avgPct).slice(0, 3);

  const riskDist: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0 };
  for (const emp of employees) {
    const ev = latestEval.get(emp.id);
    if (ev) riskDist[riskLevel(ev.pct)]++;
  }

  // HU22 — métricas de evaluación recurrente.
  const attemptsByUser = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const list = attemptsByUser.get(a.user_id) ?? [];
    list.push(a);
    attemptsByUser.set(a.user_id, list);
  }
  for (const list of attemptsByUser.values()) {
    list.sort((a, b) => (a.taken_at > b.taken_at ? -1 : 1));
  }

  let upToDate = 0;
  let overdue = 0;
  let notStarted = 0;
  const latestRecurrentePcts: number[] = [];
  const deltas: number[] = [];
  const criticalSum: Record<string, { correctSum: number; totalSum: number; count: number }> = {};

  for (const emp of employees) {
    if (emp.status !== "active") continue;
    const userAttempts = attemptsByUser.get(emp.id) ?? [];
    const lastQuiz = latestQuiz.get(emp.id);
    const lastDate = userAttempts[0]?.taken_at ?? lastQuiz?.taken_at ?? null;

    if (!lastDate) {
      notStarted++;
      continue;
    }
    const days = (Date.now() - new Date(lastDate).getTime()) / 86400000;
    if (days >= RECURRENCE_DAYS) overdue++;
    else upToDate++;

    const recurrentes = userAttempts.filter((a) => a.test_type === "recurrente");
    if (recurrentes.length > 0) {
      latestRecurrentePcts.push(pct(recurrentes[0].score, recurrentes[0].total));
      if (recurrentes.length > 1) {
        deltas.push(
          pct(recurrentes[0].score, recurrentes[0].total) -
            pct(recurrentes[1].score, recurrentes[1].total)
        );
      }
    }

    const latestWithTopics = userAttempts.find(
      (a) => Object.keys(a.topics_performance ?? {}).length > 0
    );
    if (latestWithTopics) {
      for (const [k, v] of Object.entries(latestWithTopics.topics_performance)) {
        if (!criticalSum[k]) criticalSum[k] = { correctSum: 0, totalSum: 0, count: 0 };
        criticalSum[k].correctSum += v.correct;
        criticalSum[k].totalSum += v.total;
        criticalSum[k].count++;
      }
    }
  }

  const criticalTopics: TopicAvg[] = diagnosticTopics
    .map((t) => {
      const s = criticalSum[t.key];
      return {
        key: t.key,
        label: t.label,
        avgPct: s && s.totalSum > 0 ? Math.round((s.correctSum / s.totalSum) * 100) : -1,
        count: s?.count ?? 0,
      };
    })
    .filter((t) => t.count > 0 && t.avgPct >= 0)
    .sort((a, b) => a.avgPct - b.avgPct)
    .slice(0, 3);

  const started = upToDate + overdue;
  const recurring: RecurringMetrics = {
    avgLatestPct: avg(latestRecurrentePcts),
    avgDeltaPP: deltas.length > 0 ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null,
    employeesUpToDate: upToDate,
    employeesOverdue: overdue,
    employeesNotStarted: notStarted,
    upToDateRate: started > 0 ? Math.round((upToDate / started) * 100) : null,
    criticalTopics,
  };

  const priorityEmployees: PriorityEmployee[] = employees
    .filter((e) => latestDiag.has(e.id))
    .map((e) => {
      const diag = latestDiag.get(e.id)!;
      const quiz = latestQuiz.get(e.id);
      const currentPct = quiz ? pct(quiz.score, quiz.total) : pct(diag.score, diag.total);
      const risk = riskLevel(currentPct);
      const topicKey = worstTopic(diag.topics_performance ?? {});
      return {
        id: e.id,
        fullName: e.fullName,
        email: e.email,
        status: e.status,
        riskLevel: risk,
        diagnosticPct: pct(diag.score, diag.total),
        postTestPct: quiz ? pct(quiz.score, quiz.total) : null,
        worstTopicKey: topicKey,
        worstTopicLabel: TOPIC_LABELS[topicKey] ?? topicKey,
        lastEvaluationDate: quiz ? quiz.taken_at : diag.completed_at,
      };
    })
    .sort((a, b) => {
      const ro = riskOrder(a.riskLevel) - riskOrder(b.riskLevel);
      if (ro !== 0) return ro;
      return (a.diagnosticPct ?? 100) - (b.diagnosticPct ?? 100);
    })
    .slice(0, 15);

  const allEmployees: EmployeeExportRow[] = employees
    .map((e) => {
      const diag = latestDiag.get(e.id);
      const quiz = latestQuiz.get(e.id);
      const diagnosticPct = diag ? pct(diag.score, diag.total) : null;
      const postTestPct = quiz ? pct(quiz.score, quiz.total) : null;
      const currentPct = postTestPct ?? diagnosticPct;
      const topicKey = diag ? worstTopic(diag.topics_performance ?? {}) : "";
      const topicsPct: Record<string, number | null> = {};
      for (const t of diagnosticTopics) {
        const perf = diag?.topics_performance?.[t.key];
        topicsPct[t.key] = perf ? pct(perf.correct, perf.total) : null;
      }
      return {
        fullName: e.fullName,
        email: e.email,
        status: e.status,
        diagnosticPct,
        postTestPct,
        riskLevel: currentPct !== null ? riskLevel(currentPct) : null,
        worstTopicLabel: topicKey ? TOPIC_LABELS[topicKey] ?? topicKey : "--",
        lastEvaluationDate: quiz ? quiz.taken_at : diag ? diag.completed_at : null,
        topicsPct,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    empty: false,
    ruc: adminRuc,
    totals: {
      employees: employees.length,
      active: activeCount,
      pending: employees.filter((e) => e.status === "pending").length,
      rejected: employees.filter((e) => e.status === "rejected").length,
      completedDiagnostic,
      completionRate,
    },
    scores: { avgDiagnostic, avgPostTest, improvement },
    overallAwarenessPct,
    complianceRate,
    periodComparison,
    topicsAvg,
    weakestTopics,
    riskDistribution: riskDist,
    chatbotUsage: { totalQueries },
    priorityEmployees,
    allEmployees,
    recurring,
  };
}
