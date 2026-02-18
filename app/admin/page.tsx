"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.push("/login");
      setUserId(data.user.id);
    })();
  }, [router, supabase]);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.file as HTMLInputElement).files?.[0];
    if (!file) return alert("Selecciona un archivo");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", userId);

    const res = await fetch("/api/documents/upload", {
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
      return;
    }

    // Si tu backend devuelve document_id, lo mostramos para no copiar manual
    alert(
      "Documento subido correctamente" +
        (data?.document_id ? `\n\ndocument_id:\n${data.document_id}` : "")
    );
  }

  async function processDoc() {
    const documentId = prompt("Pega el document_id");
    if (!documentId) return;

    try {
      const res = await fetch("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: documentId }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        alert("Error backend:\n" + (data?.error ?? text ?? "Respuesta vacía"));
        return;
      }

      alert("Procesado: " + (data?.chunks ?? "?") + " chunks");
    } catch (err: any) {
      alert("Error: " + (err?.message ?? String(err)));
    }
  }

  // ✅ ESTO ES LO QUE TE FALTA: generar embeddings y llenar document_chunks.embedding
  async function embedDoc() {
    const documentId = prompt("Pega el document_id para generar embeddings");
    if (!documentId) return;

    try {
      const res = await fetch("/api/documents/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: documentId }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        alert("Error backend:\n" + (data?.error ?? text ?? "Respuesta vacía"));
        return;
      }

      alert("Embeddings generados. Updated: " + (data?.updated ?? "?"));
    } catch (err: any) {
      alert("Error: " + (err?.message ?? String(err)));
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Panel Admin – Subir documentos</h1>

      <form onSubmit={upload}>
        <input type="file" name="file" accept="application/pdf" />
        <br />
        <br />
        <button type="submit">Subir PDF</button>
      </form>

      <br />

      <button type="button" onClick={processDoc}>
        Procesar documento (crear chunks)
      </button>

      <br />
      <br />

      <button type="button" onClick={embedDoc}>
        Generar embeddings (llenar vector)
      </button>
    </div>
  );
}