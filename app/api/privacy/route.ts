export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ARCO_TYPES, POLICY_VERSION, addBusinessDays, type ArcoType } from "@/lib/privacy";
import { flattenFieldErrors } from "@/lib/validators/shared";

const requestSchema = z.object({
  type: z.enum(Object.keys(ARCO_TYPES) as [ArcoType, ...ArcoType[]]),
  detail: z
    .string()
    .trim()
    .min(10, "Describe tu solicitud con al menos 10 caracteres")
    .max(2000, "Máximo 2000 caracteres"),
});

const consentSchema = z.object({
  purpose: z.literal("investigacion"),
  granted: z.boolean(),
});

// Solicitudes ARCO y consentimientos del usuario con sesión. No exige cuenta aprobada:
// un empleado pendiente o rechazado también puede ejercer sus derechos.
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const admin = supabaseAdmin();
  const [requests, consents] = await Promise.all([
    admin
      .from("arco_requests")
      .select("id, request_type, detail, status, created_at, due_at, response, responded_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("consent_records")
      .select("purpose, policy_version, granted, granted_at, revoked_at")
      .eq("user_id", auth.user.id)
      .order("granted_at", { ascending: false }),
  ]);
  if (requests.error || consents.error) {
    return NextResponse.json({ error: "No se pudieron cargar tus datos" }, { status: 500 });
  }

  return NextResponse.json({ requests: requests.data, consents: consents.data, email: auth.user.email });
}

// Registra una solicitud ARCO. La fecha límite la calcula el servidor (art. 69 del Reglamento).
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos ingresados", fieldErrors: flattenFieldErrors(parsed.error) },
      { status: 400 }
    );
  }

  const { type, detail } = parsed.data;
  const { data, error } = await supabaseAdmin()
    .from("arco_requests")
    .insert({
      user_id: auth.user.id,
      request_type: type,
      detail,
      contact_email: auth.user.email ?? "",
      due_at: addBusinessDays(new Date(), ARCO_TYPES[type].businessDays),
    })
    .select("id, request_type, detail, status, created_at, due_at, response, responded_at")
    .single();
  if (error) return NextResponse.json({ error: "No se pudo registrar la solicitud" }, { status: 500 });

  return NextResponse.json({ request: data });
}

// Otorga o revoca el consentimiento facultativo (investigación). Revocarlo no afecta el
// servicio (Reglamento, art. 10.2) y debe ser tan simple como darlo (art. 10.4).
export async function PATCH(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = consentSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const { error: revokeErr } = await admin
    .from("consent_records")
    .update({ revoked_at: now })
    .eq("user_id", auth.user.id)
    .eq("purpose", parsed.data.purpose)
    .is("revoked_at", null);
  if (revokeErr) return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });

  const { error } = await admin.from("consent_records").insert({
    user_id: auth.user.id,
    purpose: parsed.data.purpose,
    policy_version: POLICY_VERSION,
    granted: parsed.data.granted,
  });
  if (error) return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
