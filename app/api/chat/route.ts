export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedHF } from "@/lib/embedHF";
import { resolveOrgAdminId } from "@/lib/orgAdmin";
import {
  buildMessages,
  filterCandidates,
  generate,
  lastUserMessage,
  retrieve,
  type ChatMsg,
} from "@/lib/ragPipeline";

// Todo fallo de procesamiento (embeddings, búsqueda, proveedor de IA) se le muestra
// igual al usuario: el detalle real va al log del servidor, nunca a la respuesta,
// para no exponer qué servicios hay detrás ni sus mensajes crudos.
const PROCESSING_ERROR = "Error al procesar la consulta, intente nuevamente.";

function processingError(logLabel: string, detail: unknown, status = 500) {
  console.error(`[/api/chat] ${logLabel}:`, detail);
  return NextResponse.json({ error: PROCESSING_ERROR }, { status });
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

    const lastUserMsg = lastUserMessage(incoming);

    if (!lastUserMsg) {
      return NextResponse.json({ error: "Último mensaje vacío" }, { status: 400 });
    }

    const query_embedding = await embedHF(lastUserMsg);

    // La base documental pertenece a la empresa, no al usuario: la sube el dueño
    // (documents.uploaded_by = admin) y la consultan todos sus empleados (HU23).
    // El RUC sale de la sesión, nunca del body, y el RPC sigue acotando por
    // uploaded_by, así que un document_id de otra empresa no devuelve nada.
    const scopeUserId = (await resolveOrgAdminId(auth.claims.ruc)) ?? auth.user.id;

    const { matches, error: rpcErr } = await retrieve({
      queryEmbedding: query_embedding,
      scopeUserId,
      documentId: document_id,
    });

    if (rpcErr !== null) return processingError("fallo la busqueda de contexto", rpcErr);

    const top = filterCandidates(matches);
    const bestSim = Number(top[0]?.similarity ?? 0);

    const generation = await generate(buildMessages(incoming, top), groqKey);

    if (!generation.ok) {
      return processingError(
        `el servicio de IA respondio ${generation.status}`,
        generation.detail,
        502
      );
    }

    const answer = generation.answer;

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
