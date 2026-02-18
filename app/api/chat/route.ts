export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

function meanPool(tokens: number[][]) {
  const n = tokens.length || 1;
  const dim = tokens[0]?.length ?? 0;
  const out = new Array(dim).fill(0);

  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < dim; j++) out[j] += tokens[i][j];
  }
  for (let j = 0; j < dim; j++) out[j] /= n;

  return out;
}

function normalizeHFEmbedding(raw: any): number[] {
  if (Array.isArray(raw) && typeof raw[0] === "number") return raw as number[];

  // tokens x dim
  if (Array.isArray(raw) && Array.isArray(raw[0]) && typeof raw[0][0] === "number") {
    return meanPool(raw as number[][]);
  }

  // batch => [tokens x dim]
  if (Array.isArray(raw) && Array.isArray(raw[0]) && Array.isArray(raw[0][0])) {
    return meanPool(raw[0] as number[][]);
  }

  throw new Error("HF devolvió formato inesperado");
}

async function embedHF(text: string) {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("Falta HF_TOKEN");

  const url =
    "https://router.huggingface.co/hf-inference/models/" +
    "sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    cache: "no-store",
  });

  const rawText = await resp.text();
  let raw: any = null;
  try {
    raw = rawText ? JSON.parse(rawText) : null;
  } catch {}

  if (!resp.ok) throw new Error(raw?.error ?? rawText ?? "HF error");

  const emb = normalizeHFEmbedding(raw);
  if (emb.length !== 384) throw new Error(`Embedding dim inválida: ${emb.length}`);
  return emb;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body?.messages as ChatMsg[] | undefined;
    const document_id = body?.document_id ? String(body.document_id) : null;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages requerido" }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return NextResponse.json({ error: "Falta GROQ_API_KEY" }, { status: 500 });

    // ✅ OJO: supabaseServer() es async
    const supabase = await supabaseServer();

    // ✅ user logueado (cookies SSR)
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });

    const user = auth?.user;
    if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const lastUser =
      [...messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
    if (!lastUser) {
      return NextResponse.json({ error: "Último mensaje vacío" }, { status: 400 });
    }

    // ✅ RAG: embed + rpc scoped
    const query_embedding = await embedHF(lastUser);

    const { data: matches, error: rpcErr } = await supabase.rpc("match_document_chunks_scoped", {
      query_embedding,
      filter_user_id: user.id,
      filter_document_id: document_id, // null ok
      match_count: 6,
    });

    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

    const top = (matches ?? []).slice(0, 5);
    const context = top
      .map((m: any, idx: number) => `# Fuente ${idx + 1}\n${m.content ?? ""}`)
      .join("\n\n");

    const system: ChatMsg = {
      role: "system",
      content:
        "Eres un asistente de concientización en ciberseguridad. Responde en español, claro, concreto y accionable.\n" +
        "- Usa el CONTEXTO si es relevante.\n" +
        "- Si el contexto NO ayuda, dilo y responde con conocimiento general.\n" +
        "- No pidas datos sensibles.\n\n" +
        "CONTEXTO:\n" +
        (context || "(sin contexto relevante)"),
    };

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [system, ...messages],
      }),
    });

    const groqText = await groqRes.text();
    let groqData: any = null;
    try {
      groqData = groqText ? JSON.parse(groqText) : null;
    } catch {}

    if (!groqRes.ok) {
      return NextResponse.json(
        { error: "Groq error", details: groqData?.error ?? groqText ?? "Respuesta vacía" },
        { status: 500 }
      );
    }

    const answer = groqData?.choices?.[0]?.message?.content ?? "No pude generar respuesta.";
    return NextResponse.json({ answer, matchesCount: top.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Error desconocido" }, { status: 500 });
  }
}
