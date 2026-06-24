export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedHF } from "@/lib/embedHF";

type PostTestQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

const CIBERSEC_TOPICS = [
  "phishing ingeniería social correo malicioso",
  "contraseñas seguras autenticación doble factor",
  "ransomware malware protección backups",
  "accesos permisos usuarios control",
  "datos sensibles privacidad Ley 29733",
  "redes WiFi seguridad empresarial",
  "incidentes respuesta resiliencia MYPE",
  "canales venta digitales fraude",
];

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const meta = user.user_metadata ?? {};
    if (!meta.diagnostic_done) {
      return NextResponse.json({ error: "Completa el diagnóstico primero" }, { status: 403 });
    }

    const userRuc: string = meta.ruc ?? "";
    const admin = supabaseAdmin();

    // Find admin of same RUC
    let adminUserId: string | null = null;
    if (userRuc) {
      const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const adminUser = (usersData?.users ?? []).find((u) => {
        const m = u.user_metadata ?? {};
        return m.role === "admin" && m.ruc === userRuc;
      });
      adminUserId = adminUser?.id ?? null;
    }

    // RAG: gather context from company docs across multiple topics
    let companyContext = "";
    if (adminUserId) {
      try {
        const chunkSets = await Promise.all(
          CIBERSEC_TOPICS.slice(0, 4).map(async (topic) => {
            const embedding = await embedHF(topic);
            const { data: chunks } = await admin.rpc("match_document_chunks_scoped", {
              query_embedding: embedding,
              match_count: 2,
              filter_user_id: adminUserId,
              filter_document_id: null,
            });
            return (chunks ?? []) as { content: string }[];
          })
        );

        const seen = new Set<string>();
        const unique: string[] = [];
        for (const chunks of chunkSets) {
          for (const c of chunks) {
            const key = c.content.slice(0, 80);
            if (!seen.has(key)) {
              seen.add(key);
              unique.push(c.content);
            }
          }
        }
        companyContext = unique.slice(0, 6).join("\n\n---\n\n");
      } catch {}
    }

    const contextBlock = companyContext
      ? `Documentos de la empresa del usuario:\n${companyContext}\n\nUsa este contenido para generar preguntas contextualizadas. Combina con conocimiento general de ciberseguridad.`
      : "No hay documentos empresariales. Genera las preguntas usando conocimiento general de ciberseguridad para MYPES peruanas.";

    const prompt = `Eres un experto en ciberseguridad para MYPES peruanas. Genera exactamente 10 preguntas de opción múltiple para un post-test de evaluación final.

${contextBlock}

Reglas:
- 10 preguntas, 4 opciones cada una (A, B, C, D)
- Cubre distintas temáticas: phishing, contraseñas, accesos, datos, redes, incidentes, IA y fraude digital
- Nivel práctico, ejemplos del contexto MYPE peruano
- Preguntas diferentes al estilo de evaluación diagnóstica inicial
- Una sola respuesta correcta por pregunta
- Explicación breve de la respuesta correcta (1-2 oraciones)

Responde ÚNICAMENTE con JSON válido sin bloques markdown:
{
  "questions": [
    {
      "question": "texto de la pregunta",
      "options": ["opción A", "opción B", "opción C", "opción D"],
      "correctIndex": 0,
      "explanation": "por qué esta es la respuesta correcta"
    }
  ]
}`;

    const groqKey = process.env.GROQ_API_KEY ?? "";
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 2400,
      }),
    });

    const groqJson = (await groqRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const raw = groqJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: { questions: PostTestQuestion[] } = { questions: [] };
    try {
      const clean = raw
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(clean) as { questions: PostTestQuestion[] };
    } catch {
      return NextResponse.json({ error: "Error al generar preguntas" }, { status: 500 });
    }

    const questions = (parsed.questions ?? []).slice(0, 10);
    if (questions.length < 5) {
      return NextResponse.json({ error: "No se generaron suficientes preguntas" }, { status: 500 });
    }

    return NextResponse.json({ questions, usedCompanyDocs: Boolean(companyContext) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
