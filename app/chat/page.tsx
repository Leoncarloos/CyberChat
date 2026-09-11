"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  addMessage,
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  renameConversation,
} from "@/lib/db";

type Conversation = { id: string; title: string; created_at: string; user_id: string };
type StoredMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };
type SourceItem = { rank: number; similarity: number; preview: string };
type AssistantMeta = {
  matchesCount: number;
  bestSimilarity: number;
  usedContext: boolean;
  sources: SourceItem[];
};
type UiMessage = StoredMessage & {
  meta?: AssistantMeta;
};
type ChatApiResponse = {
  answer?: string;
  matchesCount?: number;
  bestSimilarity?: number;
  usedContext?: boolean;
  sources?: SourceItem[];
  error?: string;
};
type ModuleKey = "chat" | "evaluations";
type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; msg: string };
type QuizQuestion = {
  id?: string;
  topicKey?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};
type TestType = "posttest" | "recurrente";
type RecurringStatus = {
  due: boolean;
  blocking?: boolean;
  daysSince?: number;
  nextDueAt?: string;
  reason?: string;
};
type KnowledgeLevel = "bajo" | "medio" | "alto";
type ProgressStatus = "pendiente" | "en_progreso" | "completado";
type LearningTopic = {
  key: string;
  label: string;
  icon: string;
  starterPrompt: string;
  level: KnowledgeLevel;
  pct: number | null;
  isWeak: boolean;
  status: ProgressStatus;
};
type LearningPathResponse = {
  hasData: boolean;
  path: LearningTopic[];
  shortcuts: LearningTopic[];
};

const LEVEL_BADGE: Record<KnowledgeLevel, { label: string; cls: string }> = {
  bajo: { label: "Nivel bajo", cls: "border-[rgba(201,64,64,0.28)] bg-[rgba(201,64,64,0.1)] text-[var(--red)]" },
  medio: { label: "Nivel medio", cls: "border-[rgba(232,117,10,0.28)] bg-[rgba(232,117,10,0.1)] text-[var(--amber-dim)]" },
  alto: { label: "Nivel alto", cls: "border-[rgba(46,125,82,0.28)] bg-[rgba(46,125,82,0.1)] text-[var(--green)]" },
};

const STATUS_BADGE: Record<ProgressStatus, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "border-[var(--border)] bg-[var(--paper-3)] text-[var(--ink-soft)]" },
  en_progreso: { label: "En progreso", cls: "border-[rgba(232,117,10,0.28)] bg-[rgba(232,117,10,0.1)] text-[var(--amber-dim)]" },
  completado: { label: "Completado", cls: "border-[rgba(46,125,82,0.28)] bg-[rgba(46,125,82,0.1)] text-[var(--green)]" },
};

const quickPrompts = [
  {
    icon: "⚠️",
    title: "Amenazas más comunes en MYPES",
    hint: "Phishing, ransomware, fraudes",
    prompt: "¿Cuáles son las amenazas de ciberseguridad más comunes para una MYPE peruana?",
  },
  {
    icon: "🚀",
    title: "Plan de seguridad exprés",
    hint: "5 pasos para empezar hoy",
    prompt: "Dame un plan rápido de 5 pasos para mejorar la ciberseguridad de mi empresa.",
  },
  {
    icon: "🔎",
    title: "¿Fui hackeado sin saberlo?",
    hint: "Señales de alerta a detectar",
    prompt: "¿Cómo saber si mi empresa ya fue hackeada sin darme cuenta?",
  },
];

