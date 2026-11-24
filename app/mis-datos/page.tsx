"use client";

import { useCallback, useEffect, useState } from "react";
import { ARCO_TYPES, CONTROLLER, type ArcoType } from "@/lib/privacy";

type ArcoRequest = {
  id: string;
  request_type: ArcoType;
  detail: string;
  status: "recibida" | "en_proceso" | "atendida" | "denegada";
  created_at: string;
  due_at: string;
  response: string | null;
  responded_at: string | null;
};

type ConsentRecord = {
  purpose: "servicio" | "investigacion";
  policy_version: string;
  granted: boolean;
  granted_at: string;
  revoked_at: string | null;
};

const STATUS_LABEL: Record<ArcoRequest["status"], string> = {
  recibida: "Recibida",
  en_proceso: "En proceso",
  atendida: "Atendida",
  denegada: "Denegada",
};

function formatDate(value: string) {
  // Las fechas límite son solo fecha (YYYY-MM-DD): se muestran sin convertir zona horaria.
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function current(consents: ConsentRecord[], purpose: ConsentRecord["purpose"]) {
  return consents.find((c) => c.purpose === purpose && !c.revoked_at) ?? null;
}

export default function MyDataPage() {
  const [state, setState] = useState<"loading" | "anonymous" | "ready" | "error">("loading");
  const [requests, setRequests] = useState<ArcoRequest[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [email, setEmail] = useState("");
  const [type, setType] = useState<ArcoType>("acceso");
  const [detail, setDetail] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/privacy", { cache: "no-store" });
    if (res.status === 401) return setState("anonymous");
    if (!res.ok) return setState("error");
    const data = (await res.json()) as { requests: ArcoRequest[]; consents: ConsentRecord[]; email: string };
    setRequests(data.requests);
    setConsents(data.consents);
    setEmail(data.email ?? "");
    setState("ready");
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    const res = await fetch("/api/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, detail }),
    });
    const data = (await res.json()) as { request?: ArcoRequest; error?: string; fieldErrors?: Record<string, string> };
    setBusy(false);
    if (!res.ok || !data.request) {
      setMessage({ tone: "error", text: data.fieldErrors?.detail ?? data.error ?? "No se pudo registrar la solicitud." });
      return;
    }
    setRequests((prev) => [data.request!, ...prev]);
    setDetail("");
    setMessage({
      tone: "success",
      text: `Solicitud registrada. Te responderemos a ${email} a más tardar el ${formatDate(data.request.due_at)}.`,
    });
  }

  async function setResearchConsent(granted: boolean) {
    setBusy(true);
    const res = await fetch("/api/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "investigacion", granted }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "error", text: "No se pudo actualizar tu consentimiento." });
      return;
    }
    setMessage({
      tone: "success",
      text: granted
        ? "Autorizaste el uso de tus resultados para investigación."
        : "Revocaste el uso de tus resultados para investigación. Tu cuenta sigue funcionando con normalidad.",
    });
    await load();
  }

  const service = current(consents, "servicio");
  const research = current(consents, "investigacion");

  return (
    <main className="app-shell min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-[860px] space-y-6">
        <header className="glass-card space-y-3 rounded-[1.8rem] p-6 sm:p-8">
          <p className="eyebrow">Protección de datos personales</p>
          <h1 className="display-title text-4xl font-extrabold">Mis datos y derechos ARCO</h1>
          <p className="helper-text">
            Ejerce tus derechos de información, acceso, rectificación, cancelación y oposición, o
            gestiona tu consentimiento, conforme a la Ley N.° 29733. El trámite es gratuito. Consulta
            la <a className="underline" href="/privacidad">política de privacidad</a>.
          </p>
        </header>

        {state === "loading" ? (
          <p className="helper-text px-2">Cargando...</p>
        ) : state === "anonymous" ? (
          <section className="glass-card space-y-4 rounded-[1.8rem] p-6 sm:p-8">
            <p>
              Para presentar una solicitud desde la plataforma, inicia sesión: tu cuenta acredita tu
              identidad.
            </p>
            <p className="text-sm text-[var(--ink-soft)]">
              Si no puedes iniciar sesión (por ejemplo, si tu acceso está pendiente o fue rechazado),
              escribe a <strong>{CONTROLLER.contactEmail}</strong> con tus nombres y apellidos, tu
              petición, un correo para notificarte, la fecha y una copia de tu DNI.
            </p>
            <a href="/login" className="primary-button inline-flex">Iniciar sesión</a>
          </section>
        ) : state === "error" ? (
          <div className="status-banner error">No se pudieron cargar tus datos. Intenta nuevamente.</div>
        ) : (
          <>
            {message ? <div className={`status-banner ${message.tone}`}>{message.text}</div> : null}

            <section className="glass-card space-y-4 rounded-[1.8rem] p-6 sm:p-8">
              <h2 className="display-title text-2xl font-bold">Mis consentimientos</h2>
              <div className="rounded-xl border border-[var(--border)] p-4">
                <p className="font-semibold">Tratamiento para prestar el servicio (obligatorio)</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  {service
                    ? `Otorgado el ${formatDate(service.granted_at)} (política versión ${service.policy_version}).`
                    : "Tu cuenta se creó antes de que se registrara este consentimiento en la plataforma."}{" "}
                  Para revocarlo, presenta una solicitud de «Revocación del consentimiento»: implica la
                  cancelación de tu cuenta.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] p-4">
                <p className="font-semibold">Uso de mis resultados para investigación académica (opcional)</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  {research?.granted
                    ? `Autorizado el ${formatDate(research.granted_at)}. Tus resultados se usan solo en forma agregada y anonimizada.`
                    : "No autorizado. Tus resultados no se usan para investigación."}
                </p>
                <button
                  className="secondary-button mt-3"
                  disabled={busy}
                  onClick={() => void setResearchConsent(!research?.granted)}
                >
                  {research?.granted ? "Revocar autorización" : "Autorizar"}
                </button>
              </div>
            </section>

            <section className="glass-card space-y-4 rounded-[1.8rem] p-6 sm:p-8">
              <h2 className="display-title text-2xl font-bold">Nueva solicitud</h2>
              <form onSubmit={submitRequest} className="space-y-4">
                <div>
                  <label className="field-label" htmlFor="arco-type">Derecho que quieres ejercer</label>
                  <select
                    id="arco-type"
                    className="field-input"
                    value={type}
                    onChange={(e) => setType(e.target.value as ArcoType)}
                  >
                    {(Object.keys(ARCO_TYPES) as ArcoType[]).map((key) => (
                      <option key={key} value={key}>
                        {ARCO_TYPES[key].label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    {ARCO_TYPES[type].description} Plazo máximo de respuesta: {ARCO_TYPES[type].businessDays} días hábiles.
                  </p>
                </div>
                <div>
                  <label className="field-label" htmlFor="arco-detail">Detalle de tu petición</label>
                  <textarea
                    id="arco-detail"
                    className="field-input min-h-[120px]"
                    value={detail}
                    maxLength={2000}
                    onChange={(e) => setDetail(e.target.value)}
                    placeholder="Indica qué datos y qué necesitas. Para rectificar, indica el dato correcto."
                  />
                </div>
                <p className="text-xs text-[var(--ink-soft)]">
                  Te responderemos a <strong>{email}</strong>, el correo de tu cuenta.
                </p>
                <button type="submit" className="primary-button" disabled={busy || detail.trim().length < 10}>
                  {busy ? "Enviando..." : "Enviar solicitud"}
                </button>
              </form>
            </section>

            <section className="glass-card space-y-4 rounded-[1.8rem] p-6 sm:p-8">
              <h2 className="display-title text-2xl font-bold">Mis solicitudes</h2>
              {requests.length === 0 ? (
                <p className="text-sm text-[var(--ink-soft)]">Aún no has presentado solicitudes.</p>
              ) : (
                <ul className="space-y-3">
                  {requests.map((r) => (
                    <li key={r.id} className="rounded-xl border border-[var(--border)] p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{ARCO_TYPES[r.request_type]?.label ?? r.request_type}</span>
                        <span className="ui-badge">{STATUS_LABEL[r.status]}</span>
                      </div>
                      <p className="mt-2 text-[var(--ink-soft)]">
                        Presentada el {formatDate(r.created_at)} · Respuesta a más tardar el {formatDate(r.due_at)}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap">{r.detail}</p>
                      {r.response ? (
                        <p className="mt-3 rounded-lg bg-[var(--paper-2)] p-3 whitespace-pre-wrap">
                          <strong>Respuesta:</strong> {r.response}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <p className="px-2 text-sm">
          <a className="underline" href="/chat">Volver a CyberChat</a>
        </p>
      </div>
    </main>
  );
}
