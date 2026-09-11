"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import { loginSchema } from "@/lib/validators/auth";

const features = [
  {
    icon: "RAG",
    title: "Consultas con contexto",
    description: "Cruza tus preguntas con documentos internos para responder con más precisión.",
  },
  {
    icon: "DOC",
    title: "Base documental viva",
    description: "Centraliza PDFs, DOCX y TXT para convertirlos en conocimiento utilizable.",
  },
  {
    icon: "OPS",
    title: "Ciberseguridad accionable",
    description: "Diseñado para explicar riesgos y pasos concretos sin jerga innecesaria.",
  },
];

type LoginClientProps = {
  registered?: string;
};

export default function LoginClient({ registered }: LoginClientProps) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const helperMessage = useMemo(() => {
    if (registered === "admin") {
      return "Cuenta administradora creada. Ahora inicia sesión con tus credenciales.";
    }

    if (registered === "employee") {
      return "Solicitud de empleado registrada. Ahora inicia sesión con tus credenciales.";
    }

    return null;
  }, [registered]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setMsg(parsed.error.issues[0]?.message ?? "Revisa tus credenciales.");
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    setIsSubmitting(false);
    if (error) return setMsg("Correo o contraseña incorrectos.");

    const role =
      typeof data.user?.user_metadata?.role === "string" ? data.user.user_metadata.role : "";
    const approvalStatus =
      typeof data.user?.user_metadata?.approval_status === "string"
        ? data.user.user_metadata.approval_status
        : "";

    if (role === "admin") {
      router.push("/manage");
      return;
    }

    if (role === "employee" && approvalStatus !== "active") {
      await supabase.auth.signOut();

      if (approvalStatus === "rejected") {
        setMsg("Tu acceso fue rechazado por el administrador de tu empresa. Contáctalo para revisar tu solicitud.");
        return;
      }

      setMsg("Tu acceso todavía no ha sido aprobado por el administrador de tu empresa.");
      return;
    }

    router.push("/chat");
  }

  return (
    <main className="app-shell auth-shell">
      <section className="auth-hero">
        <div className="space-y-6">
          <div className="brand-mark">CG</div>
          <div className="space-y-3">
            <p className="eyebrow text-[rgba(245,240,232,0.58)]">Warm Industrial Security</p>
            <h1 className="display-title max-w-xl text-5xl font-black leading-none sm:text-6xl">
              Entra a tu centro de mando <em className="text-[var(--amber-glow)] not-italic">CyberChat</em>
            </h1>
            <p className="max-w-lg text-base leading-7 text-[rgba(245,240,232,0.72)]">
              Accede a tus conversaciones, documentos y respuestas guiadas para reforzar la
              concientización en ciberseguridad de tu equipo.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="eyebrow text-[rgba(245,240,232,0.42)]">Capacidades activas</p>
          <div className="feature-list">
            {features.map((feature) => (
              <div key={feature.title} className="feature-item">
                <span className="feature-icon">{feature.icon}</span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[rgba(245,240,232,0.94)]">
                    {feature.title}
                  </p>
                  <p className="text-sm leading-6 text-[rgba(245,240,232,0.58)]">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="glass-card auth-form-card">
          <div className="mb-8 space-y-3">
            <p className="eyebrow">Acceso Seguro</p>
            <h2 className="display-title text-4xl font-extrabold">Iniciar sesión</h2>
            <p className="helper-text">
              Usa tu correo y contraseña para continuar al entorno de chat y administración.
            </p>
          </div>

          <form onSubmit={onLogin} className="space-y-5">
            <div>
              <label className="field-label" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                className="field-input"
                placeholder="equipo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                className="field-input"
                placeholder="Tu clave segura"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {helperMessage ? <div className="status-banner success">{helperMessage}</div> : null}
            {msg ? <div className="status-banner error">{msg}</div> : null}

            <button type="submit" className="primary-button w-full" disabled={isSubmitting}>
              {isSubmitting ? "Ingresando..." : "Entrar al panel"}
            </button>
          </form>

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
            <p className="text-sm text-[var(--muted)]">¿No tienes cuenta todavía?</p>
            <a href="/register" className="secondary-button">
              Crear cuenta
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
