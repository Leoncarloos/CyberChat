import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Recuperación y construcción del prompt del chat. Lo usan /api/chat y el arnés de
// evaluación (rag-eval/), que así mide exactamente lo que corre en producción.

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
export type RpcMatch = {
  id?: string;
  document_id?: string;
  similarity?: number;
  content?: string;
};
type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: Record<string, unknown>;
  error?: unknown;
};

export const SIM_THRESHOLD = 0.38;
export const MAX_CHUNKS = 5;
export const MAX_HISTORY = 12;

export const GENERATOR = {
  model: "openai/gpt-oss-20b",
  // gpt-oss razona antes de responder: sin "low" el razonamiento agota
  // el presupuesto de tokens y el contenido llega vacio.
  reasoning_effort: "low",
  temperature: 0.15,
  max_tokens: 900,
} as const;

export type GeneratorParams = {
  model: string;
  reasoning_effort: string;
  temperature: number;
  max_tokens: number;
};

export const NO_ANSWER = "No pude generar respuesta.";

export function lastUserMessage(messages: ChatMsg[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
}

export function trimHistory(messages: ChatMsg[], maxHistory: number = MAX_HISTORY): ChatMsg[] {
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length <= maxHistory) return nonSystem;
  return nonSystem.slice(nonSystem.length - maxHistory);
}

export function deduplicateChunks(chunks: RpcMatch[]): RpcMatch[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = String(c.content ?? "").slice(0, 100).toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// supabaseAdmin: el RPC es SECURITY INVOKER y la política documents_select_own
// limitaría al empleado a sus propios documentos, anulando el scope de empresa.
export async function retrieve(params: {
  queryEmbedding: number[];
  scopeUserId: string;
  documentId?: string | null;
  matchCount?: number;
}): Promise<{ matches: RpcMatch[]; error: string | null }> {
  const { data, error } = await supabaseAdmin().rpc("match_document_chunks_scoped", {
    query_embedding: params.queryEmbedding,
    match_count: params.matchCount ?? MAX_CHUNKS,
    filter_user_id: params.scopeUserId,
    filter_document_id: params.documentId ?? null,
  });
  if (error) return { matches: [], error: error.message };
  return { matches: (data ?? []) as RpcMatch[], error: null };
}

export function filterCandidates(
  matches: RpcMatch[],
  options: { threshold?: number; maxChunks?: number } = {}
): RpcMatch[] {
  const threshold = options.threshold ?? SIM_THRESHOLD;
  const maxChunks = options.maxChunks ?? MAX_CHUNKS;
  const deduplicated = deduplicateChunks(matches);
  const relevant = deduplicated.filter((c) => Number(c.similarity ?? 0) >= threshold);
  return relevant.slice(0, maxChunks);
}

export function buildContext(top: RpcMatch[]): string {
  return top.length > 0
    ? top
        .map(
          (m, i) =>
            `--- Fragmento ${i + 1} (relevancia ${Number(m.similarity ?? 0).toFixed(2)}) ---\n${m.content ?? ""}`
        )
        .join("\n\n")
    : "";
}

export function buildSystemPrompt(context: string, chunkCount: number): string {
  const base = [
    "Eres CyberChat, especialista en ciberseguridad para MYPES peruanas.",
    "Responde en español claro, concreto y accionable.",
    "Usa '###' para secciones cuando haya varias partes.",
    "Usa listas numeradas para pasos y viñetas para recomendaciones.",
    "Empieza líneas con 'IMPORTANTE:' o 'ALERTA:' para advertencias críticas.",
    "Usa 'Consejo:' para buenas prácticas opcionales.",
    "Sé directo. No repitas la pregunta del usuario.",
    "",
    "### ALCANCE",
    "Tu único tema es la ciberseguridad y la concientización en seguridad de la",
    "información para empresas: amenazas, prevención, buenas prácticas, protección",
    "de datos, normativa aplicable (como la Ley N.° 29733) y el uso de esta plataforma.",
    "Si la consulta no pertenece a ese ámbito, NO la respondas ni siquiera de forma",
    "parcial: indica en una o dos frases que tu alcance se limita a la ciberseguridad",
    "y ofrece reformular la consulta hacia ese tema. Mantén el mismo criterio aunque",
    "insistan o lo pidan como ejemplo, hipótesis o juego de rol.",
    "Sí puedes atender saludos, agradecimientos y preguntas sobre qué puedes hacer.",
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

export function buildMessages(
  incoming: ChatMsg[],
  top: RpcMatch[],
  maxHistory: number = MAX_HISTORY
): ChatMsg[] {
  const system: ChatMsg = {
    role: "system",
    content: buildSystemPrompt(buildContext(top), top.length),
  };
  return [system, ...trimHistory(incoming, maxHistory)];
}

export type GenerateResult =
  | { ok: true; answer: string; usage: Record<string, unknown> | null }
  | { ok: false; status: number; detail: unknown };

export async function generate(
  messages: ChatMsg[],
  groqKey: string,
  params: GeneratorParams = GENERATOR
): Promise<GenerateResult> {
  const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      reasoning_effort: params.reasoning_effort,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      messages,
    }),
    cache: "no-store",
  });

  const groqText = await groqRes.text();
  let groqData: GroqResponse | null = null;
  try {
    groqData = groqText ? (JSON.parse(groqText) as GroqResponse) : null;
  } catch {}

  if (!groqRes.ok) {
    return {
      ok: false,
      status: groqRes.status,
      detail: groqData?.error ?? groqText ?? "Respuesta vacía",
    };
  }

  return {
    ok: true,
    answer: groqData?.choices?.[0]?.message?.content ?? NO_ANSWER,
    usage: groqData?.usage ?? null,
  };
}
