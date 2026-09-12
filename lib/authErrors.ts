const AUTH_ERROR_MESSAGES: Record<string, string> = {
  email_exists: "Ya existe una cuenta registrada con ese correo electrónico",
  user_already_exists: "Ya existe una cuenta registrada con ese correo electrónico",
  weak_password: "La contraseña no cumple los requisitos de seguridad",
  email_address_invalid: "El correo electrónico no es válido",
  over_email_send_rate_limit:
    "Se enviaron demasiados correos en poco tiempo. Intenta de nuevo en unos minutos.",
};

const DEFAULT_MESSAGE =
  "No se pudo completar el registro. Intenta nuevamente o contacta al soporte técnico.";

/**
 * Traduce errores de Supabase Auth (código estable, ej. "email_exists") a
 * español. Nunca deja pasar el mensaje crudo en inglés — un código no
 * mapeado cae al mensaje genérico en vez de exponerlo tal cual.
 */
export function translateAuthError(error: { code?: string | null }): string {
  return (error.code && AUTH_ERROR_MESSAGES[error.code]) || DEFAULT_MESSAGE;
}
