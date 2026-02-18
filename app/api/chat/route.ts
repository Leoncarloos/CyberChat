export const runtime = "nodejs";

import { NextResponse } from "next/server";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

function meanPool(tokens: number[][]) {
  const nTokens = tokens.length;
  const dim = tokens[0]?.length ?? 0;
  const emb = new Array(dim).fill(0);

  for (let i = 0; i < nTokens; i++) {
    for (let j = 0; j < dim; j++) emb[j] += tokens[i][j];
  }
  for (let j = 0; j < dim; j++) emb[j] /= nTokens || 1;

  return emb;
}

// Acepta: [[[...]]], [[...]], [...]
function normalizeHFEmbedding(raw: any): number[] {
  if (Array.isArray(raw) && typeof raw[0] === "number") return raw as number[];

  if (Array.isArray(raw) && Array.isArray(raw[0]) && typeof raw[0][0] === "number") {
    return raw[0] as number[];
  }

  if (Array.isArray(raw) && Array.isArray(raw[0]) && Array.isArray(raw[0][0])) {
    return meanPool(raw[0] as number[][]);
  }

  throw new Error("HF devolvió formato inesperado");
}

async function embedHF(text: string) {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) throw new Error("Falta HF_TOKEN");

  const hfRes = await fetch(
    "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    }
  );

  const rawText = await hfRes.text();
  let raw: any = null;
  try {
    raw = rawText ? JSON.parse(rawText) : null;
  } catch {}

  if (!hfRes.ok) {
    throw new Error(`HF error (${hfRes.status}): ${raw?.error ?? rawText ?? "Respuesta vacía"}`);
  }

  try {
    return normalizeHFEmbedding(raw);
  } catch {
    throw new Error(`HF devolvió formato inesperado: ${rawText}`);
  }
}

async function retrieveTopChunks(req: Request, query: string) {
  // ✅ origin real (local o vercel) sin env vars
  const origin = new URL(req.url).origin;

  const res = await fetch(`${origin}/api/debug/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });

  const txt = await res.text();
  let data: any = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {}

  if (!res.ok) throw new Error(data?.error ?? txt ?? "Search error");
  return data?.matches ?? [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body?.messages as ChatMsg[] | undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages requerido" }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json({ error: "Falta GROQ_API_KEY" }, { status: 500 });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    // 1) embedding query
    await embedHF(lastUser);

    // 2) retrieval (usando origin real)
    const matches = await retrieveTopChunks(req, lastUser);

    const context = (matches || [])
      .slice(0, 5)
      .map((m: any, idx: number) => `# Fuente ${idx + 1}\n${m.content ?? ""}`)
      .join("\n\n");

    const system: ChatMsg = {
      role: "system",
      content:
        "Eres un asistente de concientización en ciberseguridad. Responde en español, simple, práctico y accionable. " +
        "Usa el CONTEXTO si es relevante. Si el contexto no ayuda, responde con conocimiento general. " +
        "No pidas datos sensibles. Si el usuario comparte contraseñas o info privada, pídele que la elimine.\n\n" +
        "CONTEXTO:\n" +
        context,
    };

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.3,
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
    return NextResponse.json({ answer, matchesCount: matches?.length ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Error desconocido" }, { status: 500 });
  }
}