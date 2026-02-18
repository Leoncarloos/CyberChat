"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [lastDocumentId, setLastDocumentId] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.push("/login");
      setUserId(data.user.id);
    })();
  }, [router, supabase]);

  async function uploadAndProcess(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("");

    const file = (e.currentTarget.file as HTMLInputElement).files?.[0];
    if (!file) return alert("Selecciona un archivo");
    if (!userId) return alert("No auth (userId vacío). Vuelve a iniciar sesión.");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", userId);

    try {
      setStatus("Subiendo y procesando…");

      const res = await fetch("/api/documents/upload-and-process", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        alert("Error backend:\n" + (data?.error ?? text ?? "Respuesta vacía"));
        setStatus("Error");
        return;
      }

      const docId = String(data?.document_id ?? "");
      if (docId) setLastDocumentId(docId);

      setStatus(
        `OK ✅ | chunks: ${data?.chunks ?? "?"} | tipo: ${data?.type ?? "?"}`
      );

      alert(
        "Documento subido + procesado + embeddings ✅" +
          (docId ? `\n\ndocument_id:\n${docId}` : "") +
          (data?.chunks ? `\nchunks: ${data.chunks}` : "")
      );
    } catch (err: any) {
      alert("Error: " + (err?.message ?? String(err)));
      setStatus("Error");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Panel Admin – Subir documentos</h1>
        <button onClick={logout}>Salir</button>
      </div>

      <p style={{ opacity: 0.8, marginTop: 8 }}>
        Sube un archivo y el backend hará TODO: storage → documents → chunks → embeddings.
      </p>

      <form onSubmit={uploadAndProcess}>
        <input
          type="file"
          name="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        />
        <br />
        <br />
        <button type="submit">Subir y procesar (todo automático)</button>
      </form>

      <div style={{ marginTop: 16, fontSize: 14 }}>
        <div>
          <b>Estado:</b> {status || "—"}
        </div>
        <div style={{ marginTop: 6 }}>
          <b>Último document_id:</b>{" "}
          {lastDocumentId ? (
            <>
              <code>{lastDocumentId}</code>{" "}
              <button
                style={{ marginLeft: 8 }}
                onClick={() => {
                  navigator.clipboard.writeText(lastDocumentId);
                  alert("document_id copiado ✅");
                }}
              >
                Copiar
              </button>
            </>
          ) : (
            "—"
          )}
        </div>
      </div>
    </div>
  );
}
