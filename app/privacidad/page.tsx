import type { Metadata } from "next";
import { ARCO_TYPES, BANK_NAME, CONTROLLER, POLICY_VERSION } from "@/lib/privacy";

export const metadata: Metadata = { title: "Política de privacidad · CyberChat" };

// Contenido mínimo que exige el art. 6 del Reglamento de la Ley N.° 29733
// (D.S. N.° 016-2024-JUS) al recopilar datos directamente del titular.
const PROVIDERS = [
  {
    name: "Supabase",
    activity: "Autenticación, base de datos y almacenamiento de archivos",
    location: "Estados Unidos (servidores de AWS, región us-west-2)",
    data: "Todos los datos de la cuenta, resultados, conversaciones y documentos",
  },
  {
    name: "Vercel",
    activity: "Alojamiento y ejecución de la aplicación web",
    location: "Estados Unidos",
    data: "Datos que viajan en cada solicitud a la plataforma",
  },
  {
    name: "Groq",
    activity: "Generación de respuestas con inteligencia artificial",
    location: "Estados Unidos",
    data: "Tus preguntas al asistente, fragmentos de los documentos de tu empresa y datos agregados de resultados (sin nombres ni correos)",
  },
  {
    name: "Hugging Face",
    activity: "Cálculo de representaciones vectoriales (embeddings) del texto",
    location: "Estados Unidos",
    data: "El texto de tus preguntas y de los documentos que sube el dueño de tu empresa",
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="display-title text-2xl font-bold">{title}</h2>
      <div className="space-y-3 text-[15px] leading-7 text-[var(--ink)]">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="app-shell min-h-screen px-4 py-8 sm:px-6">
      <article className="glass-card mx-auto max-w-[860px] space-y-8 rounded-[1.8rem] p-6 sm:p-10">
        <header className="space-y-3">
          <p className="eyebrow">Protección de datos personales</p>
          <h1 className="display-title text-4xl font-extrabold">Política de privacidad de CyberChat</h1>
          <p className="helper-text">
            En cumplimiento de la Ley N.° 29733, Ley de Protección de Datos Personales, y su
            Reglamento aprobado por Decreto Supremo N.° 016-2024-JUS. Versión {POLICY_VERSION}.
          </p>
        </header>

        <Section title="1. Responsable del tratamiento">
          <p>
            El titular del banco de datos personales «{BANK_NAME}» es el {CONTROLLER.role}:{" "}
            {CONTROLLER.names.join(" y ")}.
          </p>
          <p>
            Dirección: {CONTROLLER.address}. Correo de contacto para privacidad y derechos:{" "}
            <strong>{CONTROLLER.contactEmail}</strong>.
          </p>
        </Section>

        <Section title="2. Datos que tratamos">
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>Dueños de empresa:</strong> nombres y apellidos, correo, celular, RUC, razón
              social y nombre comercial de la empresa.
            </li>
            <li>
              <strong>Empleados:</strong> nombres y apellidos, correo y RUC de la empresa en la que
              trabajan.
            </li>
            <li>
              <strong>Todos:</strong> contraseña (solo en forma cifrada), respuestas y puntajes de las
              evaluaciones, progreso en la ruta de aprendizaje, conversaciones con el asistente y,
              en el caso del dueño, los documentos que sube.
            </li>
          </ul>
          <p>No solicitamos datos sensibles.</p>
        </Section>

        <Section title="3. Finalidades">
          <p>
            <strong>Finalidad principal (necesaria para el servicio):</strong> crear y gestionar tu
            cuenta, verificar tu pertenencia a la empresa, aplicar las evaluaciones de
            ciberseguridad, responder tus consultas con el asistente virtual, mostrarte tu progreso
            y mostrar al dueño de tu empresa los indicadores de su organización.
          </p>
          <p>
            <strong>Finalidad adicional (opcional):</strong> usar tus resultados de evaluación, en
            forma agregada y anonimizada, para investigación académica sobre concientización en
            ciberseguridad en MYPEs. Nunca se publica información que te identifique.
          </p>
        </Section>

        <Section title="4. Carácter obligatorio u opcional">
          <p>
            Los datos del formulario de registro y el consentimiento para la finalidad principal son
            obligatorios: sin ellos no es posible crear la cuenta ni prestar el servicio. El
            consentimiento para investigación es opcional; negarlo o revocarlo no afecta tu uso de
            la plataforma.
          </p>
        </Section>

        <Section title="5. Destinatarios y transferencia internacional">
          <p>
            Si eres empleado, el <strong>dueño de tu empresa</strong> en CyberChat ve tu nombre, tu
            correo, el estado de tu acceso y tus resultados de evaluación, para gestionar la
            capacitación de su organización.
          </p>
          <p>
            Para operar la plataforma usamos los siguientes proveedores, que tratan los datos por
            encargo nuestro. Todos están ubicados <strong>fuera del Perú</strong>, por lo que hay un
            flujo transfronterizo de datos personales:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="py-2 pr-3">Proveedor</th>
                  <th className="py-2 pr-3">Actividad</th>
                  <th className="py-2 pr-3">Ubicación</th>
                  <th className="py-2">Datos que recibe</th>
                </tr>
              </thead>
              <tbody>
                {PROVIDERS.map((p) => (
                  <tr key={p.name} className="border-b border-[var(--border)] align-top">
                    <td className="py-2 pr-3 font-semibold">{p.name}</td>
                    <td className="py-2 pr-3">{p.activity}</td>
                    <td className="py-2 pr-3">{p.location}</td>
                    <td className="py-2">{p.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="6. Decisiones automatizadas">
          <p>
            La plataforma calcula automáticamente tu nivel de conocimiento por tema y un nivel de
            riesgo a partir de tus evaluaciones, y con ellos arma tu ruta de aprendizaje y genera
            recomendaciones con inteligencia artificial. Estos resultados son solo formativos: no
            se usan para tomar decisiones laborales sobre ti dentro de la plataforma, aunque el
            dueño de tu empresa puede verlos. Puedes pedir que una persona revise un resultado a
            través del canal de derechos.
          </p>
        </Section>

        <Section title="7. Plazo de conservación">
          <p>
            Conservamos tus datos mientras mantengas tu cuenta. Si solicitas la cancelación, los
            suprimimos dentro del plazo de respuesta. Conservamos solo la constancia de tu
            consentimiento y de las solicitudes que presentes, como prueba del cumplimiento de la
            ley, y los resultados que hayas autorizado para investigación, únicamente en forma
            anonimizada.
          </p>
        </Section>

        <Section title="8. Tus derechos y cómo ejercerlos">
          <p>
            Puedes ejercer en cualquier momento y de forma gratuita tus derechos de información,
            acceso, rectificación, cancelación y oposición (ARCO), y revocar tu consentimiento:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>Desde la plataforma:</strong> en <a className="underline" href="/mis-datos">Mis datos</a>,
              con tu sesión iniciada. Tu identidad queda acreditada por tu cuenta.
            </li>
            <li>
              <strong>Por correo:</strong> a {CONTROLLER.contactEmail}, indicando tus nombres y
              apellidos, tu petición concreta, un correo para notificarte, la fecha y una copia de tu
              DNI o documento equivalente. Usa esta vía si no puedes iniciar sesión, por ejemplo si
              tu acceso está pendiente o fue rechazado.
            </li>
          </ul>
          <p>Plazos máximos de respuesta, en días hábiles desde el día siguiente a tu solicitud:</p>
          <ul className="list-disc space-y-1 pl-6">
            {Object.values(ARCO_TYPES).map((t) => (
              <li key={t.label}>
                {t.label}: {t.businessDays} días hábiles.
              </li>
            ))}
          </ul>
          <p>
            Salvo el de información, estos plazos pueden ampliarse una sola vez por un periodo igual
            cuando las circunstancias lo justifiquen, lo que te comunicaremos antes de que venzan. Si
            no estás conforme con la respuesta, puedes presentar una reclamación ante la Autoridad
            Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.
          </p>
        </Section>

        <Section title="9. Seguridad">
          <p>
            La comunicación con la plataforma viaja cifrada por HTTPS, las contraseñas se almacenan
            solo en forma cifrada y el acceso a los datos está restringido según el rol y la empresa
            de cada usuario.
          </p>
        </Section>

        <footer className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-6">
          <a href="/mis-datos" className="primary-button">Ejercer mis derechos</a>
          <a href="/login" className="secondary-button">Volver a CyberChat</a>
        </footer>
      </article>
    </main>
  );
}
