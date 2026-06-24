import { diagnosticTopics } from "@/lib/diagnosticQuestions";

export type KnowledgeLevel = "bajo" | "medio" | "alto";
export type ProgressStatus = "pendiente" | "en_progreso" | "completado";

// Catálogo controlado: solo temas aprobados del diagnóstico. Cada tema lleva un
// ícono y un prompt de arranque para iniciar una conversación dirigida sin que
// el empleado escriba nada manualmente (HU11 - escenario 3).
export type LearningTopicMeta = {
  key: string;
  label: string;
  icon: string;
  starterPrompt: string;
};

const TOPIC_META: Record<string, { icon: string; starterPrompt: string }> = {
  phishing: {
    icon: "🎣",
    starterPrompt:
      "Quiero reforzar mis conocimientos sobre phishing e ingeniería social. Explícame de forma sencilla qué es, cómo reconocer los ataques más comunes en una MYPE peruana y dame 3 preguntas cortas de refuerzo al final para practicar.",
  },
  ia_amenazas: {
    icon: "🤖",
    starterPrompt:
      "Quiero aprender sobre inteligencia artificial y nuevas amenazas (deepfakes, clonación de voz). Dame una introducción clara para una MYPE y termina con 3 preguntas de refuerzo para practicar.",
  },
  canales_venta: {
    icon: "🛒",
    starterPrompt:
      "Quiero reforzar la seguridad en mis canales de venta digitales (tienda online, WhatsApp, pagos). Explícame los riesgos clave para una MYPE y cierra con 3 preguntas de refuerzo.",
  },
  contrasenas: {
    icon: "🔑",
    starterPrompt:
      "Quiero mejorar mi gestión de contraseñas. Enséñame buenas prácticas para una MYPE (gestores, contraseñas fuertes, MFA) y termina con 3 preguntas de refuerzo.",
  },
  accesos: {
    icon: "🚪",
    starterPrompt:
      "Quiero entender el control de accesos (mínimo privilegio, baja de empleados). Dame una explicación práctica para una MYPE y cierra con 3 preguntas de refuerzo.",
  },
  ley_29733: {
    icon: "⚖️",
    starterPrompt:
      "Quiero conocer mis obligaciones bajo la Ley N.° 29733 de protección de datos personales. Explícame lo esencial para una MYPE peruana y termina con 3 preguntas de refuerzo.",
  },
  datos_sensibles: {
    icon: "🗂️",
    starterPrompt:
      "Quiero aprender a manejar datos sensibles de clientes (tarjetas, documentos). Dame buenas prácticas para una MYPE y cierra con 3 preguntas de refuerzo.",
  },
  resiliencia: {
    icon: "🛟",
    starterPrompt:
      "Quiero mejorar la resiliencia de mi empresa con recursos mínimos (backups regla 3-2-1, respuesta a ransomware). Explícame lo esencial para una MYPE y termina con 3 preguntas de refuerzo.",
  },
};

// Orden y etiquetas provienen del catálogo del diagnóstico (fuente única).
export const learningTopics: LearningTopicMeta[] = diagnosticTopics.map((t) => ({
  key: t.key,
  label: t.label,
  icon: TOPIC_META[t.key]?.icon ?? "🛡️",
  starterPrompt:
    TOPIC_META[t.key]?.starterPrompt ??
    `Quiero reforzar mis conocimientos sobre ${t.label.toLowerCase()} en el contexto de una MYPE peruana. Dame una introducción clara y termina con 3 preguntas de refuerzo.`,
}));

export const learningTopicByKey: Record<string, LearningTopicMeta> =
  Object.fromEntries(learningTopics.map((t) => [t.key, t]));

export function levelFromPct(pct: number): KnowledgeLevel {
  if (pct >= 75) return "alto";
  if (pct >= 50) return "medio";
  return "bajo";
}
