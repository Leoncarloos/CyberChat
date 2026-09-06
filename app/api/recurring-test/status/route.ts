export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RECURRENCE_DAYS = 5;

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "No auth" }, { status: 401 });

    const meta = user.user_metadata ?? {};
    const role = typeof meta.role === "string" ? meta.role : "employee";

    if (!meta.diagnostic_done) {
      return NextResponse.json({ due: false, reason: "diagnostic_pending" });
    }

    const admin = supabaseAdmin();

    const [attemptRes, legacyRes] = await Promise.all([
      admin
        .from("evaluation_attempts")
        .select("taken_at")
        .eq("user_id", user.id)
        .order("taken_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("quiz_results")
        .select("taken_at")
        .eq("user_id", user.id)
        .order("taken_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const lastAttempt = (attemptRes.data as { taken_at: string } | null)?.taken_at ?? null;
    const lastLegacy = (legacyRes.data as { taken_at: string } | null)?.taken_at ?? null;
    const lastCompleted =
      lastAttempt && lastLegacy
        ? lastAttempt > lastLegacy
          ? lastAttempt
          : lastLegacy
        : lastAttempt ?? lastLegacy;

    // La recurrencia solo arranca después del primer post-test completado.
    if (!lastCompleted) {
      return NextResponse.json({ due: false, reason: "posttest_pending" });
    }

    const lastMs = new Date(lastCompleted).getTime();
    const daysSince = Math.floor((Date.now() - lastMs) / 86400000);
    const nextDueAt = new Date(lastMs + RECURRENCE_DAYS * 86400000).toISOString();
    const due = daysSince >= RECURRENCE_DAYS;

    return NextResponse.json({
      due,
      blocking: due && role === "employee",
      daysSince,
      lastCompletedAt: lastCompleted,
      nextDueAt,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
