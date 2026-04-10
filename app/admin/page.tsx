"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type UploadResponse = {
  document_id?: string;
  chunks?: number;
  error?: string;
};

export default function AdminPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [lastDocumentId, setLastDocumentId] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.push("/login");
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? "");
    })();
  }, [router, supabase]);

  async function uploadAndProcess(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("");

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    if (!file) return alert("Selecciona un archivo");
    if (!userId) return alert("No auth (userId vacío). Vuelve a iniciar sesión.");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", userId);

    try {
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
        alert("Error backend:\n" + (data?.error ?? text ?? "Respuesta vacía"));
        setStatus("Error");
        return;
      }

      const docId = String(data?.document_id ?? "");
      if (docId) setLastDocumentId(docId);

      setStatus(`OK | chunks: ${data?.chunks ?? "?"}`);

      alert(
        "Documento subido y procesado correctamente." +
          (docId ? `\n\ndocument_id:\n${docId}` : "") +
          (data?.chunks ? `\nchunks: ${data.chunks}` : "")
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert("Error: " + message);
      setStatus("Error");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const statusTone =
    status === "Error" ? "error" : status.startsWith("OK") ? "success" : status ? "info" : "";

  return (
    <main className="admin-shell">
      <div className="admin-grid">
        <aside className="admin-sidebar">
          <div className="relative z-10 space-y-8">
            <div className="space-y-4">
              <div className="brand-mark">CG</div>
              <div>
                <p className="eyebrow text-[rgba(245,240,232,0.45)]">Panel Operativo</p>
                <h1 className="display-title mt-2 text-4xl font-black leading-none">
                  Centro documental
                </h1>
                <p className="mt-4 text-sm leading-7 text-[rgba(245,240,232,0.68)]">
                  Gestiona la ingesta de archivos para alimentar el retrieval del asistente y
                  mantener actualizado el conocimiento de la plataforma.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="stat-card border-white/10 bg-white/5 text-[var(--paper)]">
                <p className="eyebrow text-[rgba(245,240,232,0.42)]">Usuario activo</p>
                <p className="mt-3 break-all text-sm leading-6 text-[rgba(245,240,232,0.82)]">
                  {userEmail || "Cargando sesión..."}
                </p>
              </div>

              <div className="stat-card border-white/10 bg-white/5 text-[var(--paper)]">
                <p className="eyebrow text-[rgba(245,240,232,0.42)]">Pipeline</p>
                <div className="mt-4 space-y-3 text-sm text-[rgba(245,240,232,0.8)]">
                  <p>1. Storage</p>
                  <p>2. Registro en documentos</p>
                  <p>3. Chunking</p>
                  <p>4. Embeddings</p>
                </div>
              </div>

              <div className="split-actions">
                <a href="/chat" className="secondary-button">
                  Ir al chat
                </a>
                <button onClick={logout} className="ghost-button">
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section className="glass-card admin-main">
          <div className="mb-8 flex flex-col gap-5 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <p className="eyebrow">Ingesta de conocimiento</p>
              <h2 className="display-title text-4xl font-extrabold">Subir y procesar documentos</h2>
              <p className="helper-text max-w-2xl">
                Arrastra o selecciona un archivo para ejecutar el flujo completo del backend:
                almacenamiento, extracción de texto, particionado y embeddings.
              </p>
            </div>

            <div className="stat-card min-w-[12rem]">
              <p className="eyebrow">Último estado</p>
              <p className="stat-value mt-3 text-[var(--amber-dim)]">
                {status.startsWith("OK") ? "OK" : status === "Error" ? "ERR" : "--"}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {status || "Aún no se ejecuta ninguna carga"}
              </p>
            </div>
          </div>

          <form onSubmit={uploadAndProcess} className="admin-form-grid">
            <div>
              <label className="field-label" htmlFor="document-file">
                Archivo fuente
              </label>
              <input
                id="document-file"
                className="field-file"
                type="file"
                name="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="stat-card">
                <p className="eyebrow">Formatos</p>
                <p className="mt-3 text-sm font-semibold text-[var(--ink)]">PDF, DOCX y TXT</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  El backend extrae el texto legible antes de vectorizarlo.
                </p>
              </div>

              <div className="stat-card">
                <p className="eyebrow">Destino</p>
                <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Bucket `documents`</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Cada archivo se vincula al usuario autenticado y se guarda con UUID.
                </p>
              </div>

              <div className="stat-card">
                <p className="eyebrow">Retrieval</p>
                <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Embeddings 384-dim</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Los chunks quedan listos para búsqueda semántica en el chat.
                </p>
              </div>
            </div>

            {statusTone ? <div className={`status-banner ${statusTone}`}>{status}</div> : null}

            <div className="split-actions">
              <button type="submit" className="primary-button">
                Subir y procesar
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => router.push("/chat")}
              >
                Volver al chat
              </button>
            </div>
          </form>

          <div className="mt-8 grid gap-4 border-t border-[var(--border)] pt-6 md:grid-cols-[1.35fr_0.9fr]">
            <div className="stat-card">
              <p className="eyebrow">Resumen del flujo</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                La carga inicia en Storage, crea el registro de documento, limpia chunks previos,
                recalcula embeddings y deja el contenido listo para responder con RAG.
              </p>
            </div>

            <div className="stat-card">
              <p className="eyebrow">Último document_id</p>
              <div className="mt-3 space-y-4">
                <p className="text-sm break-all text-[var(--ink)]">
                  {lastDocumentId || "Todavía no hay un documento procesado en esta sesión."}
                </p>
                {lastDocumentId ? (
                  <button
                    className="secondary-button w-full"
                    onClick={() => {
                      navigator.clipboard.writeText(lastDocumentId);
                      alert("document_id copiado");
                    }}
                  >
                    Copiar identificador
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
