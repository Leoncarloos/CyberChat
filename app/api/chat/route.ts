export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
type EmbeddingRaw = number[] | number[][] | number[][][];
type RpcMatch = {
  similarity?: number;
  content?: string;
};
type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: unknown;
};

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

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function isNumberMatrix(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every((item) => isNumberArray(item));
}

function isNumberTensor(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.every((item) => isNumberMatrix(item));
}

function normalizeHFEmbedding(raw: EmbeddingRaw): number[] {
  if (isNumberArray(raw)) return raw;
  if (isNumberMatrix(raw)) return meanPool(raw);
  if (isNumberTensor(raw)) return meanPool(raw[0] ?? []);

  throw new Error("HF devolvió un formato inesperado");
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
  let raw: unknown = null;
  try {
    raw = rawText ? (JSON.parse(rawText) as EmbeddingRaw) : null;
  } catch {}

  if (!resp.ok) {
    const errorText = typeof raw === "object" && raw ? JSON.stringify(raw) : rawText;
    throw new Error(errorText || "HF error");
  }

  const emb = normalizeHFEmbedding((raw ?? []) as EmbeddingRaw);
  if (emb.length !== 384) throw new Error(`Embedding inválida: ${emb.length}`);
  return emb;
}

function trimHistory(messages: ChatMsg[], maxTurns = 18): ChatMsg[] {
  if (messages.length <= maxTurns) return messages;
  return messages.slice(messages.length - maxTurns);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: ChatMsg[]; document_id?: string };
    const incoming = body.messages;
    const document_id = body.document_id ? String(body.document_id) : null;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json({ error: "messages requerido" }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json({ error: "Falta GROQ_API_KEY" }, { status: 500 });
    }

    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });

    const user = auth?.user;
    if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const lastUser =
      [...incoming].reverse().find((message) => message.role === "user")?.content?.trim() ?? "";

    if (!lastUser) {
      return NextResponse.json({ error: "Último mensaje vacío" }, { status: 400 });
    }

    const query_embedding = await embedHF(lastUser);

    const { data: matches, error: rpcErr } = await supabase.rpc("match_document_chunks_scoped", {
      query_embedding,
      match_count: 6,
      filter_user_id: user.id,
      filter_document_id: document_id ?? null,
    });

    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

    const top = ((matches ?? []) as RpcMatch[]).slice(0, 5);
    const bestSim = Number(top[0]?.similarity ?? 0);
    const simThreshold = 0.25;

    const context =
      bestSim >= simThreshold
        ? top.map((match, index) => `# Fuente ${index + 1}\n${match.content ?? ""}`).join("\n\n")
        : "";

    const system: ChatMsg = {
      role: "system",
      content:
        "Eres CyberGuard, un asistente de concientización en ciberseguridad para empleados y MYPES.\n" +
        "- Responde en español claro, concreto y accionable.\n" +
        "- Ordena la respuesta usando encabezados con '###' cuando haya secciones.\n" +
        "- Usa listas numeradas para pasos y viñetas para recomendaciones.\n" +
        "- Si hay una advertencia importante, escribe una línea que empiece con 'IMPORTANTE:'.\n" +
        "- Si el usuario pide señales o checklist, responde de forma fácil de escanear.\n" +
        "- Usa el CONTEXTO solo si realmente aporta valor.\n" +
        "- Si el contexto no ayuda, dilo brevemente y responde con conocimiento general.\n" +
        "- No pidas datos sensibles.\n\n" +
        "CONTEXTO:\n" +
        (context || "(sin contexto relevante)"),
    };

    const messages = trimHistory(incoming, 18);

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [system, ...messages],
      }),
      cache: "no-store",
    });

    const groqText = await groqRes.text();
    let groqData: GroqResponse | null = null;
    try {
      groqData = groqText ? (JSON.parse(groqText) as GroqResponse) : null;
    } catch {}

    if (!groqRes.ok) {
      return NextResponse.json(
        { error: "Groq error", details: groqData?.error ?? groqText ?? "Respuesta vacía" },
        { status: 500 }
      );
    }

    const answer = groqData?.choices?.[0]?.message?.content ?? "No pude generar respuesta.";

    return NextResponse.json({
      answer,
      matchesCount: context ? top.length : 0,
      bestSimilarity: bestSim,
      usedContext: Boolean(context),
      sources: context
        ? top.map((item, index) => ({
            rank: index + 1,
            similarity: Number(item.similarity ?? 0),
            preview: String(item.content ?? "").slice(0, 220),
          }))
        : [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
