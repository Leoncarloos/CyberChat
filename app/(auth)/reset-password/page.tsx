"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { resetPasswordSchema, flattenFieldErrors } from "@/lib/validators/auth";
import PasswordStrengthHint from "@/components/PasswordStrengthHint";

type LinkStatus = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [linkStatus, setLinkStatus] = useState<LinkStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<{ password?: boolean; confirmPassword?: boolean }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setLinkStatus("ready");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setLinkStatus("ready");
    });

    const timeout = setTimeout(() => {
      setLinkStatus((prev) => (prev === "checking" ? "invalid" : prev));
    }, 3000);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validation = resetPasswordSchema.safeParse({ password, confirmPassword });
  const fieldErrors = validation.success ? {} : flattenFieldErrors(validation.error);
  const errorFor = (key: "password" | "confirmPassword") =>
    touched[key] ? fieldErrors[key] : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setTouched({ password: true, confirmPassword: true });
    if (!validation.success) return;

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: validation.data.password });
    setIsSubmitting(false);

    if (error) {
      setServerError("No fue posible actualizar tu contraseña. Solicita un nuevo enlace.");
      return;
    }

    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => router.push("/login?reset=success"), 2000);
  }

  return (
    <main className="app-shell auth-shell">
      <section className="auth-hero">
        <div className="space-y-6">
          <div className="brand-mark">CG</div>
          <div className="space-y-3">
            <p className="eyebrow text-[rgba(245,240,232,0.58)]">Acceso Seguro</p>
            <h1 className="display-title max-w-xl text-5xl font-black leading-none sm:text-6xl">
              Crea una nueva <em className="text-[var(--amber-glow)] not-italic">contraseña</em>
            </h1>
            <p className="max-w-lg text-base leading-7 text-[rgba(245,240,232,0.72)]">
              Elige una contraseña segura para volver a acceder a tu centro de mando
              CyberChat.
            </p>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="glass-card auth-form-card">
          {linkStatus === "checking" && (
            <p className="helper-text">Verificando tu enlace de recuperación...</p>
          )}

          {linkStatus === "invalid" && (
            <div className="space-y-6">
              <div className="mb-8 space-y-3">
                <p className="eyebrow">Enlace inválido</p>
                <h2 className="display-title text-4xl font-extrabold">
                  Este enlace ya no es válido
                </h2>
                <p className="helper-text">
                  Puede haber expirado o ya haberse usado. Solicita uno nuevo para
                  continuar.
                </p>
              </div>
              <a href="/forgot-password" className="primary-button inline-flex">
                Solicitar nuevo enlace
              </a>
            </div>
          )}

          {linkStatus === "ready" && !done && (
            <>
              <div className="mb-8 space-y-3">
                <p className="eyebrow">Nueva contraseña</p>
                <h2 className="display-title text-4xl font-extrabold">Restablecer contraseña</h2>
                <p className="helper-text">
                  Ingresa y confirma tu nueva contraseña.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5" noValidate>
                <div>
                  <label className="field-label" htmlFor="new-password">
                    Nueva contraseña
                  </label>
                  <input
                    id="new-password"
                    className="field-input"
                    placeholder="Crea una contraseña segura"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                    autoComplete="new-password"
                    required
                  />
                  <PasswordStrengthHint password={password} />
                  {errorFor("password") ? (
                    <p className="mt-1 text-xs text-[var(--red)]">{errorFor("password")}</p>
                  ) : null}
                </div>

                <div>
                  <label className="field-label" htmlFor="confirm-new-password">
                    Confirmar contraseña
                  </label>
                  <input
                    id="confirm-new-password"
                    className="field-input"
                    placeholder="Repite tu contraseña"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
                    autoComplete="new-password"
                    required
                  />
                  {errorFor("confirmPassword") ? (
                    <p className="mt-1 text-xs text-[var(--red)]">{errorFor("confirmPassword")}</p>
                  ) : null}
                </div>

                {serverError ? <div className="status-banner error">{serverError}</div> : null}

                <button type="submit" className="primary-button w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Actualizando..." : "Actualizar contraseña"}
                </button>
              </form>
            </>
          )}

          {done && (
            <div className="status-banner success">
              Contraseña actualizada. Redirigiendo al inicio de sesión...
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