const quizQuestions: QuizQuestion[] = [
  {
    question: "¿Cuál es la señal más común de un correo de phishing?",
    options: [
      "Tiene muchos colores llamativos",
      "Pide actuar con urgencia y solicita datos o clics",
      "Llega temprano en la mañana",
      "Incluye el logo del banco",
    ],
    correctIndex: 1,
    explanation:
      "Los correos de phishing suelen crear urgencia para presionarte a hacer clic o revelar información.",
  },
  {
    question: "¿Qué práctica protege mejor los archivos importantes de una MYPE?",
    options: [
      "Guardar todo en una sola laptop",
      "Respaldar con la regla 3-2-1",
      "Confiar solo en el antivirus",
      "Cambiar de carpeta cada semana",
    ],
    correctIndex: 1,
    explanation:
      "La regla 3-2-1 reduce el riesgo de pérdida por errores humanos, fallos o ransomware.",
  },
  {
    question: "Si un empleado sospecha que fue hackeado, ¿qué debe hacer primero?",
    options: [
      "Seguir trabajando mientras observa",
      "Apagar todo y borrar archivos",
      "Desconectarse de la red y avisar al responsable",
      "Publicarlo en redes sociales",
    ],
    correctIndex: 2,
    explanation:
      "Aislar el equipo y reportarlo rápido ayuda a contener el incidente antes de que se expanda.",
  },
  {
    question: "¿Qué contraseña es más segura?",
    options: ["empresa123", "admin2024", "k#9Lp@2qR!mN", "peru2025"],
    correctIndex: 2,
    explanation:
      "Una contraseña larga y aleatoria es mucho más resistente que combinaciones predecibles.",
  },
  {
    question: "¿Cómo deben gestionarse los accesos de un empleado que deja la empresa?",
    options: [
      "Dejar la cuenta activa por si regresa",
      "Revocar accesos y cambiar credenciales compartidas de inmediato",
      "Avisarle que ya no puede entrar, sin más cambios",
      "Esperar al cierre de mes para desactivarla",
    ],
    correctIndex: 1,
    explanation:
      "Revocar accesos apenas termina la relación laboral evita que credenciales antiguas se usen para acceder sin autorización.",
  },
  {
    question: "Según la Ley 29733 de Protección de Datos Personales, ¿qué debe hacer una MYPE con los datos de sus clientes?",
    options: [
      "Compartirlos libremente con cualquier proveedor",
      "Guardarlos indefinidamente sin control",
      "Tratarlos con consentimiento del titular y medidas de seguridad adecuadas",
      "Publicarlos para fines de marketing sin aviso",
    ],
    correctIndex: 2,
    explanation:
      "La ley exige consentimiento informado y medidas de seguridad razonables para proteger los datos personales de clientes y empleados.",
  },
  {
    question: "¿Cuál es una buena práctica para la red WiFi de una MYPE?",
    options: [
      "Usar la misma red para clientes y para sistemas administrativos",
      "Separar la red de invitados de la red interna del negocio",
      "Dejar la red sin contraseña para mayor comodidad",
      "Compartir la contraseña del WiFi en redes sociales",
    ],
    correctIndex: 1,
    explanation:
      "Separar la red de invitados de la red interna evita que un dispositivo externo comprometido acceda a sistemas críticos del negocio.",
  },
  {
    question: "Un cliente reporta que recibió un mensaje pidiendo pagar por WhatsApp a un número distinto al oficial de la empresa. ¿Qué tipo de riesgo es este?",
    options: [
      "Un error de facturación normal",
      "Fraude por suplantación de identidad (phishing dirigido al cliente)",
      "Un problema del banco del cliente",
      "Una promoción legítima de la empresa",
    ],
    correctIndex: 1,
    explanation:
      "Los atacantes suplantan canales de venta digitales para engañar a los clientes; hay que alertar y usar solo canales oficiales verificados.",
  },
  {
    question: "¿Qué elemento agrega una capa extra de seguridad además de la contraseña?",
    options: [
      "Usar la misma contraseña en todas las cuentas",
      "La autenticación de doble factor (2FA)",
      "Compartir la contraseña solo con compañeros de confianza",
      "Cambiar la contraseña una vez al año",
    ],
    correctIndex: 1,
    explanation:
      "El doble factor de autenticación exige una segunda verificación, protegiendo la cuenta incluso si la contraseña es robada.",
  },
  {
    question: "Recibes una llamada de alguien que dice ser del área de soporte técnico y te pide tu contraseña para 'solucionar un problema'. ¿Qué haces?",
    options: [
      "Dar la contraseña porque dice ser de soporte",
      "Colgar y verificar la solicitud por un canal oficial de la empresa",
      "Dar una contraseña parecida pero no la real",
      "Pedirle que llame más tarde y dársela entonces",
    ],
    correctIndex: 1,
    explanation:
      "El soporte técnico legítimo nunca pide contraseñas por teléfono; esto es vishing, una técnica de ingeniería social.",
  },
];

function formatTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-PE", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInlineMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function renderAssistantHtml(text: string) {
  const normalized = text.replace(/\r/g, "");
  const lines = normalized.split("\n");
  const html: string[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) return;
    html.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    if (line.startsWith("### ")) {
      flushList();
      html.push(`<h3>${renderInlineMarkdown(escapeHtml(line.slice(4)))}</h3>`);
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      html.push(`<h3>${renderInlineMarkdown(escapeHtml(line.slice(3)))}</h3>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line) || line.startsWith("- ") || line.startsWith("* ")) {
      const item = line.replace(/^\d+\.\s+/, "").replace(/^[-*]\s+/, "");
      listItems.push(`<li>${renderInlineMarkdown(escapeHtml(item))}</li>`);
      continue;
    }

    flushList();

    if (line.startsWith("IMPORTANTE:") || line.startsWith("ALERTA:")) {
      html.push(
        `<div class="alert-block warning"><span>${renderInlineMarkdown(escapeHtml(line))}</span></div>`
      );
      continue;
    }

    if (line.startsWith("Consejo:")) {
      html.push(
        `<div class="alert-block tip"><span>${renderInlineMarkdown(escapeHtml(line))}</span></div>`
      );
      continue;
    }

    html.push(`<p>${renderInlineMarkdown(escapeHtml(line))}</p>`);
  }

  flushList();
  return html.join("");
}

function createEmptyAnswers() {
  return Array.from({ length: quizQuestions.length }, () => -1);
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--amber)] border-t-transparent" />
      </main>
    }>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey>("chat");
  const [quizAnswers, setQuizAnswers] = useState<number[]>(() => createEmptyAnswers());
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<QuizQuestion[] | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const quizFetchedRef = useRef(false);
  const [testType, setTestType] = useState<TestType>("posttest");
  const [recurringStatus, setRecurringStatus] = useState<RecurringStatus | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  const [learningPath, setLearningPath] = useState<LearningPathResponse | null>(null);
  const [learningLoading, setLearningLoading] = useState(true);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((tone: ToastTone, msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tone, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? "");
      setRole(typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "");

      const convRes = await listConversations(user.id);
      if (convRes.error) {
        console.error(convRes.error);
        return;
      }

      const convs = (convRes.data ?? []) as Conversation[];
      setConversations(convs);
      if (convs.length > 0) setActiveId(convs[0].id);

      const prefillQ = searchParams.get("q");
      if (prefillQ) {
        setInput(prefillQ);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    })();
  }, [router, supabase, searchParams]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      setLearningLoading(true);
      try {
        const res = await fetch("/api/learning-path");
        if (res.ok) setLearningPath((await res.json()) as LearningPathResponse);
      } catch {}
      setLearningLoading(false);
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      try {
        const res = await fetch("/api/recurring-test/status");
        if (!res.ok) return;
        const status = (await res.json()) as RecurringStatus;
        setRecurringStatus(status);
        if (status.due && status.blocking) {
          setActiveModule("evaluations");
        }
      } catch {}
    })();
  }, [userId]);

  const recurringBlocked = Boolean(
    recurringStatus?.due && recurringStatus.blocking && !quizSubmitted
  );
  const recurringReminder = Boolean(
    recurringStatus?.due && !recurringStatus.blocking && !quizSubmitted && !reminderDismissed
  );

  useEffect(() => {
    if (!activeId) return;

    void (async () => {
      const msgRes = await listMessages(activeId);
      if (msgRes.error) {
        console.error(msgRes.error);
        return;
      }

      const nextMessages = ((msgRes.data ?? []) as StoredMessage[]).map((message) => ({ ...message }));
      setMessages(nextMessages);
    })();
  }, [activeId]);

  useEffect(() => {
    if (!scrollRef.current || activeModule !== "chat") return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending, activeModule]);

  useEffect(() => {
    if (activeModule !== "evaluations" || quizFetchedRef.current) return;
    quizFetchedRef.current = true;
    void (async () => {
      setIsGeneratingQuiz(true);
      try {
        const res = await fetch("/api/posttest");
        const json = (await res.json()) as {
          questions?: QuizQuestion[];
          testType?: TestType;
          error?: string;
        };
        if (json.questions && json.questions.length > 0) {
          setGeneratedQuestions(json.questions);
          setQuizAnswers(Array.from({ length: json.questions.length }, () => -1));
          setTestType(json.testType ?? "posttest");
        }
      } catch {}
      setIsGeneratingQuiz(false);
    })();
  }, [activeModule]);

  async function handleNewConversation(prefill?: string) {
    if (!userId) return "";

    const res = await createConversation(userId);
    if (res.error) {
      toast("error", res.error.message);
      return "";
    }

    const newConv = res.data as Conversation;
    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConv.id);
    setMessages([]);
    setInput(prefill ?? "");
    return newConv.id;
  }

  function handleRenameConversation(conversation: Conversation) {
    setRenameTarget(conversation);
    setRenameValue(conversation.title);
  }

  async function saveRename() {
    if (!renameTarget) return;
    const target = renameTarget;
    const nextTitle = renameValue.trim();
    setRenameTarget(null);
    if (!nextTitle || nextTitle === target.title) return;

    const result = await renameConversation(target.id, nextTitle);
    if (result.error) {
      toast("error", result.error.message);
      return;
    }

    setConversations((prev) =>
      prev.map((item) => (item.id === target.id ? { ...item, title: nextTitle } : item))
    );
    toast("success", "Conversación renombrada");
  }

  function handleDeleteConversation(conversation: Conversation) {
    setDeleteTarget(conversation);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);

    const result = await deleteConversation(target.id);
    if (result.error) {
      toast("error", result.error.message);
      return;
    }

    const nextConversations = conversations.filter((item) => item.id !== target.id);
    setConversations(nextConversations);

    if (activeId === target.id) {
      setActiveId(nextConversations[0]?.id ?? "");
      setMessages([]);
    }
    toast("info", "Conversación eliminada");
  }

  async function sendPrompt(prompt?: string, forcedConversationId?: string) {
    const text = (prompt ?? input).trim();
    if (!text || isSending) return;

    let conversationId = forcedConversationId ?? activeId;
    if (!conversationId) {
      conversationId = await handleNewConversation();
      if (!conversationId) return;
    }

    setInput("");
    setIsSending(true);
    setActiveModule("chat");

    const userMsgRes = await addMessage(conversationId, "user", text);
    if (userMsgRes.error) {
      setIsSending(false);
      toast("error", userMsgRes.error.message);
      return;
    }

    const userMessage = userMsgRes.data as StoredMessage;
    // Conversación dirigida nueva: empieza sin historial previo.
    const priorHistory = forcedConversationId
      ? []
      : messages.map((message) => ({ role: message.role, content: message.content }));
    const historyForApi = [...priorHistory, { role: "user" as const, content: text }];

    setMessages((prev) => [...prev, userMessage]);

    const apiRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: historyForApi }),
    });

    const raw = await apiRes.text();
    let data: ChatApiResponse | null = null;
    try {
      data = raw ? (JSON.parse(raw) as ChatApiResponse) : null;
    } catch {}

    if (!apiRes.ok) {
      setIsSending(false);
      toast("error", data?.error ?? "Error al obtener respuesta del chat");
      return;
    }

    const reply = String(data?.answer ?? "");
    const assistantMeta: AssistantMeta = {
      matchesCount: Number(data?.matchesCount ?? 0),
      bestSimilarity: Number(data?.bestSimilarity ?? 0),
      usedContext: Boolean(data?.usedContext),
      sources: Array.isArray(data?.sources) ? data.sources : [],
    };

    const asstMsgRes = await addMessage(conversationId, "assistant", reply);
    setIsSending(false);

    if (asstMsgRes.error) {
      toast("error", asstMsgRes.error.message);
      return;
    }

    const assistantMessage = {
      ...(asstMsgRes.data as StoredMessage),
      meta: assistantMeta,
    };

    setMessages((prev) => [...prev, assistantMessage]);

    const currentConversation = conversations.find((item) => item.id === conversationId);
    if (currentConversation && currentConversation.title === "Nuevo chat") {
      const title = text.slice(0, 40);
      await renameConversation(conversationId, title);
      setConversations((prev) =>
        prev.map((item) => (item.id === conversationId ? { ...item, title } : item))
      );
    }
  }

  function markTopicProgress(topicKey: string, status: ProgressStatus) {
    setLearningPath((prev) => {
      if (!prev) return prev;
      const apply = (t: LearningTopic) =>
        t.key === topicKey ? { ...t, status } : t;
      return { ...prev, path: prev.path.map(apply), shortcuts: prev.shortcuts.map(apply) };
    });
    void fetch("/api/learning-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicKey, status }),
    });
  }

  async function startTopic(topic: LearningTopic) {
    if (isSending) return;
    setActiveModule("chat");
    const conversationId = await handleNewConversation();
    if (!conversationId) return;
    await renameConversation(conversationId, topic.label);
    setConversations((prev) =>
      prev.map((item) => (item.id === conversationId ? { ...item, title: topic.label } : item))
    );
    markTopicProgress(topic.key, "en_progreso");
    await sendPrompt(topic.starterPrompt, conversationId);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function selectQuizOption(questionIndex: number, optionIndex: number) {
    if (quizSubmitted) return;
    setQuizAnswers((prev) => prev.map((value, index) => (index === questionIndex ? optionIndex : value)));
  }

  function submitQuiz() {
    if (quizAnswers.some((value) => value === -1)) {
      toast("info", "Responde todas las preguntas antes de enviar.");
      return;
    }

    setQuizSubmitted(true);

    const score = activeQuestions.reduce(
      (n, q, i) => n + (quizAnswers[i] === q.correctIndex ? 1 : 0),
      0
    );

    const topicsPerformance: Record<string, { correct: number; total: number }> = {};
    activeQuestions.forEach((q, i) => {
      if (!q.topicKey) return;
      if (!topicsPerformance[q.topicKey]) topicsPerformance[q.topicKey] = { correct: 0, total: 0 };
      topicsPerformance[q.topicKey].total++;
      if (quizAnswers[i] === q.correctIndex) topicsPerformance[q.topicKey].correct++;
    });

    void fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score,
        total: activeQuestions.length,
        testType,
        topicsPerformance,
        questionIds: activeQuestions.map((q) => q.id).filter(Boolean),
      }),
    });

    // Escenario 4 — al superar el umbral, los temas en progreso pasan a completado.
    const passed = score >= Math.ceil(activeQuestions.length * 0.6);
    if (passed && learningPath) {
      learningPath.path
        .filter((t) => t.status === "en_progreso")
        .forEach((t) => markTopicProgress(t.key, "completado"));
    }
  }

  function resetQuiz() {
    const len = activeQuestions.length;
    setQuizAnswers(Array.from({ length: len }, () => -1));
    setQuizSubmitted(false);
  }

  const activeQuestions = generatedQuestions ?? quizQuestions;
  const queryCount = messages.filter((message) => message.role === "user").length;
  const quizScore = activeQuestions.reduce(
    (score, question, index) => score + (quizAnswers[index] === question.correctIndex ? 1 : 0),
    0
  );

  return (
    <main className="app-shell grid h-screen grid-cols-1 overflow-hidden bg-[var(--paper)] lg:grid-cols-[280px_1fr]">
      <aside className="flex flex-col overflow-hidden border-r border-[rgba(212,204,188,0.18)] bg-[var(--ink)] text-[var(--paper)]">
        <div className="border-b border-white/10 px-5 py-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="brand-mark !h-11 !w-11 !rounded-2xl">C</div>
            <div>
              <div className="display-title text-3xl font-black leading-none">CyberChat</div>
              <div className="mt-1 text-sm text-[rgba(245,240,232,0.55)]">Protección MYPE</div>
            </div>
          </div>
        </div>

        <div className="border-b border-white/8 px-4 py-4">
          <button
            className={`mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
              activeModule === "chat"
                ? "bg-[rgba(232,117,10,0.16)] text-[var(--amber-glow)]"
                : "text-[rgba(245,240,232,0.72)] hover:bg-white/6"
            }`}
            onClick={() => {
              if (recurringBlocked) {
                toast("info", "Completa tu evaluación recurrente para seguir usando el chat.");
                return;
              }
              setActiveModule("chat");
            }}
          >
            <span>💬</span>
            <span>Chat de IA</span>
          </button>
          <button
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
              activeModule === "evaluations"
                ? "bg-[rgba(232,117,10,0.16)] text-[var(--amber-glow)]"
                : "text-[rgba(245,240,232,0.72)] hover:bg-white/6"
            }`}
            onClick={() => setActiveModule("evaluations")}
          >
            <span>📝</span>
            <span>Evaluaciones</span>
          </button>
          <button
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-[rgba(245,240,232,0.72)] transition hover:bg-white/6"
            onClick={() => router.push("/dashboard")}
          >
            <span>📊</span>
            <span>Mi Dashboard</span>
          </button>
          {role === "admin" ? (
            <button
              className="mt-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-[rgba(245,240,232,0.72)] transition hover:bg-white/6"
              onClick={() => router.push("/manage")}
            >
              <span>↩</span>
              <span>Volver a gestión</span>
            </button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="eyebrow text-[rgba(245,240,232,0.35)]">Historial</p>
            <button className="ghost-button !px-3 !py-1.5 !text-[11px]" onClick={() => void handleNewConversation()}>
              Nuevo
            </button>
          </div>

          <div className="space-y-2">
            {conversations.length ? (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`rounded-xl border px-3 py-3 transition ${
                    conversation.id === activeId
                      ? "border-[rgba(232,117,10,0.28)] bg-[rgba(232,117,10,0.12)]"
                      : "border-white/6 bg-white/4"
                  }`}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => {
                      if (recurringBlocked) {
                        toast("info", "Completa tu evaluación recurrente para seguir usando el chat.");
                        return;
                      }
                      setActiveModule("chat");
                      setActiveId(conversation.id);
                    }}
                  >
                    <div className="truncate text-sm font-semibold text-[rgba(245,240,232,0.92)]">
                      {conversation.title}
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[rgba(245,240,232,0.38)]">
                      {formatTime(conversation.created_at)}
                    </div>
                  </button>

                  <div className="mt-3 flex gap-2">
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-sm text-[rgba(245,240,232,0.58)] transition hover:border-[var(--amber)] hover:text-[var(--amber-glow)]"
                      onClick={() => void handleRenameConversation(conversation)}
                      aria-label={`Renombrar ${conversation.title}`}
                    >
                      ✏
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-sm text-[rgba(245,240,232,0.58)] transition hover:border-[var(--red)] hover:text-[#ff9a9a]"
                      onClick={() => void handleDeleteConversation(conversation)}
                      aria-label={`Eliminar ${conversation.title}`}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-[rgba(245,240,232,0.56)]">
                Aún no tienes conversaciones guardadas.
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/8 px-5 py-4">
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(245,240,232,0.36)]">
              Usuario
            </div>
            <div className="mt-2 text-sm text-[rgba(245,240,232,0.76)]">{email || "sesión activa"}</div>
          </div>

          <div className="mt-3 flex gap-2">
            <div className="flex-1 rounded-xl bg-white/5 p-3 text-center">
              <div className="display-title text-2xl font-black text-[var(--amber-glow)]">{queryCount}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.35)]">
                Consultas
              </div>
            </div>
            <button className="ghost-button flex-1 !rounded-xl !py-3 !text-xs" onClick={logout}>
              Salir
            </button>
          </div>
        </div>
      </aside>

      <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--paper)]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(26,21,16,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(26,21,16,0.025)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(245,240,232,0.88)] px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="brand-mark !h-10 !w-10 !rounded-full !text-xs">C</div>
            <div>
              <p className="display-title text-2xl font-bold">
                {activeModule === "chat" ? "Agente CyberChat" : "Evaluaciones CyberChat"}
              </p>
              <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--ink-soft)]">
                {activeModule === "chat"
                  ? "Especialista en ciberseguridad para MYPES"
                  : "Test guiado para reforzar concientización"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {role === "admin" ? (
              <button className="ghost-button !px-4 !py-2 !text-xs" onClick={() => router.push("/manage")}>
                Volver a gestión
              </button>
            ) : null}
            {activeModule === "chat" ? (
              <>
                <div className="rounded-full border border-[rgba(10,126,126,0.2)] bg-[rgba(10,126,126,0.08)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--teal)]">
                  • RAG activo
                </div>
                <button className="ghost-button !px-4 !py-2 !text-xs" onClick={() => void handleNewConversation()}>
                  Nueva sesión
                </button>
              </>
            ) : null}
          </div>
        </header>

        {recurringBlocked && (
          <div className="relative z-10 border-b border-[rgba(201,64,64,0.28)] bg-[rgba(201,64,64,0.08)] px-6 py-3">
            <p className="text-sm font-semibold text-[var(--red)]">
              Evaluación recurrente obligatoria — han pasado {recurringStatus?.daysSince ?? 5}+ días
              desde tu última evaluación. Complétala para seguir usando el chat.
            </p>
          </div>
        )}

        {recurringReminder && (
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(232,117,10,0.28)] bg-[rgba(232,117,10,0.08)] px-6 py-3">
            <p className="text-sm font-semibold text-[var(--amber-dim)]">
              Te corresponde una evaluación recurrente ({recurringStatus?.daysSince ?? 5} días desde
              la última). Puedes rendirla ahora u omitirla por esta sesión.
            </p>
            <div className="flex gap-2">
              <button
                className="rounded-lg bg-[var(--amber)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                onClick={() => setActiveModule("evaluations")}
              >
                Rendir ahora
              </button>
              <button
                className="ghost-button !px-3 !py-1.5 !text-xs"
                onClick={() => setReminderDismissed(true)}
              >
                Omitir
              </button>
            </div>
          </div>
        )}

        {activeModule === "chat" ? (
          <>
            <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-6 py-8">
              {!messages.length ? (
                <div className="flex min-h-full flex-col items-center justify-center text-center">
                  <h2 className="display-title max-w-[680px] text-6xl font-black leading-none">
                    Tu aliado en <span className="text-[var(--amber)] italic">ciberseguridad</span>{" "}
                    empresarial
                  </h2>
                  <p className="mt-6 max-w-[620px] text-xl leading-9 text-[var(--ink-soft)]">
                    Haz una pregunta directa o elige uno de los temas sugeridos para empezar.
                  </p>

                  {/* HU16 — Ruta de aprendizaje guiada */}
                  <section
                    className="mt-10 w-full max-w-[720px] rounded-2xl border border-[rgba(10,126,126,0.2)] bg-[rgba(10,126,126,0.06)] px-6 py-5 text-left"
                    aria-label="Tu ruta de aprendizaje"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-[rgba(10,126,126,0.2)] bg-[rgba(10,126,126,0.1)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--teal)]">
                        Tu ruta de aprendizaje
                      </span>
                    </div>

                    {learningLoading ? (
                      <div className="mt-4 space-y-3" aria-hidden="true">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="h-14 animate-pulse rounded-xl bg-black/5" />
                        ))}
                      </div>
                    ) : !learningPath?.hasData ? (
                      // Escenario 5 — sin datos suficientes
                      <div className="mt-3">
                        <p className="text-base font-bold text-[var(--ink)]">
                          Aún no podemos personalizar tu ruta
                        </p>
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">
                          Tu ruta de aprendizaje se generará tras completar la evaluación
                          diagnóstica inicial. Mientras tanto, puedes explorar cualquier tema con los
                          atajos de abajo.
                        </p>
                        <button
                          className="mt-4 rounded-xl border border-[rgba(10,126,126,0.25)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                          onClick={() => router.push("/diagnostic")}
                        >
                          🎯 Iniciar evaluación diagnóstica
                        </button>
                      </div>
                    ) : learningPath.path.length === 0 ? (
                      <p className="mt-3 text-sm text-[var(--ink-soft)]">
                        ¡Excelente! No tienes temas con nivel bajo. Refuerza cualquier área cuando
                        quieras desde los atajos de abajo.
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 text-sm text-[var(--ink-soft)]">
                          Estos son los temas que más conviene reforzar, según tu diagnóstico.
                        </p>
                        <ul className="mt-4 space-y-3">
                          {learningPath.path.map((topic) => (
                            <li key={topic.key}>
                              <button
                                className="group flex w-full items-center gap-4 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left transition hover:border-[var(--amber)] hover:bg-[rgba(232,117,10,0.04)] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void startTopic(topic)}
                                disabled={isSending}
                                aria-label={`Reforzar ${topic.label}. ${LEVEL_BADGE[topic.level].label}. Estado: ${STATUS_BADGE[topic.status].label}`}
                              >
                                <span className="text-2xl" aria-hidden="true">{topic.icon}</span>
                                <span className="flex-1">
                                  <span className="block text-sm font-bold text-[var(--ink)]">
                                    {topic.label}
                                  </span>
                                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${LEVEL_BADGE[topic.level].cls}`}>
                                      {LEVEL_BADGE[topic.level].label}
                                    </span>
                                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${STATUS_BADGE[topic.status].cls}`}>
                                      {STATUS_BADGE[topic.status].label}
                                    </span>
                                  </span>
                                </span>
                                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--amber-dim)] opacity-0 transition group-hover:opacity-100">
                                  Estudiar →
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>

                  {/* Atajos temáticos (Escenario 2) */}
                  {!learningLoading && learningPath?.shortcuts?.length ? (
                    <nav
                      className="mt-6 w-full max-w-[720px] text-left"
                      aria-label="Atajos temáticos de ciberseguridad"
                    >
                      <p className="eyebrow mb-3 text-[var(--ink-soft)]">Atajos temáticos</p>
                      <div className="flex flex-wrap gap-2">
                        {learningPath.shortcuts.map((topic) => (
                          <button
                            key={topic.key}
                            onClick={() => void startTopic(topic)}
                            disabled={isSending}
                            aria-label={`Iniciar conversación sobre ${topic.label}${topic.isWeak ? " (área a reforzar)" : ""}`}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              topic.isWeak
                                ? "border-[rgba(232,117,10,0.35)] bg-[rgba(232,117,10,0.1)] text-[var(--amber-dim)] hover:bg-[rgba(232,117,10,0.16)]"
                                : "border-[var(--border)] bg-white text-[var(--ink-soft)] hover:border-[var(--amber)] hover:text-[var(--amber-dim)]"
                            }`}
                          >
                            <span aria-hidden="true">{topic.icon}</span>
                            {topic.label}
                            {topic.isWeak ? <span aria-hidden="true">•</span> : null}
                          </button>
                        ))}
                      </div>
                    </nav>
                  ) : null}

                  <div className="mt-6 grid w-full max-w-[720px] gap-4 md:grid-cols-3">
                    {quickPrompts.map((card) => (
                      <button
                        key={card.title}
                        onClick={() => void sendPrompt(card.prompt)}
                        className="rounded-2xl border border-[var(--border)] bg-white px-5 py-5 text-left shadow-[0_6px_18px_rgba(26,21,16,0.08)] transition hover:-translate-y-0.5 hover:border-[var(--amber)] hover:shadow-[0_14px_30px_rgba(26,21,16,0.12)]"
                      >
                        <div className="mb-3 text-3xl">{card.icon}</div>
                        <div className="text-lg font-bold text-[var(--ink)]">{card.title}</div>
                        <div className="mt-2 font-mono text-[11px] tracking-[0.16em] text-[var(--ink-soft)]">
                          {card.hint}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {messages.map((message) => (
                    <div key={message.id}>
                      {message.role === "user" ? (
                        <div className="flex justify-end">
                          <div className="max-w-[78%]">
                            <div className="mb-2 text-right font-mono text-[11px] tracking-[0.14em] text-[var(--ink-soft)]">
                              {formatTime(message.created_at)}
                            </div>
                            <div className="rounded-[1.25rem] rounded-br-md bg-[var(--amber)] px-6 py-4 text-lg leading-8 text-white shadow-[0_12px_24px_rgba(232,117,10,0.24)]">
                              {message.content}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-4">
                          <div className="brand-mark !mt-1 !h-10 !w-10 !rounded-full !text-xs">C</div>
                          <div className="max-w-[82%]">
                            <div className="mb-2 font-mono text-[11px] tracking-[0.14em] text-[var(--ink-soft)]">
                              {formatTime(message.created_at)}
                            </div>
                            <div className="rounded-[1.4rem] rounded-tl-md border border-[var(--border)] bg-white px-6 py-5 shadow-[0_12px_28px_rgba(26,21,16,0.08)]">
                              <div
                                className="max-w-none [&_code]:rounded-md [&_code]:border [&_code]:border-[var(--border)] [&_code]:bg-[var(--paper-2)] [&_code]:px-2 [&_code]:py-1 [&_code]:font-mono [&_code]:text-sm [&_code]:text-[var(--teal-dim)] [&_h3]:mb-3 [&_h3]:mt-0 [&_h3]:border-b [&_h3]:border-[var(--paper-3)] [&_h3]:pb-3 [&_h3]:font-[var(--font-display)] [&_h3]:text-3xl [&_h3]:font-black [&_li]:mb-2 [&_li]:text-lg [&_li]:leading-8 [&_p]:mb-4 [&_p]:text-lg [&_p]:leading-8 [&_strong]:text-[var(--amber-dim)] [&_u]:decoration-[var(--amber)] [&_u]:underline [&_ul]:list-disc [&_ul]:pl-6"
                                dangerouslySetInnerHTML={{ __html: renderAssistantHtml(message.content) }}
                              />

                              {message.meta?.usedContext ? (
                                <div className="mt-5 rounded-xl border border-[rgba(10,126,126,0.2)] bg-[rgba(10,126,126,0.06)] px-4 py-3 text-sm text-[var(--teal-dim)]">
                                  Respuesta generada usando contexto recuperado de la base documental.
                                </div>
                              ) : null}
                            </div>

                            {message.meta?.sources?.length ? (
                              <details className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(227,221,208,0.55)] px-4 py-3">
                                <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--amber-dim)]">
                                  {message.meta.sources.length} fuentes recuperadas de la base de conocimiento
                                </summary>
                                <div className="mt-3 space-y-3">
                                  {message.meta.sources.map((source) => (
                                    <div
                                      key={`${message.id}-${source.rank}`}
                                      className="rounded-lg border border-[var(--border)] bg-white/70 px-3 py-3 text-sm text-[var(--ink-soft)]"
                                    >
                                      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--amber-dim)]">
                                        Fuente #{source.rank} · similitud {source.similarity.toFixed(2)}
                                      </div>
                                      <p className="leading-6 text-[var(--ink)]">{source.preview}</p>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {isSending ? (
                    <div className="flex gap-4">
                      <div className="brand-mark !mt-1 !h-10 !w-10 !rounded-full !text-xs">C</div>
                      <div className="rounded-[1.4rem] rounded-tl-md border border-[var(--border)] bg-white px-6 py-5 shadow-[0_12px_28px_rgba(26,21,16,0.08)]">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--amber)]" />
                          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--amber-dim)] [animation-delay:0.15s]" />
                          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:0.3s]" />
                          <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                            Analizando contexto y redactando respuesta
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="relative z-10 border-t border-[var(--border)] bg-[rgba(245,240,232,0.92)] px-6 pb-5 pt-4 backdrop-blur-xl">
              {learningPath?.shortcuts?.length ? (
                <nav className="mb-4 flex flex-wrap gap-2" aria-label="Atajos temáticos de ciberseguridad">
                  {learningPath.shortcuts.slice(0, 6).map((topic) => (
                    <button
                      key={topic.key}
                      onClick={() => void startTopic(topic)}
                      disabled={isSending}
                      aria-label={`Iniciar conversación sobre ${topic.label}${topic.isWeak ? " (área a reforzar)" : ""}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        topic.isWeak
                          ? "border-[rgba(232,117,10,0.35)] bg-[rgba(232,117,10,0.08)] text-[var(--amber-dim)] hover:bg-[rgba(232,117,10,0.14)]"
                          : "border-[var(--border)] bg-white text-[var(--ink-soft)] hover:border-[var(--amber)] hover:text-[var(--amber-dim)]"
                      }`}
                    >
                      <span aria-hidden="true">{topic.icon}</span>
                      {topic.label}
                    </button>
                  ))}
                </nav>
              ) : null}

              <div className="rounded-[1.4rem] border border-[var(--border)] bg-white px-4 py-3 shadow-[0_8px_18px_rgba(26,21,16,0.08)]">
                <div className="flex items-end gap-3">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escribe tu mensaje o pregunta aquí..."
                    className="min-w-0 flex-1 border-none bg-transparent px-2 py-3 text-lg text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendPrompt();
                      }
                    }}
                  />
                  <button
                    onClick={() => void sendPrompt()}
                    disabled={isSending}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--amber)] text-xl text-white shadow-[0_10px_24px_rgba(232,117,10,0.3)] transition hover:bg-[var(--amber-dim)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    ▶
                  </button>
                </div>
              </div>

              <div className="mt-3 text-center text-xs text-[var(--ink-soft)]">
                La IA puede cometer errores. Verifica la información sensible.
              </div>
            </div>
          </>
        ) : (
          <div className="relative z-10 flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto max-w-5xl space-y-6">
              <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.6rem] border border-[var(--border)] bg-white/76 px-6 py-6 shadow-[0_12px_28px_rgba(26,21,16,0.08)]">
                  <p className="eyebrow">Evaluación guiada</p>
                  <h2 className="display-title mt-3 text-5xl font-black leading-none">
                    {testType === "recurrente"
                      ? "Evaluación recurrente"
                      : "Post-test de ciberseguridad"}
                  </h2>
                  <p className="mt-4 text-lg leading-8 text-[var(--ink-soft)]">
                    {testType === "recurrente"
                      ? "Evaluación periódica cada 5 días. Mide tu progreso continuo y detecta áreas críticas."
                      : "Evaluación final personalizada. Mide lo aprendido y actualiza tu progreso en el dashboard."}
                  </p>
                  {!isGeneratingQuiz && generatedQuestions && (
                    <div className="mt-3 flex gap-2">
                      <span className="rounded-full border border-[var(--border)] bg-[var(--paper-3)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        {activeQuestions.length} preguntas
                      </span>
                    </div>
                  )}

                  <div className="mt-6 flex gap-3">
                    <button className="secondary-button" onClick={resetQuiz}>
                      Reiniciar test
                    </button>
                    {quizSubmitted ? (
                      <button className="primary-button" onClick={() => setActiveModule("chat")}>
                        Volver al chat
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-[var(--border)] bg-white/76 px-6 py-6 shadow-[0_12px_28px_rgba(26,21,16,0.08)]">
                  <p className="eyebrow">Progreso</p>
                  <div className="mt-4 display-title text-6xl font-black text-[var(--amber-dim)]">
                    {quizSubmitted ? `${quizScore}/${activeQuestions.length}` : `${quizAnswers.filter((value) => value !== -1).length}/${activeQuestions.length}`}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                    {quizSubmitted
                      ? "Resultado final de tu evaluación."
                      : "Preguntas respondidas hasta ahora."}
                  </p>
                </div>
              </div>

              {isGeneratingQuiz && (
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-white/80 px-6 py-10 text-center shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
                  <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--amber)] border-t-transparent" />
                  <p className="text-[var(--ink-soft)]">Generando tu evaluación personalizada con IA...</p>
                  <p className="mt-2 font-mono text-[10px] text-[var(--ink-soft)]">Esto puede tardar unos segundos</p>
                </div>
              )}

              <div className="space-y-4">
                {activeQuestions.map((question, questionIndex) => (
                  <div
                    key={question.question}
                    className="rounded-[1.5rem] border border-[var(--border)] bg-white/80 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]"
                  >
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="eyebrow">Pregunta {questionIndex + 1}</p>
                        <h3 className="display-title mt-2 text-3xl font-black">{question.question}</h3>
                      </div>
                      {quizSubmitted ? (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            quizAnswers[questionIndex] === question.correctIndex
                              ? "bg-[rgba(46,125,82,0.12)] text-[var(--green)]"
                              : "bg-[rgba(201,64,64,0.12)] text-[var(--red)]"
                          }`}
                        >
                          {quizAnswers[questionIndex] === question.correctIndex ? "Correcta" : "Revisar"}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid gap-3">
                      {question.options.map((option, optionIndex) => {
                        const selected = quizAnswers[questionIndex] === optionIndex;
                        const correct = question.correctIndex === optionIndex;

                        let optionClass =
                          "border-[var(--border)] bg-white hover:border-[var(--amber)]";

                        if (selected) optionClass = "border-[var(--amber)] bg-[rgba(232,117,10,0.08)]";
                        if (quizSubmitted && correct) {
                          optionClass = "border-[rgba(46,125,82,0.25)] bg-[rgba(46,125,82,0.08)]";
                        } else if (quizSubmitted && selected && !correct) {
                          optionClass = "border-[rgba(201,64,64,0.25)] bg-[rgba(201,64,64,0.08)]";
                        }

                        return (
                          <button
                            key={option}
                            className={`rounded-xl border px-4 py-4 text-left text-sm leading-7 text-[var(--ink)] transition ${optionClass}`}
                            onClick={() => selectQuizOption(questionIndex, optionIndex)}
                            disabled={quizSubmitted}
                          >
                            <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-xs font-semibold">
                              {String.fromCharCode(65 + optionIndex)}
                            </span>
                            {option}
                          </button>
                        );
                      })}
                    </div>

                    {quizSubmitted ? (
                      <div className="mt-4 rounded-xl border border-[rgba(10,126,126,0.2)] bg-[rgba(10,126,126,0.06)] px-4 py-4 text-sm leading-7 text-[var(--teal-dim)]">
                        {question.explanation}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="rounded-[1.5rem] border border-[var(--border)] bg-white/78 px-6 py-6 shadow-[0_10px_24px_rgba(26,21,16,0.06)]">
                {!quizSubmitted ? (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm text-[var(--ink-soft)]">
                      Completa todas las preguntas y envía tu evaluación.
                    </p>
                    <button className="primary-button" onClick={submitQuiz}>
                      Ver resultados
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="display-title text-4xl font-black">Resultado final</h3>
                    <p className="text-lg leading-8 text-[var(--ink-soft)]">
                      Obtuviste <strong>{quizScore}</strong> de <strong>{activeQuestions.length}</strong>{" "}
                      respuestas correctas.
                    </p>
                    <div className="rounded-xl border border-[rgba(232,117,10,0.2)] bg-[rgba(232,117,10,0.08)] px-4 py-4 text-sm leading-7 text-[var(--ink)]">
                      {quizScore === activeQuestions.length
                        ? "Muy buen nivel. Mantén estas prácticas y comparte el aprendizaje con tu equipo."
                        : quizScore >= Math.ceil(activeQuestions.length * 0.6)
                          ? "Vas bien, pero todavía hay puntos por reforzar. Revisa las explicaciones y vuelve a intentarlo."
                          : "Conviene reforzar conceptos básicos de phishing, backups, contraseñas y respuesta a incidentes."}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Toasts ── */}
      {toasts.length > 0 && (
        <div className="ui-toast-wrap">
          {toasts.map((t) => (
            <div key={t.id} className={`ui-toast ${t.tone}`}>
              <span className="ui-toast-icon">
                {t.tone === "success" ? "✅" : t.tone === "error" ? "⚠️" : "ℹ️"}
              </span>
              <span>{t.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: renombrar conversación ── */}
      {renameTarget && (
        <div className="ui-modal-overlay" onClick={() => setRenameTarget(null)}>
          <div className="ui-modal" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Renombrar conversación</p>
            <div className="mt-4">
              <label className="field-label" htmlFor="rename-conv">Nuevo nombre</label>
              <input
                id="rename-conv"
                className="field-input"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveRename(); }}
                placeholder="Nombre de la conversación"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button className="ghost-button" onClick={() => setRenameTarget(null)}>Cancelar</button>
              <button className="primary-button" onClick={() => void saveRename()}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: eliminar conversación ── */}
      {deleteTarget && (
        <div className="ui-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="ui-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(201,64,64,0.12)] text-2xl">
              🗑️
            </div>
            <h3 className="display-title text-2xl font-black">¿Eliminar conversación?</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
              Se eliminará <strong className="text-[var(--ink)]">&ldquo;{deleteTarget.title}&rdquo;</strong> y
              todos sus mensajes. Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="ghost-button" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button
                className="primary-button !bg-[var(--red)] !shadow-none"
                onClick={() => void confirmDelete()}
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
