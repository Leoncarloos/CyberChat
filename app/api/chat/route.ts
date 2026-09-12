export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { embedHF } from "@/lib/embedHF";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
type RpcMatch = { similarity?: number; content?: string };
type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: unknown;
};

const SIM_THRESHOLD = 0.38;
const MAX_CHUNKS = 5;
const MAX_HISTORY = 12;

function trimHistory(messages: ChatMsg[]): ChatMsg[] {
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length <= MAX_HISTORY) return nonSystem;
  return nonSystem.slice(nonSystem.length - MAX_HISTORY);
}

function deduplicateChunks(chunks: RpcMatch[]): RpcMatch[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = String(c.content ?? "").slice(0, 100).toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSystemPrompt(context: string, chunkCount: number): string {
  const base = [
    "Eres CyberGuard, especialista en ciberseguridad para MYPES peruanas.",
    "Responde en español claro, concreto y accionable.",
    "Usa '###' para secciones cuando haya varias partes.",
    "Usa listas numeradas para pasos y viñetas para recomendaciones.",
    "Empieza líneas con 'IMPORTANTE:' o 'ALERTA:' para advertencias críticas.",
    "Usa 'Consejo:' para buenas prácticas opcionales.",
    "Sé directo. No repitas la pregunta del usuario.",
  ].join("\n");

  if (!context) {
    return [
      base,
      "",
      "### SIN CONTEXTO DOCUMENTAL",
      "No se encontraron fragmentos relevantes en la base de conocimiento de la empresa.",
      "Responde con conocimiento general de ciberseguridad para MYPES.",
      "Al final, menciona brevemente que el administrador puede subir documentos propios",
      "en el módulo Admin para obtener respuestas basadas en las políticas de la empresa.",
    ].join("\n");
  }

  return [
    base,
    "",
    `### CONTEXTO DOCUMENTAL (${chunkCount} fragmentos recuperados)`,
    "Los fragmentos a continuación provienen de documentos subidos por la empresa del usuario.",
    "INSTRUCCIONES:",
    "- Basa tu respuesta PRINCIPALMENTE en estos fragmentos.",
    "- Cuando uses información del contexto, indica 'Según los documentos de tu empresa...'",
    "- Si el contexto cubre parcialmente la pregunta, completa con conocimiento general",
    "  pero diferéncialo claramente: 'Adicionalmente, en general...'",
    "- Si el contexto no es relevante para la pregunta, ignóralo y responde con conocimiento general.",
    "- NO inventes datos, cifras ni normativas que no estén en el contexto.",
    "",
    "FRAGMENTOS:",
    context,
  ].join("\n");
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
    if (!auth?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const lastUserMsg =
      [...incoming].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";

    if (!lastUserMsg) {
      return NextResponse.json({ error: "Último mensaje vacío" }, { status: 400 });
    }

    const query_embedding = await embedHF(lastUserMsg);

    const { data: matches, error: rpcErr } = await supabase.rpc(
      "match_document_chunks_scoped",
      {
        query_embedding,
        match_count: MAX_CHUNKS,
        filter_user_id: auth.user.id,
        filter_document_id: document_id ?? null,
      }
    );

    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

    const deduplicated = deduplicateChunks((matches ?? []) as RpcMatch[]);
    const relevant = deduplicated.filter((c) => Number(c.similarity ?? 0) >= SIM_THRESHOLD);
    const top = relevant.slice(0, MAX_CHUNKS);
    const bestSim = Number(top[0]?.similarity ?? 0);

    const context = top.length > 0
      ? top
          .map(
            (m, i) =>
              `--- Fragmento ${i + 1} (relevancia ${Number(m.similarity ?? 0).toFixed(2)}) ---\n${m.content ?? ""}`
          )
          .join("\n\n")
      : "";

    const system: ChatMsg = {
      role: "system",
      content: buildSystemPrompt(context, top.length),
    };

    const messages = trimHistory(incoming);

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        temperature: 0.15,
        max_tokens: 900,
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

    const answer =
      groqData?.choices?.[0]?.message?.content ?? "No pude generar respuesta.";

    return NextResponse.json({
      answer,
      matchesCount: top.length,
      bestSimilarity: bestSim,
      usedContext: top.length > 0,
      sources: top.map((item, i) => ({
        rank: i + 1,
        similarity: Number(item.similarity ?? 0),
        preview: String(item.content ?? "").slice(0, 220),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
