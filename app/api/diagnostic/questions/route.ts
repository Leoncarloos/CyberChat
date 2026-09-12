export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { diagnosticBank } from "@/lib/diagnosticBank";
import { diagnosticTopics, totalQuestions } from "@/lib/diagnosticTopics";

const LABEL_BY_KEY = new Map(diagnosticTopics.map((t) => [t.key, t.label]));

// Sin correctIndex ni explanation: la respuesta correcta no sale del servidor
// hasta que el usuario envía la suya a POST /api/diagnostic, que es quien califica.
export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "No auth" }, { status: 401 });
  }

  if (user.user_metadata?.diagnostic_done === true) {
    return NextResponse.json({ error: "Ya completaste el diagnóstico" }, { status: 409 });
  }

  return NextResponse.json({
    topics: diagnosticBank.map((topic) => ({
      key: topic.key,
      label: LABEL_BY_KEY.get(topic.key) ?? topic.key,
      questions: topic.questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
      })),
    })),
    totalQuestions,
  });
}
