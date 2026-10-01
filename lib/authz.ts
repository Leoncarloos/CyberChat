import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  PENDING_MESSAGE,
  REJECTED_MESSAGE,
  readAccessClaims,
  type AccessClaims,
} from "@/lib/accessClaims";

type AuthOk = {
  ok: true;
  user: User;
  claims: AccessClaims;
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
};
type AuthFail = { ok: false; response: NextResponse };

function fail(error: string, status: number): AuthFail {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * Sesión válida + cuenta aprobada. El login cierra la sesión de un empleado no
 * aprobado, pero eso ocurre en el cliente y después de que Supabase ya emitió los
 * tokens; además un empleado rechazado con la sesión abierta la conserva. Por eso
 * cada ruta lo vuelve a comprobar: `getUser()` consulta el servidor de Auth, así que
 * el estado es el vigente y no el del token.
 */
export async function requireActiveUser(): Promise<AuthOk | AuthFail> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail("No auth", 401);

  const claims = readAccessClaims(data.user);
  if (!claims.role) return fail("Cuenta sin rol asignado", 403);
  if (claims.approvalStatus === "rejected") return fail(REJECTED_MESSAGE, 403);
  if (claims.approvalStatus !== "active") return fail(PENDING_MESSAGE, 403);

  return { ok: true, user: data.user, claims, supabase };
}

export async function requireAdmin(
  options: { forbiddenMessage?: string; requireRuc?: boolean } = {}
): Promise<AuthOk | AuthFail> {
  const { forbiddenMessage = "Solo administradores", requireRuc = true } = options;
  const auth = await requireActiveUser();
  if (!auth.ok) return auth;
  if (auth.claims.role !== "admin") return fail(forbiddenMessage, 403);
  if (requireRuc && !auth.claims.ruc) return fail("Administrador sin RUC configurado", 400);
  return auth;
}
