// Reescritura de la consulta con el historial (experimento E2): convierte una pregunta de
// seguimiento en una pregunta que se entiende sola, para buscarla en el índice. Solo se
// aplica cuando hay historial; el generador sigue recibiendo la conversación original.

import type { ChatMsg, GenerateResult, GeneratorParams } from "@/lib/ragPipeline";

export type RewriteConfig = { enabled: boolean; params: GeneratorParams };

const INSTRUCCION = [
  "Reescribe la ÚLTIMA pregunta del usuario para que se entienda sin el resto de la conversación,",
  "usando el historial solo para completar lo que falta (de qué se habla, a quién se refiere).",
  "No respondas la pregunta, no agregues datos nuevos y conserva el idioma español.",
  "Devuelve únicamente la pregunta reescrita, en una sola línea.",
].join(" ");

export function rewriteMessages(history: ChatMsg[], question: string): ChatMsg[] {
  const dialogo = history.map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`).join("\n");
  return [
    { role: "system", content: INSTRUCCION },
    { role: "user", content: `Historial:\n${dialogo}\n\nÚltima pregunta: ${question}` },
  ];
}

export type RewriteOutcome = {
  query: string;
  rewritten: boolean;
  usage: Record<string, unknown> | null;
  error: string | null;
};

// Si la reescritura falla o devuelve vacío se usa la pregunta original y se anota el error:
// un fallo del paso extra no debe esconderse ni anular la consulta.
export async function rewriteQuery(
  history: ChatMsg[],
  question: string,
  config: RewriteConfig | undefined,
  generate: (messages: ChatMsg[], params: GeneratorParams) => Promise<GenerateResult>
): Promise<RewriteOutcome> {
  if (!config?.enabled || history.length === 0) {
    return { query: question, rewritten: false, usage: null, error: null };
  }
  try {
    const result = await generate(rewriteMessages(history, question), config.params);
    if (!result.ok) {
      return { query: question, rewritten: false, usage: null, error: `HTTP ${result.status}` };
    }
    const text = result.answer.replace(/\s+/g, " ").trim();
    if (!text) return { query: question, rewritten: false, usage: result.usage, error: "respuesta vacía" };
    return { query: text, rewritten: true, usage: result.usage, error: null };
  } catch (error) {
    return { query: question, rewritten: false, usage: null, error: error instanceof Error ? error.message : String(error) };
  }
}
