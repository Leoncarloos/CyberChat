"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

const onboardingPoints = [
  "Crea una cuenta para separar conversaciones por usuario.",
  "Sube documentos y conviértelos en contexto recuperable.",
  "Gestiona tu base de conocimiento desde el panel admin.",
];

export default function RegisterPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return setMsg(error.message);

    if (data.session) router.push("/chat");
    else setMsg("Revisa tu correo para confirmar tu cuenta, si esa validación está activada.");
  }

  const isInfoMessage = msg?.toLowerCase().includes("correo") ?? false;

  return (
    <main className="app-shell auth-shell">
      <section className="auth-hero">
        <div className="space-y-6">
          <div className="brand-mark">CG</div>
          <div className="space-y-3">
            <p className="eyebrow text-[rgba(245,240,232,0.58)]">Onboarding de Plataforma</p>
            <h1 className="display-title max-w-xl text-5xl font-black leading-none sm:text-6xl">
              Activa tu espacio de <em className="text-[var(--amber-glow)] not-italic">ciberdefensa</em>
            </h1>
            <p className="max-w-lg text-base leading-7 text-[rgba(245,240,232,0.72)]">
              Crea tu acceso para empezar a conversar con el asistente, cargar material y
              organizar el conocimiento de seguridad de tu empresa.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="eyebrow text-[rgba(245,240,232,0.42)]">Qué desbloqueas al registrarte</p>
          <div className="feature-list">
            {onboardingPoints.map((point, index) => (
              <div key={point} className="feature-item">
                <span className="feature-icon">0{index + 1}</span>
                <p className="text-sm leading-6 text-[rgba(245,240,232,0.75)]">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="glass-card auth-form-card">
          <div className="mb-8 space-y-3">
            <p className="eyebrow">Registro</p>
            <h2 className="display-title text-4xl font-extrabold">Crear cuenta</h2>
            <p className="helper-text">
              Configura tu acceso con un correo válido. Después podrás entrar a chat y al panel
              de documentos.
            </p>
          </div>

          <form onSubmit={onRegister} className="space-y-5">
            <div>
              <label className="field-label" htmlFor="register-email">
                Correo electrónico
              </label>
              <input
                id="register-email"
                className="field-input"
                placeholder="seguridad@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="register-password">
                Contraseña
              </label>
              <input
                id="register-password"
                className="field-input"
                placeholder="Crea una contraseña robusta"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {msg ? (
              <div className={`status-banner ${isInfoMessage ? "info" : "error"}`}>{msg}</div>
            ) : null}

            <button type="submit" className="primary-button w-full">
              Crear acceso
            </button>
          </form>

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
            <p className="text-sm text-[var(--muted)]">¿Ya tienes una cuenta activa?</p>
            <a href="/login" className="secondary-button">
              Iniciar sesión
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
