/**
 * Metadatos de los 8 temas del diagnóstico: seguro para el cliente.
 *
 * Las preguntas y sus respuestas viven aparte, en `lib/diagnosticBank.ts`, que es
 * server-only. Casi todo el código (dashboards, métricas, validadores, ruta de
 * aprendizaje) solo necesita `key` y `label`: importar desde aquí evita arrastrar
 * el banco con los `correctIndex` al bundle del navegador.
 */
export type DiagnosticTopicMeta = { key: string; label: string };

export const diagnosticTopics: DiagnosticTopicMeta[] = [
  { key: "phishing", label: "Phishing e Ingeniería Social" },
  { key: "ia_amenazas", label: "Inteligencia Artificial y Nuevas Amenazas" },
  { key: "canales_venta", label: "Seguridad en Canales de Venta Digitales" },
  { key: "contrasenas", label: "Gestión de Contraseñas" },
  { key: "accesos", label: "Control de Accesos" },
  { key: "ley_29733", label: "Protección de la Información del Cliente (Ley N.° 29733)" },
  { key: "datos_sensibles", label: "Manejo de Datos Sensibles" },
  { key: "resiliencia", label: "Resiliencia con Recursos Mínimos" },
];

export const QUESTIONS_PER_DIAGNOSTIC_TOPIC = 2;

export const totalQuestions = diagnosticTopics.length * QUESTIONS_PER_DIAGNOSTIC_TOPIC;
