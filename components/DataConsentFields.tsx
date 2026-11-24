import { CONTROLLER } from "@/lib/privacy";

type Props = {
  audience: "owner" | "employee";
  dataConsent: boolean;
  researchConsent: boolean;
  onDataConsent: (value: boolean) => void;
  onResearchConsent: (value: boolean) => void;
  error?: string;
};

// Primera capa de información (Reglamento de la Ley N.° 29733, art. 6) y las dos
// autorizaciones por separado: la principal es obligatoria y la de investigación, opcional.
export default function DataConsentFields({
  audience,
  dataConsent,
  researchConsent,
  onDataConsent,
  onResearchConsent,
  error,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[var(--border)] bg-white/55 p-4 text-xs leading-5 text-[var(--ink-soft)]">
        <p className="mb-1 font-semibold text-[var(--ink)]">Información básica sobre tus datos personales</p>
        <p>
          <strong>Responsable:</strong> {CONTROLLER.names.join(" y ")} (CyberChat), {CONTROLLER.contactEmail}.{" "}
          <strong>Finalidad:</strong> gestionar tu cuenta, aplicar las evaluaciones, responder tus
          consultas y mostrar tu progreso
          {audience === "employee" ? "; el dueño de tu empresa verá tu estado y tus resultados" : ""}.{" "}
          <strong>Transferencia internacional:</strong> los datos se alojan y procesan con proveedores
          en Estados Unidos (Supabase, Vercel, Groq y Hugging Face).{" "}
          <strong>Derechos:</strong> información, acceso, rectificación, cancelación y oposición,
          gratis, en «Mis datos» o por correo.{" "}
          <a href="/privacidad" target="_blank" rel="noreferrer" className="font-semibold underline">
            Política de privacidad completa
          </a>
          .
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-white/55 p-4 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[var(--amber)]"
          checked={dataConsent}
          onChange={(e) => onDataConsent(e.target.checked)}
        />
        <span>
          Autorizo el tratamiento de mis datos personales para las finalidades de la Política de
          Privacidad, incluida su transferencia a los proveedores ubicados en Estados Unidos.{" "}
          <strong>Obligatorio para crear la cuenta.</strong>
        </span>
      </label>
      {error ? <p className="-mt-1 text-xs text-[var(--red)]">{error}</p> : null}

      <label className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-white/55 p-4 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[var(--amber)]"
          checked={researchConsent}
          onChange={(e) => onResearchConsent(e.target.checked)}
        />
        <span>
          Autorizo que mis resultados de evaluación se usen, en forma agregada y anonimizada, para
          investigación académica. <strong>Opcional:</strong> puedo revocarlo cuando quiera en «Mis
          datos» sin afectar mi cuenta.
        </span>
      </label>
    </div>
  );
}
