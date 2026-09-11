"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { forgotPasswordSchema } from "@/lib/validators/auth";

export default function ForgotPasswordPage() {
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Ingresa un correo válido.");
      return;
    }

    setIsSubmitting(true);
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsSubmitting(false);
    // Siempre mostramos el mismo resultado, exista o no la cuenta (anti user-enumeration).
    setSent(true);
  }

  return (
    <main className="app-shell auth-shell">
      <section className="auth-hero">
        <div className="space-y-6">
          <div className="brand-mark">CG</div>
          <div className="space-y-3">
            <p className="eyebrow text-[rgba(245,240,232,0.58)]">Acceso Seguro</p>
            <h1 className="display-title max-w-xl text-5xl font-black leading-none sm:text-6xl">
              Recupera el acceso a tu <em className="text-[var(--amber-glow)] not-italic">cuenta</em>
            </h1>
            <p className="max-w-lg text-base leading-7 text-[rgba(245,240,232,0.72)]">
              Te enviaremos un enlace a tu correo para que puedas crear una nueva
              contraseña de forma segura.
            </p>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="glass-card auth-form-card">
          <div className="mb-8 space-y-3">
            <p className="eyebrow">Recuperar contraseña</p>
            <h2 className="display-title text-4xl font-extrabold">¿Olvidaste tu contraseña?</h2>
            <p className="helper-text">
              Ingresa el correo con el que te registraste en CyberChat.
            </p>
          </div>

          {sent ? (
            <div className="space-y-6">
              <div className="status-banner success">
                Si el correo <strong>{email}</strong> tiene una cuenta registrada, te
                enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de
                entrada (y la carpeta de spam).
              </div>
              <a href="/login" className="secondary-button inline-flex">
                Volver a iniciar sesión
              </a>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <div>
                <label className="field-label" htmlFor="forgot-email">
                  Correo electrónico
                </label>
                <input
                  id="forgot-email"
                  className="field-input"
                  placeholder="equipo@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                />
                {fieldError ? (
                  <p className="mt-1 text-xs text-[var(--red)]">{fieldError}</p>
                ) : null}
              </div>

              <button type="submit" className="primary-button w-full" disabled={isSubmitting}>
                {isSubmitting ? "Enviando..." : "Enviar enlace de recuperación"}
              </button>
            </form>
          )}

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
            <p className="text-sm text-[var(--muted)]">¿Ya recordaste tu contraseña?</p>
            <a href="/login" className="secondary-button">
              Iniciar sesión
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
