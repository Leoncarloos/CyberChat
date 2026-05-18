"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
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
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    })();
  }, [router, supabase]);

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

  async function handleNewConversation(prefill?: string) {
    if (!userId) return "";

    const res = await createConversation(userId);
    if (res.error) {
      alert(res.error.message);
      return "";
    }

    const newConv = res.data as Conversation;
    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConv.id);
    setMessages([]);
    setInput(prefill ?? "");
    return newConv.id;
  }

  async function handleRenameConversation(conversation: Conversation) {
    const nextTitle = window.prompt("Nuevo nombre de la conversación:", conversation.title)?.trim();
    if (!nextTitle || nextTitle === conversation.title) return;

    const result = await renameConversation(conversation.id, nextTitle);
    if (result.error) {
      alert(result.error.message);
      return;
    }

    setConversations((prev) =>
      prev.map((item) => (item.id === conversation.id ? { ...item, title: nextTitle } : item))
    );
  }

  async function handleDeleteConversation(conversation: Conversation) {
    const confirmed = window.confirm(`¿Eliminar la conversación "${conversation.title}"?`);
    if (!confirmed) return;

    const result = await deleteConversation(conversation.id);
    if (result.error) {
      alert(result.error.message);
      return;
    }

    const nextConversations = conversations.filter((item) => item.id !== conversation.id);
    setConversations(nextConversations);

    if (activeId === conversation.id) {
      setActiveId(nextConversations[0]?.id ?? "");
      setMessages([]);
    }
  }

  async function sendPrompt(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || isSending) return;

    let conversationId = activeId;
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
      alert(userMsgRes.error.message);
      return;
    }

    const userMessage = userMsgRes.data as StoredMessage;
    const historyForApi = [
      ...messages.map((message) => ({ role: message.role, content: message.content })),
      { role: "user" as const, content: text },
    ];

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
      alert("Error en /api/chat:\n" + (data?.error ?? raw ?? "Respuesta vacía"));
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
      alert(asstMsgRes.error.message);
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
      alert("Responde todas las preguntas antes de enviar la evaluación.");
      return;
    }

    setQuizSubmitted(true);
  }

  function resetQuiz() {
    setQuizAnswers(createEmptyAnswers());
    setQuizSubmitted(false);
  }

  const queryCount = messages.filter((message) => message.role === "user").length;
  const quizScore = quizQuestions.reduce(
    (score, question, index) => score + (quizAnswers[index] === question.correctIndex ? 1 : 0),
    0
  );

  return (
    <main className="app-shell grid min-h-screen grid-cols-1 bg-[var(--paper)] lg:grid-cols-[280px_1fr]">
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
            onClick={() => setActiveModule("chat")}
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

      <section className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--paper)]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(26,21,16,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(26,21,16,0.025)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(245,240,232,0.88)] px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="brand-mark !h-10 !w-10 !rounded-full !text-xs">C</div>
            <div>
              <p className="display-title text-2xl font-bold">
                {activeModule === "chat" ? "Agente CyberChat" : "Evaluaciones CyberChat"}
              </p>
              <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--muted)]">
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

        {activeModule === "chat" ? (
          <>
            <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-6 py-8">
              {!messages.length ? (
                <div className="flex min-h-full flex-col items-center justify-center text-center">
                  <h2 className="display-title max-w-[680px] text-6xl font-black leading-none">
                    Tu aliado en <span className="text-[var(--amber)] italic">ciberseguridad</span>{" "}
                    empresarial
                  </h2>
                  <p className="mt-6 max-w-[620px] text-xl leading-9 text-[var(--muted)]">
                    Haz una pregunta directa o elige uno de los temas sugeridos para empezar.
                  </p>

                  <div className="mt-10 grid w-full max-w-[720px] gap-4 md:grid-cols-3">
                    {quickPrompts.map((card) => (
                      <button
                        key={card.title}
                        onClick={() => void sendPrompt(card.prompt)}
                        className="rounded-2xl border border-[var(--border)] bg-white px-5 py-5 text-left shadow-[0_6px_18px_rgba(26,21,16,0.08)] transition hover:-translate-y-0.5 hover:border-[var(--amber)] hover:shadow-[0_14px_30px_rgba(26,21,16,0.12)]"
                      >
                        <div className="mb-3 text-3xl">{card.icon}</div>
                        <div className="text-lg font-bold text-[var(--ink)]">{card.title}</div>
                        <div className="mt-2 font-mono text-[11px] tracking-[0.16em] text-[var(--muted)]">
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
                            <div className="mb-2 text-right font-mono text-[11px] tracking-[0.14em] text-[var(--muted)]">
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
                            <div className="mb-2 font-mono text-[11px] tracking-[0.14em] text-[var(--muted)]">
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
                                      className="rounded-lg border border-[var(--border)] bg-white/70 px-3 py-3 text-sm text-[var(--muted)]"
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
                          <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
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
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-[var(--muted)] transition hover:border-[var(--amber)] hover:text-[var(--amber-dim)]"
                  onClick={() => setInput("Explícame qué es el phishing y cómo evitarlo en mi empresa.")}
                >
                  Phishing
                </button>
                <button
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-[var(--muted)] transition hover:border-[var(--amber)] hover:text-[var(--amber-dim)]"
                  onClick={() => setInput("Dame recomendaciones sobre contraseñas seguras para mi equipo.")}
                >
                  Contraseñas seguras
                </button>
                <button
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-[var(--muted)] transition hover:border-[var(--amber)] hover:text-[var(--amber-dim)]"
                  onClick={() => setInput("¿Cómo protejo mi red WiFi empresarial?")}
                >
                  Redes Wi-Fi
                </button>
              </div>

              <div className="rounded-[1.4rem] border border-[var(--border)] bg-white px-4 py-3 shadow-[0_8px_18px_rgba(26,21,16,0.08)]">
                <div className="flex items-end gap-3">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escribe tu mensaje o pregunta aquí..."
                    className="min-w-0 flex-1 border-none bg-transparent px-2 py-3 text-lg text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
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

              <div className="mt-3 text-center text-xs text-[var(--muted)]">
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
                    Test rápido de ciberseguridad
                  </h2>
                  <p className="mt-4 text-lg leading-8 text-[var(--muted)]">
                    Responde preguntas prácticas pensadas para empleados de MYPES. Al final verás tu
                    puntaje y recomendaciones.
                  </p>

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
                    {quizSubmitted ? `${quizScore}/${quizQuestions.length}` : `${quizAnswers.filter((value) => value !== -1).length}/${quizQuestions.length}`}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                    {quizSubmitted
                      ? "Resultado final de tu evaluación."
                      : "Preguntas respondidas hasta ahora."}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {quizQuestions.map((question, questionIndex) => (
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
                    <p className="text-sm text-[var(--muted)]">
                      Completa todas las preguntas y envía tu evaluación.
                    </p>
                    <button className="primary-button" onClick={submitQuiz}>
                      Ver resultados
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="display-title text-4xl font-black">Resultado final</h3>
                    <p className="text-lg leading-8 text-[var(--muted)]">
                      Obtuviste <strong>{quizScore}</strong> de <strong>{quizQuestions.length}</strong>{" "}
                      respuestas correctas.
                    </p>
                    <div className="rounded-xl border border-[rgba(232,117,10,0.2)] bg-[rgba(232,117,10,0.08)] px-4 py-4 text-sm leading-7 text-[var(--ink)]">
                      {quizScore === quizQuestions.length
                        ? "Muy buen nivel. Mantén estas prácticas y comparte el aprendizaje con tu equipo."
                        : quizScore >= 2
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
    </main>
  );
}
