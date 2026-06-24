export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { computeOrgMetrics } from "@/lib/orgMetrics";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }

    const meta = user.user_metadata ?? {};
    if (meta.role !== "admin") {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }
    const adminRuc: string = meta.ruc ?? "";
    if (!adminRuc) {
      return NextResponse.json({ error: "Administrador sin RUC configurado" }, { status: 400 });
    }

    const metrics = await computeOrgMetrics(adminRuc);
    return NextResponse.json(metrics);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
