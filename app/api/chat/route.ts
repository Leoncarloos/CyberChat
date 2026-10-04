export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedHF } from "@/lib/embedHF";
import { resolveOrgAdminId } from "@/lib/orgAdmin";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
type RpcMatch = { similarity?: number; content?: string };
type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: unknown;
};

const SIM_THRESHOLD = 0.38;
const MAX_CHUNKS = 5;
const MAX_HISTORY = 12;

// Todo fallo de procesamiento (embeddings, búsqueda, proveedor de IA) se le muestra
// igual al usuario: el detalle real va al log del servidor, nunca a la respuesta,
// para no exponer qué servicios hay detrás ni sus mensajes crudos.
const PROCESSING_ERROR = "Error al procesar la consulta, intente nuevamente.";

function processingError(logLabel: string, detail: unknown, status = 500) {
  console.error(`[/api/chat] ${logLabel}:`, detail);
  return NextResponse.json({ error: PROCESSING_ERROR }, { status });
}

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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages?: ChatMsg[];
      document_id?: string;
      conversation_id?: string;
    };
    const incoming = body.messages;
    const document_id = body.document_id ? String(body.document_id) : null;
    const conversationId = body.conversation_id ? String(body.conversation_id) : "";

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json({ error: "messages requerido" }, { status: 400 });
    }
    if (!conversationId) {
      return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return processingError("GROQ_API_KEY no configurada", null);
    }

    const auth = await requireActiveUser();
    if (!auth.ok) return auth.response;

    // La respuesta del asistente la guarda el servidor: RLS solo deja al usuario
    // insertar mensajes con role 'user', para que no pueda fabricar respuestas.
    const { data: conversation } = await supabaseAdmin()
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!conversation) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const lastUserMsg =
      [...incoming].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";

    if (!lastUserMsg) {
      return NextResponse.json({ error: "Último mensaje vacío" }, { status: 400 });
    }

    const query_embedding = await embedHF(lastUserMsg);

    // La base documental pertenece a la empresa, no al usuario: la sube el dueño
    // (documents.uploaded_by = admin) y la consultan todos sus empleados (HU23).
    // El RUC sale de la sesión, nunca del body, y el RPC sigue acotando por
    // uploaded_by, así que un document_id de otra empresa no devuelve nada.
    const scopeUserId = (await resolveOrgAdminId(auth.claims.ruc)) ?? auth.user.id;

    // supabaseAdmin: el RPC es SECURITY INVOKER y la política documents_select_own
    // limitaría al empleado a sus propios documentos, anulando el scope de empresa.
    const { data: matches, error: rpcErr } = await supabaseAdmin().rpc(
      "match_document_chunks_scoped",
      {
        query_embedding,
        match_count: MAX_CHUNKS,
        filter_user_id: scopeUserId,
        filter_document_id: document_id ?? null,
      }
    );

    if (rpcErr) return processingError("fallo la busqueda de contexto", rpcErr.message);

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
        model: "openai/gpt-oss-20b",
        // gpt-oss razona antes de responder: sin "low" el razonamiento agota
        // el presupuesto de tokens y el contenido llega vacio.
        reasoning_effort: "low",
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
      return processingError(
        `el servicio de IA respondio ${groqRes.status}`,
        groqData?.error ?? groqText ?? "Respuesta vacía",
        502
      );
    }

    const answer =
      groqData?.choices?.[0]?.message?.content ?? "No pude generar respuesta.";

    const { data: message, error: saveErr } = await supabaseAdmin()
      .from("messages")
      .insert({ conversation_id: conversationId, role: "assistant", content: answer })
      .select("*")
      .single();
    if (saveErr) return processingError("no se pudo guardar la respuesta", saveErr);

    return NextResponse.json({
      answer,
      message,
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
    // Cae aquí sobre todo si embedHF falla: para el usuario es el mismo fallo.
    return processingError("excepcion no controlada", error);
  }
}
