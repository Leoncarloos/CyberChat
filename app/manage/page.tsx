"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type EmployeeStatus = "active" | "pending" | "rejected";
type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; msg: string };
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

  // Toasts (replace native alert)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((tone: ToastTone, msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tone, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  // Edit modal + reject confirm (replace native prompt/confirm)
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [rejectTarget, setRejectTarget] = useState<Employee | null>(null);

  const didDefaultFilter = useRef(false);

  const loadEmployees = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch("/api/admin/employees", { cache: "no-store" });
    const data = (await res.json()) as EmployeeResponse;

    if (!res.ok) {
      toast("error", data.error ?? "No se pudo cargar la gestión de empleados");
      setIsLoading(false);
      return;
    }

    const nextCounts = data.counts ?? { all: 0, active: 0, pending: 0, rejected: 0 };
    setEmployees(data.employees ?? []);
    setCounts(nextCounts);
    setCompanyRuc(data.ruc ?? "");
    setIsLoading(false);

    // Default inteligente: si hay pendientes en el primer load, enfoca ese filtro
    if (!didDefaultFilter.current) {
      didDefaultFilter.current = true;
      if (nextCounts.pending > 0) setStatusFilter("pending");
    }
  }, [toast]);

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
  }, [router, supabase, loadEmployees]);

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
      toast("error", data.error ?? "No se pudo actualizar el empleado");
      return false;
    }

    if (!skipReload) {
      await loadEmployees();
      setIsBusy(false);
    }

    return true;
  }

  async function approveEmployee(employee: Employee) {
    const ok = await updateEmployee(employee.id, "approve");
    if (ok) toast("success", `${employee.full_name || "Empleado"} aprobado`);
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejectTarget(null);
    const ok = await updateEmployee(target.id, "reject");
    if (ok) toast("info", `Acceso de ${target.full_name || "empleado"} rechazado`);
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
    toast("success", `${pendingEmployees.length} empleado(s) aprobado(s)`);
  }

  function openEdit(employee: Employee) {
    setEditTarget(employee);
    setEditFirst(employee.first_name);
    setEditLast(employee.last_name);
  }

  async function saveEdit() {
    if (!editTarget) return;
    const target = editTarget;
    setEditTarget(null);
    const ok = await updateEmployee(target.id, "edit", {
      firstName: editFirst.trim() || target.first_name,
      lastName: editLast.trim() || target.last_name,
    });
    if (ok) toast("success", "Datos del empleado actualizados");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="app-shell grid min-h-screen grid-cols-1 bg-[var(--paper)] lg:grid-cols-[280px_1fr]">

      {/* ── Sidebar ── */}
      <aside className="flex flex-col overflow-hidden border-r border-white/10 bg-[var(--ink)] text-[var(--paper)]">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="brand-mark !h-10 !w-10 !rounded-xl text-sm">C</div>
            <div>
              <div className="display-title text-2xl font-black leading-none">CyberChat</div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.5)]">
                Panel Admin
              </div>
            </div>
          </div>
        </div>

        {/* Secciones de esta vista */}
        <div className="px-3 py-4">
          <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.42)]">
            Gestión
          </p>
          <div className="space-y-1">
            <button
              className={`ui-nav ${activeSection === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveSection("dashboard")}
            >
              <span className="ui-nav-icon">📊</span>
              <span>Resumen</span>
            </button>
            <button
              className={`ui-nav ${activeSection === "employees" ? "active" : ""}`}
              onClick={() => setActiveSection("employees")}
            >
              <span className="ui-nav-icon">👥</span>
              <span>Empleados</span>
              {counts.pending > 0 && <span className="ui-pill">{counts.pending}</span>}
            </button>
          </div>

          <p className="px-2 pb-2 pt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.42)]">
            Otros módulos
          </p>
          <div className="space-y-1">
            <button className="ui-nav" onClick={() => router.push("/org-dashboard")}>
              <span className="ui-nav-icon">📈</span>
              <span>Dashboard org.</span>
            </button>
            <button className="ui-nav" onClick={() => router.push("/admin")}>
              <span className="ui-nav-icon">📚</span>
              <span>Documentos RAG</span>
            </button>
            <button className="ui-nav" onClick={() => router.push("/chat")}>
              <span className="ui-nav-icon">💬</span>
              <span>Ir al chat</span>
            </button>
          </div>
        </div>

        {/* RUC */}
        <div className="mt-auto px-4 pb-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgba(245,240,232,0.42)]">
              RUC administrado
            </div>
            <div className="mt-1.5 text-base font-semibold text-[rgba(245,240,232,0.92)]">
              {companyRuc || "—"}
            </div>
          </div>
        </div>

        {/* Usuario + logout */}
        <div className="border-t border-white/8 px-4 py-4">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-[rgba(245,240,232,0.9)]">
              {(userEmail.charAt(0) || "A").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-[rgba(245,240,232,0.88)]">
                {userEmail || "Admin"}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[rgba(245,240,232,0.5)]">
                Administrador
              </div>
            </div>
          </div>
          <button
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm font-semibold text-[rgba(245,240,232,0.72)] transition hover:bg-white/12 hover:text-[rgba(245,240,232,0.96)]"
            onClick={logout}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <section className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--paper)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(26,21,16,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(26,21,16,0.022)_1px,transparent_1px)] bg-[size:32px_32px]" />

        {/* Header */}
        <header className="relative z-10 border-b border-[var(--border)] bg-[rgba(245,240,232,0.92)] px-6 py-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">
                {activeSection === "dashboard" ? "Panel de control" : "Gestión empresarial"}
              </p>
              <h1 className="display-title mt-1.5 text-4xl font-black leading-tight">
                {activeSection === "dashboard" ? "Resumen de organización" : "Empleados"}
              </h1>
            </div>

            {activeSection === "employees" && (
              <div className="flex flex-wrap items-center gap-3">
                <input
                  className="field-input !rounded-xl !py-2.5 min-w-[220px] text-sm"
                  placeholder="Buscar nombre o correo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {counts.pending > 0 && (
                  <button className="primary-button" disabled={isBusy} onClick={() => void approveAllPending()}>
                    ✓ Aprobar {counts.pending} pendiente{counts.pending > 1 ? "s" : ""}
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6">
          {activeSection === "dashboard" ? (

            /* ── Resumen ── */
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="stat-card">
                  <p className="eyebrow">Total empleados</p>
                  <p className="stat-value mt-3 text-[var(--ink)]">{counts.all}</p>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">Registrados en la plataforma</p>
                </div>
                <div className="stat-card border-[rgba(46,125,82,0.25)] bg-[rgba(46,125,82,0.05)]">
                  <p className="eyebrow text-[var(--green)]">Activos</p>
                  <p className="stat-value mt-3 text-[var(--green)]">{counts.active}</p>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">Con acceso habilitado</p>
                </div>
                <div className="stat-card border-[rgba(232,117,10,0.25)] bg-[rgba(232,117,10,0.05)]">
                  <p className="eyebrow text-[var(--amber-dim)]">Pendientes</p>
                  <p className="stat-value mt-3 text-[var(--amber-dim)]">{counts.pending}</p>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">Esperando aprobación</p>
                </div>
                <div className="stat-card border-[rgba(201,64,64,0.2)] bg-[rgba(201,64,64,0.04)]">
                  <p className="eyebrow text-[var(--red)]">Rechazados</p>
                  <p className="stat-value mt-3 text-[var(--red)]">{counts.rejected}</p>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">Acceso denegado</p>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                <div className="stat-card">
                  <p className="eyebrow mb-4">Distribución de accesos</p>
                  <div className="space-y-3">
                    {([
                      { label: "Activos", count: counts.active, color: "text-[var(--green)]", bar: "bg-[var(--green)]" },
                      { label: "Pendientes", count: counts.pending, color: "text-[var(--amber-dim)]", bar: "bg-[var(--amber)]" },
                      { label: "Rechazados", count: counts.rejected, color: "text-[var(--red)]", bar: "bg-[var(--red)]" },
                    ] as const).map(({ label, count, color, bar }) => (
                      <div key={label} className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[var(--ink)]">{label}</div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--paper-3)]">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${bar}`}
                              style={{ width: counts.all > 0 ? `${(count / counts.all) * 100}%` : "0%" }}
                            />
                          </div>
                        </div>
                        <div className={`display-title shrink-0 text-3xl font-black ${color}`}>{count}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stat-card">
                  <p className="eyebrow mb-4">Acciones rápidas</p>
                  <div className="space-y-3">
                    <button className="primary-button w-full" onClick={() => setActiveSection("employees")}>
                      👥 Gestionar empleados
                    </button>
                    <button className="secondary-button w-full" onClick={() => router.push("/org-dashboard")}>
                      📈 Dashboard organizacional
                    </button>
                    <button className="secondary-button w-full" onClick={() => router.push("/admin")}>
                      📚 Subir documentos RAG
                    </button>
                    <button className="ghost-button w-full" onClick={() => router.push("/chat")}>
                      💬 Ir al chat
                    </button>
                  </div>
                </div>
              </div>
            </div>

          ) : (

            /* ── Empleados ── */
            <div className="space-y-5">
              {/* Segmented filter */}
              <div className="ui-seg">
                {(["all", "active", "pending", "rejected"] as const).map((f) => (
                  <button
                    key={f}
                    className={`ui-seg-item ${statusFilter === f ? "active" : ""}`}
                    onClick={() => setStatusFilter(f)}
                  >
                    {f === "all" ? "Todos" : f === "active" ? "Activos" : f === "pending" ? "Pendientes" : "Rechazados"}
                    <span className="ui-seg-count">
                      {f === "all" ? counts.all : f === "active" ? counts.active : f === "pending" ? counts.pending : counts.rejected}
                    </span>
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="rounded-[1.4rem] border border-[var(--border)] bg-white/85 shadow-[0_8px_24px_rgba(26,21,16,0.07)] overflow-hidden">
                {/* Header — desktop only */}
                <div className="hidden border-b border-[var(--border)] bg-[var(--paper-2)] px-5 py-3.5 sm:grid sm:grid-cols-[1.4fr_1.4fr_auto_auto] sm:gap-4 sm:text-xs sm:font-bold sm:uppercase sm:tracking-wide sm:text-[var(--ink-soft)]">
                  <div>Empleado</div>
                  <div>Correo</div>
                  <div>Estado</div>
                  <div className="text-right">Acciones</div>
                </div>

                {isLoading ? (
                  /* Skeleton rows */
                  <div>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="grid gap-4 border-b border-[rgba(212,204,188,0.5)] px-5 py-4 last:border-0 sm:grid-cols-[1.4fr_1.4fr_auto_auto]">
                        <div className="space-y-2">
                          <div className="ui-skeleton h-4 w-32" />
                          <div className="ui-skeleton h-3 w-20" />
                        </div>
                        <div className="ui-skeleton h-4 w-40 self-center" />
                        <div className="ui-skeleton h-6 w-20 self-center rounded-full" />
                        <div className="ui-skeleton h-8 w-28 self-center justify-self-end" />
                      </div>
                    ))}
                  </div>
                ) : filteredEmployees.length ? (
                  filteredEmployees.map((employee) => (
                    <div
                      key={employee.id}
                      className="ui-row grid gap-x-4 gap-y-3 border-b border-[rgba(212,204,188,0.5)] px-5 py-4 last:border-0 sm:grid-cols-[1.4fr_1.4fr_auto_auto] sm:items-center"
                    >
                      {/* Name */}
                      <div>
                        <div className="font-semibold text-[var(--ink)]">{employee.full_name || "Sin nombre"}</div>
                        <div className="mt-0.5 text-xs text-[var(--ink-soft)]">
                          Alta: {formatDate(employee.created_at)}
                        </div>
                      </div>

                      {/* Email */}
                      <div className="min-w-0 break-all text-sm text-[var(--ink-soft)]">{employee.email}</div>

                      {/* Badge */}
                      <div>
                        <span className={`ui-badge ${employee.status}`}>{statusLabels[employee.status]}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {employee.status !== "active" && (
                          <button
                            className="secondary-button !rounded-lg !px-3.5 !py-2 !text-sm"
                            disabled={isBusy}
                            onClick={() => void approveEmployee(employee)}
                          >
                            ✓ Aprobar
                          </button>
                        )}
                        {employee.status !== "rejected" && (
                          <button
                            className="ghost-button !rounded-lg !border-[rgba(201,64,64,0.25)] !px-3.5 !py-2 !text-sm !text-[var(--red)] hover:!bg-[rgba(201,64,64,0.06)]"
                            disabled={isBusy}
                            onClick={() => setRejectTarget(employee)}
                          >
                            Rechazar
                          </button>
                        )}
                        <button
                          className="ghost-button !rounded-lg !px-3.5 !py-2 !text-sm"
                          disabled={isBusy}
                          onClick={() => openEdit(employee)}
                        >
                          ✎ Editar
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  /* Empty state con CTA */
                  <div className="px-6 py-12 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--paper-2)] text-2xl">
                      {search ? "🔍" : "👥"}
                    </div>
                    <p className="text-base font-semibold text-[var(--ink)]">
                      {search ? "Sin resultados" : "No hay empleados en este filtro"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {search
                        ? "Prueba con otro nombre o correo."
                        : statusFilter !== "all"
                          ? "Cambia el filtro para ver otros empleados."
                          : "Aún no hay empleados registrados en tu organización."}
                    </p>
                    {(search || statusFilter !== "all") && (
                      <button
                        className="ghost-button mt-4"
                        onClick={() => { setSearch(""); setStatusFilter("all"); }}
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Toasts ── */}
      {toasts.length > 0 && (
        <div className="ui-toast-wrap">
          {toasts.map((t) => (
            <div key={t.id} className={`ui-toast ${t.tone}`}>
              <span className="ui-toast-icon">
                {t.tone === "success" ? "✅" : t.tone === "error" ? "⚠️" : "ℹ️"}
              </span>
              <span>{t.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: editar ── */}
      {editTarget && (
        <div className="ui-modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="ui-modal" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Editar empleado</p>
            <h3 className="display-title mt-1.5 text-2xl font-black">{editTarget.full_name || editTarget.email}</h3>
            <div className="mt-5 space-y-4">
              <div>
                <label className="field-label" htmlFor="edit-first">Nombres</label>
                <input
                  id="edit-first"
                  className="field-input"
                  value={editFirst}
                  onChange={(e) => setEditFirst(e.target.value)}
                  placeholder="Nombres"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="edit-last">Apellidos</label>
                <input
                  id="edit-last"
                  className="field-input"
                  value={editLast}
                  onChange={(e) => setEditLast(e.target.value)}
                  placeholder="Apellidos"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button className="ghost-button" onClick={() => setEditTarget(null)}>Cancelar</button>
              <button className="primary-button" disabled={isBusy} onClick={() => void saveEdit()}>
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: confirmar rechazo ── */}
      {rejectTarget && (
        <div className="ui-modal-overlay" onClick={() => setRejectTarget(null)}>
          <div className="ui-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(201,64,64,0.12)] text-2xl">
              ⚠️
            </div>
            <h3 className="display-title text-2xl font-black">¿Rechazar acceso?</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
              <strong className="text-[var(--ink)]">{rejectTarget.full_name || rejectTarget.email}</strong> perderá
              el acceso a la plataforma. Puedes volver a aprobarlo más tarde.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="ghost-button" onClick={() => setRejectTarget(null)}>Cancelar</button>
              <button
                className="primary-button !bg-[var(--red)] !shadow-none"
                disabled={isBusy}
                onClick={() => void confirmReject()}
              >
                Sí, rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
