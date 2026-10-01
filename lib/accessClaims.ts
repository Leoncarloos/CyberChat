/**
 * Datos de autorización del usuario: rol, RUC, estado de aprobación y si ya rindió
 * el diagnóstico. Viven en `app_metadata` porque `user_metadata` lo puede editar el
 * propio usuario con `supabase.auth.updateUser({ data })` usando la clave anon; leerlos
 * de ahí permitiría auto-aprobarse o ascender a admin. Solo la service_role escribe
 * `app_metadata` (`auth.admin.createUser` / `updateUserById`, que fusiona las claves).
 */
export type Role = "admin" | "employee";
export type ApprovalStatus = "active" | "pending" | "rejected";

export const PENDING_MESSAGE = "Tu acceso todavía no ha sido aprobado por el administrador de tu empresa.";
export const REJECTED_MESSAGE =
  "Tu acceso fue rechazado por el administrador de tu empresa. Contáctalo para revisar tu solicitud.";

export type AccessClaims = {
  role: Role | null;
  ruc: string;
  approvalStatus: ApprovalStatus;
  diagnosticDone: boolean;
};

type RawClaims = {
  role?: unknown;
  ruc?: unknown;
  approval_status?: unknown;
  diagnostic_done?: unknown;
};

export function readAccessClaims(user: { app_metadata?: unknown } | null | undefined): AccessClaims {
  const raw = (user?.app_metadata ?? {}) as RawClaims;
  const role = raw.role === "admin" || raw.role === "employee" ? raw.role : null;
  const approvalStatus: ApprovalStatus =
    raw.approval_status === "active" || raw.approval_status === "rejected"
      ? raw.approval_status
      : "pending";

  return {
    role,
    ruc: typeof raw.ruc === "string" ? raw.ruc : "",
    approvalStatus,
    diagnosticDone: raw.diagnostic_done === true,
  };
}
