"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type EmployeeRegisterForm = {
  ruc: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

const initialForm: EmployeeRegisterForm = {
  ruc: "",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
};

export default function EmployeeRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<EmployeeRegisterForm>(initialForm);
  const [msg, setMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof EmployeeRegisterForm>(
    key: K,
    value: EmployeeRegisterForm[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setIsSubmitting(true);

    const res = await fetch("/api/auth/register-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ruc: form.ruc,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
      }),
    });

    setIsSubmitting(false);
    const data = (await res.json()) as { error?: string };

    if (!res.ok) {
      setMsg(data.error ?? "No se pudo registrar la solicitud del empleado.");
      return;
    }

    router.push("/login?registered=employee");
  }

  return (
    <main className="app-shell min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto grid max-w-[1180px] gap-6 lg:grid-cols-[0.8fr_1.1fr]">
        <aside className="glass-card flex flex-col justify-between rounded-[1.8rem] p-5 sm:p-7">
          <div className="space-y-6">
            <div className="brand-mark">CG</div>
            <div className="space-y-3">
              <p className="eyebrow">Solicitud de acceso</p>
              <h1 className="display-title text-4xl font-extrabold">Únete a tu empresa</h1>
              <p className="helper-text">
                Completa tus datos para solicitar acceso a la plataforma de tu organización.
              </p>
            </div>

            <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--paper-2)] p-5 text-center">
              <div className="mb-4 flex h-28 items-center justify-center rounded-[1rem] bg-white/70">
                <span className="text-5xl">🛡️</span>
              </div>
              <h2 className="display-title text-2xl font-bold">Seguridad colaborativa</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                Tu participación es clave para proteger la red de tu empresa. Únete y fortalece la
                seguridad digital desde dentro.
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

        <section className="glass-card rounded-[1.8rem] p-5 sm:p-7">
          <div className="mb-6 space-y-2">
            <p className="eyebrow">Colaborador</p>
            <h2 className="display-title text-4xl font-extrabold">Solicitar acceso</h2>
            <p className="helper-text">
              Este formulario crea una cuenta con rol{" "}
              <code className="inline-code">employee</code> y luego te devuelve al login.
            </p>
          </div>

          <form onSubmit={onRegister} className="space-y-5">
            <div>
              <label className="field-label" htmlFor="employee-ruc">
                RUC de la empresa
              </label>
              <input
                id="employee-ruc"
                className="field-input"
                placeholder="Ej. 20123456789"
                value={form.ruc}
                onChange={(e) => updateField("ruc", e.target.value)}
                required
              />
              <p className="mt-2 text-xs text-[var(--muted)]">
                Necesario para vincularte con tu organización.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="employee-first-name">
                  Nombres
                </label>
                <input
                  id="employee-first-name"
                  className="field-input"
                  placeholder="Tus nombres"
                  value={form.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="field-label" htmlFor="employee-last-name">
                  Apellidos
                </label>
                <input
                  id="employee-last-name"
                  className="field-input"
                  placeholder="Tus apellidos"
                  value={form.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="employee-email">
                Correo corporativo
              </label>
              <input
                id="employee-email"
                className="field-input"
                placeholder="nombre@tuempresa.com"
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="employee-password">
                Contraseña
              </label>
              <input
                id="employee-password"
                className="field-input"
                placeholder="Crea una contraseña segura"
                type="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                required
              />
            </div>

            {msg ? <div className="status-banner error">{msg}</div> : null}

            <button type="submit" className="primary-button w-full" disabled={isSubmitting}>
              {isSubmitting ? "Solicitando acceso..." : "Solicitar Acceso"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
