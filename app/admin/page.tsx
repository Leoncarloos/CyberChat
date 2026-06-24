"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type UploadResponse = {
  document_id?: string;
  chunks?: number;
  error?: string;
};

type ReprocessResponse = {
  ok?: boolean;
  reprocessed?: number;
  totalChunks?: number;
  error?: string;
};

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; msg: string };

export default function AdminPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [lastDocumentId, setLastDocumentId] = useState("");
  const [status, setStatus] = useState("");
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState("");

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((tone: ToastTone, msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tone, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) return router.push("/login");
      if (user.user_metadata?.role !== "admin") return router.push("/chat");

      setUserId(user.id);
      setUserEmail(user.email ?? "");
    })();
  }, [router, supabase]);

  async function uploadAndProcess(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("");

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    if (!file) return toast("error", "Selecciona un archivo primero");
    if (!userId) return toast("error", "Sesión expirada. Vuelve a iniciar sesión.");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", userId);

    try {
      setIsUploading(true);
      setStatus("Subiendo y procesando...");

      const res = await fetch("/api/documents/upload-and-process", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data: UploadResponse | null = null;
      try {
        data = text ? (JSON.parse(text) as UploadResponse) : null;
      } catch {}

      if (!res.ok) {
        toast("error", data?.error ?? "Error al procesar el documento");
        setStatus("Error");
        setIsUploading(false);
        return;
      }

      const docId = String(data?.document_id ?? "");
      if (docId) setLastDocumentId(docId);

      setStatus(`OK | chunks: ${data?.chunks ?? "?"}`);
      toast("success", `Documento procesado · ${data?.chunks ?? "?"} chunks generados`);
      form.reset();
      setFileName("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast("error", message);
      setStatus("Error");
    }
    setIsUploading(false);
  }

  async function reprocessDocuments() {
    setIsReprocessing(true);
    setStatus("Re-procesando embeddings...");

    const res = await fetch("/api/documents/reprocess", { method: "POST" });
    const data = (await res.json()) as ReprocessResponse;

    setIsReprocessing(false);
    if (!res.ok) {
      toast("error", data.error ?? "Error en el re-proceso");
      setStatus("Error en re-proceso");
      return;
    }
    setStatus(`Re-proceso OK | docs: ${data.reprocessed ?? 0} | chunks: ${data.totalChunks ?? 0}`);
    toast("success", `Re-proceso completo · ${data.reprocessed ?? 0} docs · ${data.totalChunks ?? 0} chunks`);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const statusTone =
    status === "Error" || status === "Error en re-proceso"
      ? "error"
      : status.startsWith("OK") || status.startsWith("Re-proceso OK")
        ? "success"
        : status
          ? "info"
          : "";

  return (
    <main className="app-shell grid min-h-screen grid-cols-1 bg-[var(--paper)] lg:grid-cols-[280px_1fr]">

      {/* ── Sidebar ── */}
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

        <div className="px-3 py-4">
          <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.42)]">
            Gestión
          </p>
          <div className="space-y-1">
            <button className="ui-nav" onClick={() => router.push("/manage")}>
              <span className="ui-nav-icon">👥</span>
              <span>Empleados</span>
            </button>
            <button className="ui-nav" onClick={() => router.push("/org-dashboard")}>
              <span className="ui-nav-icon">📈</span>
              <span>Dashboard org.</span>
            </button>
            <button className="ui-nav active">
              <span className="ui-nav-icon">📚</span>
              <span>Documentos RAG</span>
            </button>
            <button className="ui-nav" onClick={() => router.push("/chat")}>
              <span className="ui-nav-icon">💬</span>
              <span>Ir al chat</span>
            </button>
          </div>
        </div>

        {/* Pipeline */}
        <div className="mt-auto px-4 pb-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.42)]">
              Pipeline RAG
            </div>
            <div className="mt-3 space-y-2.5">
              {["Almacenamiento", "Registro del documento", "Chunking por frases", "Embeddings 384-dim"].map((step, i) => (
                <div key={step} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(232,117,10,0.2)] font-mono text-[10px] font-bold text-[var(--amber-glow)]">
                    {i + 1}
                  </span>
                  <span className="text-sm text-[rgba(245,240,232,0.78)]">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* User + logout */}
        <div className="border-t border-white/8 px-4 py-4">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-[rgba(245,240,232,0.9)]">
              {(userEmail.charAt(0) || "A").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-[rgba(245,240,232,0.88)]">
                {userEmail || "Admin"}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[rgba(245,240,232,0.5)]">
                Administrador
              </div>
            </div>
          </div>
          <button
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm font-semibold text-[rgba(245,240,232,0.72)] transition hover:bg-white/12 hover:text-[rgba(245,240,232,0.96)]"
            onClick={logout}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <section className="relative flex min-h-screen flex-col bg-[var(--paper)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(26,21,16,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(26,21,16,0.022)_1px,transparent_1px)] bg-[size:32px_32px]" />

        <header className="relative z-10 border-b border-[var(--border)] bg-[rgba(245,240,232,0.92)] px-6 py-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Ingesta de conocimiento</p>
              <h1 className="display-title mt-1.5 text-4xl font-black leading-tight">Documentos RAG</h1>
              <p className="mt-2 max-w-xl text-sm text-[var(--ink-soft)]">
                Sube PDFs, DOCX o TXT para activarlos en las respuestas del chatbot.
              </p>
            </div>
            {statusTone && <div className={`status-banner ${statusTone} max-w-sm`}>{status}</div>}
          </div>
        </header>

        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6 space-y-6">

          {/* Upload */}
          <div className="stat-card">
            <p className="eyebrow mb-4">Subir documento</p>
            <form onSubmit={uploadAndProcess} className="space-y-5">
              <label
                htmlFor="document-file"
                className="relative flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-[var(--border)] bg-white/60 px-6 py-10 text-center transition hover:border-[var(--amber)] hover:bg-[rgba(232,117,10,0.03)]"
              >
                <div className="mb-2 text-4xl">{fileName ? "📄" : "📎"}</div>
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {fileName || "Haz clic para seleccionar un archivo"}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">PDF · DOCX · TXT</p>
                <input
                  id="document-file"
                  className="sr-only"
                  type="file"
                  name="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button type="submit" className="primary-button" disabled={isUploading}>
                  {isUploading ? "Procesando..." : "⬆ Subir y procesar"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void reprocessDocuments()}
                  disabled={isReprocessing}
                >
                  {isReprocessing ? "Re-procesando..." : "↻ Re-procesar embeddings"}
                </button>
              </div>
            </form>
          </div>

          {/* Info cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="stat-card">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(232,117,10,0.12)] text-2xl">📄</div>
              <p className="eyebrow">Formatos</p>
              <p className="mt-2 font-semibold text-[var(--ink)]">PDF, DOCX y TXT</p>
              <p className="mt-1.5 text-sm text-[var(--ink-soft)]">Se extrae el texto legible antes de vectorizar.</p>
            </div>
            <div className="stat-card">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(10,126,126,0.1)] text-2xl">🧩</div>
              <p className="eyebrow">Chunking</p>
              <p className="mt-2 font-semibold text-[var(--ink)]">Por frases (~800 chars)</p>
              <p className="mt-1.5 text-sm text-[var(--ink-soft)]">Con 1 oración de solapamiento entre chunks.</p>
            </div>
            <div className="stat-card">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(46,125,82,0.1)] text-2xl">🔍</div>
              <p className="eyebrow">Retrieval</p>
              <p className="mt-2 font-semibold text-[var(--ink)]">Embeddings 384-dim</p>
              <p className="mt-1.5 text-sm text-[var(--ink-soft)]">Búsqueda semántica multilingüe en el chat.</p>
            </div>
          </div>

          {/* Last doc */}
          {lastDocumentId && (
            <div className="stat-card flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow">Último documento procesado</p>
                <p className="mt-1.5 truncate font-mono text-sm text-[var(--ink-soft)]">{lastDocumentId}</p>
              </div>
              <button
                className="secondary-button shrink-0"
                onClick={() => {
                  void navigator.clipboard.writeText(lastDocumentId);
                  toast("info", "ID copiado al portapapeles");
                }}
              >
                Copiar ID
              </button>
            </div>
          )}
        </div>
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
    </main>
  );
}
