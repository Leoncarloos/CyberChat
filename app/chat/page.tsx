// /app/chat/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  addMessage,
  createConversation,
  listConversations,
  listMessages,
  renameConversation,
} from "@/lib/db";

type Conversation = { id: string; title: string; created_at: string; user_id: string };
type Message = { id: string; role: "user" | "assistant"; content: string; created_at: string };

export default function ChatPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");

  // 1) proteger ruta + cargar conversaciones
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }

      setUserId(data.user.id);
      setEmail(data.user.email ?? "");

      const convRes = await listConversations(data.user.id);
      if (convRes.error) {
        console.error(convRes.error);
        return;
      }

      const convs = (convRes.data ?? []) as Conversation[];
      setConversations(convs);

      if (convs.length > 0) setActiveId(convs[0].id);
    })();
  }, [router, supabase]);

  // 2) cargar mensajes al cambiar conversación
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }

    (async () => {
      const msgRes = await listMessages(activeId);
      if (msgRes.error) {
        console.error(msgRes.error);
        return;
      }
      setMessages(((msgRes.data ?? []) as any) as Message[]);
    })();
  }, [activeId]);

  async function onNewChat() {
    if (!userId) return;

    const res = await createConversation(userId);
    if (res.error) return alert(res.error.message);

    const newConv = (res.data as any) as Conversation;
    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConv.id);
    setMessages([]);
  }

  async function onSend() {
    const text = input.trim();
    if (!text || !activeId) return;

    setInput("");

    // 1) guardar mensaje usuario
    const userMsgRes = await addMessage(activeId, "user", text);
    if (userMsgRes.error) return alert(userMsgRes.error.message);

    const userMsg = (userMsgRes.data as any) as Message;

    // ✅ Importantísimo: arma el historial "real" que enviarás al backend
    // para que no dependa del setState async.
    const historyForApi = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];

    // actualiza UI
    setMessages((prev) => [...prev, userMsg]);

    // 2) pedir respuesta al LLM (tu endpoint /api/chat) con HISTORIAL
    const apiRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: historyForApi,
        // si luego quieres filtrar por doc: document_id: "uuid"
      }),
    });

    const raw = await apiRes.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}

    if (!apiRes.ok) {
      alert("Error en /api/chat:\n" + (data?.error ?? raw ?? "Respuesta vacía"));
      return;
    }

    const reply = String(data?.answer ?? "");

    // 3) guardar mensaje asistente
    const asstMsgRes = await addMessage(activeId, "assistant", reply);
    if (asstMsgRes.error) return alert(asstMsgRes.error.message);

    const asstMsg = (asstMsgRes.data as any) as Message;
    setMessages((prev) => [...prev, asstMsg]);

    // 4) renombrar conversación si está en "Nuevo chat"
    const conv = conversations.find((c) => c.id === activeId);
    if (conv && conv.title === "Nuevo chat") {
      const title = text.slice(0, 40);
      await renameConversation(activeId, title);
      setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, title } : c)));
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <aside style={{ width: 280, borderRight: "1px solid #ddd", padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button onClick={onNewChat}>+ Nuevo chat</button>
          <button onClick={logout}>Salir</button>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>{email}</div>

        <hr style={{ margin: "12px 0" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: c.id === activeId ? "#eee" : "white",
              }}
            >
              {c.title}
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          {!activeId ? (
            <p>Crea un chat nuevo para empezar.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 12 }}>
                <b>{m.role === "user" ? "Tú" : "Asistente"}:</b> {m.content}
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div style={{ borderTop: "1px solid #ddd", padding: 12, display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu mensaje…"
            style={{ flex: 1, padding: 10 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSend();
            }}
            disabled={!activeId}
          />
          <button onClick={onSend} disabled={!activeId}>
            Enviar
          </button>
        </div>
      </main>
    </div>
  );
}
