"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { registerAdminSchema, flattenFieldErrors } from "@/lib/validators/auth";
import PasswordStrengthHint from "@/components/PasswordStrengthHint";

type AdminRegisterForm = {
  ruc: string;
  businessName: string;
  tradeName: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
};

const initialForm: AdminRegisterForm = {
  ruc: "",
  businessName: "",
  tradeName: "",
  ownerName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  acceptedTerms: false,
};

type ValidatedField = Exclude<keyof AdminRegisterForm, "acceptedTerms">;

export default function AdminRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<AdminRegisterForm>(initialForm);
  const [touched, setTouched] = useState<Partial<Record<ValidatedField, boolean>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validation = useMemo(
    () =>
      registerAdminSchema.safeParse({
        ruc: form.ruc,
        businessName: form.businessName,
        tradeName: form.tradeName,
        ownerName: form.ownerName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        confirmPassword: form.confirmPassword,
      }),
    [form]
  );
  const fieldErrors = validation.success ? {} : flattenFieldErrors(validation.error);

  function updateField<K extends keyof AdminRegisterForm>(key: K, value: AdminRegisterForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function markTouched(key: ValidatedField) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function errorFor(key: ValidatedField) {
    return touched[key] ? fieldErrors[key] : undefined;
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setTouched({
      ruc: true,
      businessName: true,
      tradeName: true,
      ownerName: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
    });

    if (!form.acceptedTerms) {
      setServerError("Debes aceptar los términos para continuar.");
      return;
    }

    if (!validation.success) return;

    setIsSubmitting(true);

    const res = await fetch("/api/auth/register-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validation.data),
    });

    setIsSubmitting(false);
    const data = (await res.json()) as { error?: string; fieldErrors?: Record<string, string> };

    if (!res.ok) {
      setServerError(data.error ?? "No se pudo crear la cuenta administradora.");
      return;
    }

    router.push("/login?registered=admin");
  }

  return (
    <main className="app-shell min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto grid max-w-[1280px] gap-6 lg:grid-cols-[1.2fr_0.9fr]">
        <section className="glass-card rounded-[1.8rem] p-5 sm:p-7">
          <div className="mb-6 space-y-2 border-b border-[var(--border)] pb-5">
            <p className="eyebrow">Registro de Empresa</p>
            <h1 className="display-title text-4xl font-extrabold">Únase a la red de protección digital</h1>
            <p className="helper-text">
              Completa los datos de la empresa y del representante principal para crear la cuenta
              administradora.
            </p>
          </div>

          <form onSubmit={onRegister} className="space-y-7" noValidate>
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
                <span className="feature-icon">EMP</span>
                <h2 className="text-lg font-bold text-[var(--amber-dim)]">Datos de la Empresa</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="ruc">
                    Número de RUC
                  </label>
                  <input
                    id="ruc"
                    className="field-input"
                    placeholder="Ej. 20123456789"
                    value={form.ruc}
                    onChange={(e) => updateField("ruc", e.target.value)}
                    onBlur={() => markTouched("ruc")}
                    inputMode="numeric"
                    maxLength={11}
                    required
                  />
                  {errorFor("ruc") ? (
                    <p className="mt-1 text-xs text-[var(--red)]">{errorFor("ruc")}</p>
                  ) : null}
                </div>

                <div>
                  <label className="field-label" htmlFor="business-name">
                    Razón social
                  </label>
                  <input
                    id="business-name"
                    className="field-input"
                    placeholder="Ej. Mi Empresa SAC"
                    value={form.businessName}
                    onChange={(e) => updateField("businessName", e.target.value)}
                    onBlur={() => markTouched("businessName")}
                    required
                  />
                  {errorFor("businessName") ? (
                    <p className="mt-1 text-xs text-[var(--red)]">{errorFor("businessName")}</p>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="trade-name">
                  Nombre comercial
                </label>
                <input
                  id="trade-name"
                  className="field-input"
                  placeholder="¿Cómo conocen a su empresa?"
                  value={form.tradeName}
                  onChange={(e) => updateField("tradeName", e.target.value)}
                  onBlur={() => markTouched("tradeName")}
                />
                {errorFor("tradeName") ? (
                  <p className="mt-1 text-xs text-[var(--red)]">{errorFor("tradeName")}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
                <span className="feature-icon">ADM</span>
                <h2 className="text-lg font-bold text-[var(--amber-dim)]">
                  Datos Personales del Dueño o Representante
                </h2>
              </div>

              <div>
                <label className="field-label" htmlFor="owner-name">
                  Nombres y apellidos completos
                </label>
                <input
                  id="owner-name"
                  className="field-input"
                  placeholder="Ingrese sus nombres y apellidos"
                  value={form.ownerName}
                  onChange={(e) => updateField("ownerName", e.target.value)}
                  onBlur={() => markTouched("ownerName")}
                  required
                />
                {errorFor("ownerName") ? (
                  <p className="mt-1 text-xs text-[var(--red)]">{errorFor("ownerName")}</p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="admin-email">
                    Correo electrónico
                  </label>
                  <input
                    id="admin-email"
                    className="field-input"
                    placeholder="correo@empresa.com"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    onBlur={() => markTouched("email")}
                    autoComplete="email"
                    required
                  />
                  {errorFor("email") ? (
                    <p className="mt-1 text-xs text-[var(--red)]">{errorFor("email")}</p>
                  ) : null}
                </div>

                <div>
                  <label className="field-label" htmlFor="phone">
                    Número de celular
                  </label>
                  <input
                    id="phone"
                    className="field-input"
                    placeholder="987 654 321"
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    onBlur={() => markTouched("phone")}
                    inputMode="numeric"
                    maxLength={9}
                    required
                  />
                  {errorFor("phone") ? (
                    <p className="mt-1 text-xs text-[var(--red)]">{errorFor("phone")}</p>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="admin-password">
                  Contraseña
                </label>
                <input
                  id="admin-password"
                  className="field-input"
                  placeholder="Crea una contraseña segura"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  onBlur={() => markTouched("password")}
                  autoComplete="new-password"
                  required
                />
                <PasswordStrengthHint password={form.password} />
                {errorFor("password") ? (
                  <p className="mt-1 text-xs text-[var(--red)]">{errorFor("password")}</p>
                ) : null}
              </div>

              <div>
                <label className="field-label" htmlFor="admin-confirm-password">
                  Confirmar contraseña
                </label>
                <input
                  id="admin-confirm-password"
                  className="field-input"
                  placeholder="Repite tu contraseña"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => updateField("confirmPassword", e.target.value)}
                  onBlur={() => markTouched("confirmPassword")}
                  autoComplete="new-password"
                  required
                />
                {errorFor("confirmPassword") ? (
                  <p className="mt-1 text-xs text-[var(--red)]">{errorFor("confirmPassword")}</p>
                ) : null}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-white/55 p-4 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[var(--amber)]"
                checked={form.acceptedTerms}
                onChange={(e) => updateField("acceptedTerms", e.target.checked)}
              />
              <span>
                Declaro que la información proporcionada es verdadera y acepto los Términos de
                Servicio y la Política de Privacidad.
              </span>
            </label>

            {serverError ? <div className="status-banner error">{serverError}</div> : null}

            <button type="submit" className="primary-button w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creando cuenta..." : "Crear Cuenta Segura"}
            </button>
          </form>
        </section>

        <aside className="glass-card flex flex-col justify-between rounded-[1.8rem] p-5 sm:p-7">
          <div className="space-y-6">
            <div className="brand-mark">CG</div>
            <div className="space-y-3">
              <p className="eyebrow">Perfil principal</p>
              <h2 className="display-title text-4xl font-extrabold">Cuenta administradora</h2>
              <p className="helper-text">
                Este registro queda marcado con rol <code className="inline-code">admin</code> y
                servirá como base para separar permisos por empresa en el siguiente paso.
              </p>
            </div>

            <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--paper-2)] p-5">
              <div className="mb-4 flex h-20 items-center justify-center rounded-[1rem] bg-white/70">
                <span className="text-4xl">🛡️</span>
              </div>
              <h3 className="display-title text-2xl font-bold">Seguridad colaborativa</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                Tu participación es clave para proteger la red de tu empresa. Una vez creada la
                cuenta, el acceso continuará desde el login.
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-[var(--border)] pt-6">
            <p className="text-sm text-[var(--muted)]">¿Ya tienes una cuenta?</p>
            <a href="/login" className="mt-4 inline-flex secondary-button">
              Iniciar Sesión
            </a>
          </div>
        </aside>
      </div>
    </main>
  );
}
