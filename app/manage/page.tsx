"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type EmployeeStatus = "active" | "pending" | "rejected";
type Employee = {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  ruc: string;
  status: EmployeeStatus;
  created_at: string;
};

type EmployeeResponse = {
  employees?: Employee[];
  counts?: {
    all: number;
    active: number;
    pending: number;
    rejected: number;
  };
  ruc?: string;
  error?: string;
};

const statusLabels: Record<EmployeeStatus, string> = {
  active: "Activo",
  pending: "Pendiente",
  rejected: "Rechazado",
};

function formatDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function ManagePage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [userEmail, setUserEmail] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeStatus>("all");
  const [counts, setCounts] = useState({ all: 0, active: 0, pending: 0, rejected: 0 });
  const [companyRuc, setCompanyRuc] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<"dashboard" | "employees">("employees");

  async function loadEmployees() {
    setIsLoading(true);
    const res = await fetch("/api/admin/employees", { cache: "no-store" });
    const data = (await res.json()) as EmployeeResponse;

    if (!res.ok) {
      alert(data.error ?? "No se pudo cargar la gestión de empleados");
      setIsLoading(false);
      return;
    }

    setEmployees(data.employees ?? []);
    setCounts(data.counts ?? { all: 0, active: 0, pending: 0, rejected: 0 });
    setCompanyRuc(data.ruc ?? "");
    setIsLoading(false);
  }

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        router.push("/login");
        return;
      }

      const role =
        typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "";

      if (role !== "admin") {
        router.push("/chat");
        return;
      }

      setUserEmail(user.email ?? "");
      await loadEmployees();
    })();
  }, [router, supabase]);

  const filteredEmployees = employees.filter((employee) => {
    const matchesStatus = statusFilter === "all" || employee.status === statusFilter;
    const haystack = `${employee.full_name} ${employee.email} ${employee.ruc}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  async function updateEmployee(
    userId: string,
    action: "approve" | "reject" | "edit",
    payload?: { firstName?: string; lastName?: string },
    skipReload?: boolean
  ) {
    setIsBusy(true);
    const res = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, ...payload }),
    });

    const data = (await res.json()) as { error?: string };

    if (!res.ok) {
      setIsBusy(false);
      alert(data.error ?? "No se pudo actualizar el empleado");
      return false;
    }

    if (!skipReload) {
      await loadEmployees();
      setIsBusy(false);
    }

    return true;
  }

  async function approveAllPending() {
    const pendingEmployees = employees.filter((employee) => employee.status === "pending");
    if (!pendingEmployees.length) return;

    setIsBusy(true);
    for (const employee of pendingEmployees) {
      const ok = await updateEmployee(employee.id, "approve", undefined, true);
      if (!ok) {
        setIsBusy(false);
        return;
      }
    }
    await loadEmployees();
    setIsBusy(false);
  }

  async function editEmployee(employee: Employee) {
    const firstName = window.prompt("Nombres del empleado:", employee.first_name)?.trim();
    if (firstName === undefined) return;
    const lastName = window.prompt("Apellidos del empleado:", employee.last_name)?.trim();
    if (lastName === undefined) return;

    await updateEmployee(employee.id, "edit", {
      firstName: firstName || employee.first_name,
      lastName: lastName || employee.last_name,
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="app-shell grid min-h-screen grid-cols-1 bg-[var(--paper)] lg:grid-cols-[290px_1fr]">
      <aside className="flex flex-col overflow-hidden border-r border-[rgba(212,204,188,0.18)] bg-[var(--ink)] text-[var(--paper)]">
        <div className="border-b border-white/10 px-5 py-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="brand-mark !h-11 !w-11 !rounded-2xl">C</div>
            <div>
              <div className="display-title text-3xl font-black leading-none">CyberChat</div>
              <div className="mt-1 text-sm text-[rgba(245,240,232,0.55)]">Gestión MYPE</div>
            </div>
          </div>
        </div>

        <div className="border-b border-white/8 px-4 py-4">
          <button
            className={`mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
              activeSection === "dashboard"
                ? "bg-[rgba(232,117,10,0.16)] text-[var(--amber-glow)]"
                : "text-[rgba(245,240,232,0.72)] hover:bg-white/6"
            }`}
            onClick={() => setActiveSection("dashboard")}
          >
            <span>📊</span>
            <span>Dashboard</span>
          </button>
          <button
            className={`mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
              activeSection === "employees"
                ? "bg-[rgba(232,117,10,0.16)] text-[var(--amber-glow)]"
                : "text-[rgba(245,240,232,0.72)] hover:bg-white/6"
            }`}
            onClick={() => setActiveSection("employees")}
          >
            <span>👥</span>
            <span>Empleados</span>
          </button>
          <button
            className="mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-[rgba(245,240,232,0.72)] transition hover:bg-white/6"
            onClick={() => router.push("/admin")}
          >
            <span>📚</span>
            <span>Módulo Admin RAG</span>
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-[rgba(245,240,232,0.72)] transition hover:bg-white/6"
            onClick={() => router.push("/chat")}
          >
            <span>💬</span>
            <span>Ir al chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-3">
            <div className="rounded-xl border border-white/8 bg-white/5 px-4 py-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.36)]">
                RUC administrado
              </div>
              <div className="mt-3 text-lg font-semibold text-[rgba(245,240,232,0.92)]">
                {companyRuc || "Cargando..."}
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-white/5 px-4 py-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.36)]">
                Empleados
              </div>
              <div className="mt-3 display-title text-4xl font-black text-[var(--amber-glow)]">
                {counts.all}
              </div>
              <div className="mt-2 text-sm text-[rgba(245,240,232,0.62)]">
                Total registrados en tu organización
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-white/5 px-4 py-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.36)]">
                Pendientes
              </div>
              <div className="mt-3 display-title text-4xl font-black text-[var(--amber-glow)]">
                {counts.pending}
              </div>
              <div className="mt-2 text-sm text-[rgba(245,240,232,0.62)]">
                Solicitudes esperando revisión
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/8 px-5 py-4">
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(245,240,232,0.36)]">
              Usuario
            </div>
            <div className="mt-2 text-sm text-[rgba(245,240,232,0.76)]">{userEmail || "sesión activa"}</div>
          </div>

          <div className="mt-3">
            <button className="ghost-button w-full !rounded-xl !py-3 !text-xs" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <section className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--paper)]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(26,21,16,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(26,21,16,0.025)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(245,240,232,0.88)] px-6 py-4 backdrop-blur-xl">
          <div>
            <p className="eyebrow">Gestión empresarial</p>
            <h1 className="display-title mt-2 text-5xl font-black leading-none">
              {activeSection === "dashboard" ? "Dashboard" : "Gestión de Empleados"}
            </h1>
            <p className="mt-3 text-base text-[var(--muted)]">
              {activeSection === "dashboard"
                ? "Resumen visual de tu organización y accesos."
                : "Administra los accesos, roles y estado de la plantilla."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <input
              className="field-input min-w-[280px] lg:min-w-[340px]"
              placeholder="Buscar empleados, roles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {activeSection === "employees" ? (
              <button className="secondary-button" disabled={isBusy} onClick={() => void approveAllPending()}>
                Aprobar todo
              </button>
            ) : null}
          </div>
        </header>

        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6">
          {activeSection === "dashboard" ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="stat-card">
                  <p className="eyebrow">Empleados activos</p>
                  <p className="stat-value mt-3 text-[var(--amber-dim)]">{counts.active}</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Personal con acceso habilitado a la plataforma.
                  </p>
                </div>
                <div className="stat-card">
                  <p className="eyebrow">Solicitudes pendientes</p>
                  <p className="stat-value mt-3 text-[var(--amber-dim)]">{counts.pending}</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Empleados esperando aprobación del administrador.
                  </p>
                </div>
                <div className="stat-card">
                  <p className="eyebrow">Base documental</p>
                  <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Documentos para RAG</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Gestiona el conocimiento contextual desde el módulo Admin RAG.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.25fr_0.85fr]">
                <div className="stat-card">
                  <p className="eyebrow">Estado de accesos</p>
                  <div className="mt-5 space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/65 px-4 py-4">
                      <div>
                        <div className="font-semibold text-[var(--ink)]">Activos</div>
                        <div className="text-sm text-[var(--muted)]">Usuarios aprobados y operativos</div>
                      </div>
                      <div className="display-title text-3xl font-black text-[var(--green)]">{counts.active}</div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/65 px-4 py-4">
                      <div>
                        <div className="font-semibold text-[var(--ink)]">Pendientes</div>
                        <div className="text-sm text-[var(--muted)]">Solicitudes listas para revisar</div>
                      </div>
                      <div className="display-title text-3xl font-black text-[var(--amber-dim)]">{counts.pending}</div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/65 px-4 py-4">
                      <div>
                        <div className="font-semibold text-[var(--ink)]">Rechazados</div>
                        <div className="text-sm text-[var(--muted)]">Accesos denegados por el administrador</div>
                      </div>
                      <div className="display-title text-3xl font-black text-[var(--red)]">{counts.rejected}</div>
                    </div>
                  </div>
                </div>

                <div className="stat-card">
                  <p className="eyebrow">Acciones rápidas</p>
                  <div className="mt-5 space-y-3">
                    <button className="primary-button w-full" onClick={() => router.push("/admin")}>
                      Abrir módulo Admin RAG
                    </button>
                    <button className="secondary-button w-full" onClick={() => setActiveSection("employees")}>
                      Revisar empleados
                    </button>
                    <button className="ghost-button w-full" onClick={() => router.push("/chat")}>
                      Ir al chat
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-4">
                <button
                  className={`ghost-button !rounded-xl !px-4 !py-3 !text-xs ${
                    statusFilter === "all" ? "!border-[var(--amber)] !text-[var(--amber-dim)]" : ""
                  }`}
                  onClick={() => setStatusFilter("all")}
                >
                  Todos ({counts.all})
                </button>
                <button
                  className={`ghost-button !rounded-xl !px-4 !py-3 !text-xs ${
                    statusFilter === "active" ? "!border-[var(--amber)] !text-[var(--amber-dim)]" : ""
                  }`}
                  onClick={() => setStatusFilter("active")}
                >
                  Activos ({counts.active})
                </button>
                <button
                  className={`ghost-button !rounded-xl !px-4 !py-3 !text-xs ${
                    statusFilter === "pending" ? "!border-[var(--amber)] !text-[var(--amber-dim)]" : ""
                  }`}
                  onClick={() => setStatusFilter("pending")}
                >
                  Pendientes ({counts.pending})
                </button>
                <button
                  className={`ghost-button !rounded-xl !px-4 !py-3 !text-xs ${
                    statusFilter === "rejected" ? "!border-[var(--amber)] !text-[var(--amber-dim)]" : ""
                  }`}
                  onClick={() => setStatusFilter("rejected")}
                >
                  Rechazados ({counts.rejected})
                </button>
              </div>

              <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/72 shadow-[0_12px_28px_rgba(26,21,16,0.08)]">
                <div className="grid grid-cols-[1.5fr_1.2fr_0.9fr_0.9fr_1.5fr] gap-4 border-b border-[var(--border)] px-5 py-4 text-sm font-semibold text-[var(--muted)]">
                  <div>Nombre</div>
                  <div>Correo</div>
                  <div>RUC</div>
                  <div>Estado</div>
                  <div>Acciones</div>
                </div>

                {isLoading ? (
                  <div className="px-5 py-8 text-sm text-[var(--muted)]">Cargando empleados...</div>
                ) : filteredEmployees.length ? (
                  filteredEmployees.map((employee) => (
                    <div
                      key={employee.id}
                      className="grid grid-cols-[1.5fr_1.2fr_0.9fr_0.9fr_1.5fr] gap-4 border-b border-[var(--border)] px-5 py-4 last:border-b-0"
                    >
                      <div>
                        <div className="font-semibold text-[var(--ink)]">{employee.full_name}</div>
                        <div className="mt-1 text-sm text-[var(--muted)]">
                          Registro: {formatDate(employee.created_at)}
                        </div>
                      </div>

                      <div className="break-all text-sm text-[var(--ink)]">{employee.email}</div>
                      <div className="text-sm text-[var(--ink)]">{employee.ruc}</div>
                      <div>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            employee.status === "active"
                              ? "bg-[rgba(46,125,82,0.12)] text-[var(--green)]"
                              : employee.status === "pending"
                                ? "bg-[rgba(232,117,10,0.12)] text-[var(--amber-dim)]"
                                : "bg-[rgba(201,64,64,0.12)] text-[var(--red)]"
                          }`}
                        >
                          {statusLabels[employee.status]}
                        </span>
                      </div>

                      <div className="split-actions">
                        {employee.status !== "active" ? (
                          <button
                            className="secondary-button !px-3 !py-2 !text-xs"
                            disabled={isBusy}
                            onClick={() => void updateEmployee(employee.id, "approve")}
                          >
                            Aprobar
                          </button>
                        ) : null}
                        {employee.status !== "rejected" ? (
                          <button
                            className="ghost-button !border-[rgba(201,64,64,0.2)] !px-3 !py-2 !text-xs !text-[var(--red)]"
                            disabled={isBusy}
                            onClick={() => void updateEmployee(employee.id, "reject")}
                          >
                            Rechazar
                          </button>
                        ) : null}
                        <button
                          className="ghost-button !px-3 !py-2 !text-xs"
                          disabled={isBusy}
                          onClick={() => void editEmployee(employee)}
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-8 text-sm text-[var(--muted)]">
                    No hay empleados para el filtro actual.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
