import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { POLICY_VERSION } from "@/lib/privacy";

/**
 * Registra el consentimiento dado al registrarse. Si no se puede guardar, se elimina la
 * cuenta recién creada: el responsable debe poder probar el consentimiento (Reglamento,
 * art. 9), así que no se deja una cuenta sin esa prueba.
 */
export async function recordRegistrationConsent(
  userId: string,
  researchConsent: boolean
): Promise<{ ok: true } | { ok: false }> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("consent_records").insert([
    { user_id: userId, purpose: "servicio", policy_version: POLICY_VERSION, granted: true },
    { user_id: userId, purpose: "investigacion", policy_version: POLICY_VERSION, granted: researchConsent },
  ]);
  if (!error) return { ok: true };

  console.error("[consent] no se pudo registrar el consentimiento:", error.message);
  await admin.auth.admin.deleteUser(userId);
  return { ok: false };
}
