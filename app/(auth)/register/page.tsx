export default function RegisterSelectorPage() {
  return (
    <main className="app-shell auth-shell">
      <section className="auth-hero">
        <div className="space-y-6">
          <div className="brand-mark">CG</div>
          <div className="space-y-3">
            <p className="eyebrow text-[rgba(245,240,232,0.58)]">Registro Guiado</p>
            <h1 className="display-title max-w-xl text-5xl font-black leading-none sm:text-6xl">
              Elige cómo quieres unirte a <em className="text-[var(--amber-glow)] not-italic">CyberChat</em>
            </h1>
            <p className="max-w-lg text-base leading-7 text-[rgba(245,240,232,0.72)]">
              Separamos el alta de administradores y empleados para preparar mejor la gestión de
              accesos por empresa.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="eyebrow text-[rgba(245,240,232,0.42)]">Estructura de acceso</p>
          <div className="feature-list">
            <div className="feature-item">
              <span className="feature-icon">ADM</span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[rgba(245,240,232,0.94)]">
                  Administrador de empresa
                </p>
                <p className="text-sm leading-6 text-[rgba(245,240,232,0.58)]">
                  Registra la empresa y crea la cuenta principal de gestión.
                </p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">EMP</span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[rgba(245,240,232,0.94)]">
                  Empleado de empresa
                </p>
                <p className="text-sm leading-6 text-[rgba(245,240,232,0.58)]">
                  Solicita acceso usando el RUC de la organización a la que pertenece.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="glass-card auth-form-card">
          <div className="mb-8 space-y-3">
            <p className="eyebrow">Tipos de registro</p>
            <h2 className="display-title text-4xl font-extrabold">Selecciona tu perfil</h2>
            <p className="helper-text">
              Cada formulario guarda un rol distinto para poder diferenciar administradores y
              empleados más adelante.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href="/register/admin"
              className="block rounded-[1.35rem] border border-[var(--border)] bg-white/65 p-5 transition hover:-translate-y-0.5 hover:border-[var(--amber)] hover:shadow-[0_18px_34px_rgba(26,21,16,0.12)]"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="feature-icon">ADM</span>
                <div>
                  <p className="text-lg font-bold text-[var(--ink)]">Registro de Empresa</p>
                  <p className="text-sm text-[var(--muted)]">
                    Para dueños, responsables o administradores.
                  </p>
                </div>
              </div>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Incluye datos de la empresa y del representante principal.
              </p>
            </a>

            <a
              href="/register/employee"
              className="block rounded-[1.35rem] border border-[var(--border)] bg-white/65 p-5 transition hover:-translate-y-0.5 hover:border-[var(--teal)] hover:shadow-[0_18px_34px_rgba(26,21,16,0.12)]"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="feature-icon">EMP</span>
                <div>
                  <p className="text-lg font-bold text-[var(--ink)]">Únete a tu empresa</p>
                  <p className="text-sm text-[var(--muted)]">
                    Para colaboradores que solicitan acceso.
                  </p>
                </div>
              </div>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Usa el RUC de la organización y tu correo corporativo para registrarte.
              </p>
            </a>
          </div>

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
            <p className="text-sm text-[var(--muted)]">¿Ya tienes cuenta?</p>
            <a href="/login" className="secondary-button">
              Iniciar sesión
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
