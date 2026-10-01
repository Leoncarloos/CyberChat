export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { computeOrgMetrics } from "@/lib/orgMetrics";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const adminRuc = auth.claims.ruc;

    const metrics = await computeOrgMetrics(adminRuc);
    return NextResponse.json(metrics);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
