import { diagnosticTopics } from "@/lib/diagnosticTopics";

export const QUESTIONS_PER_TOPIC = 2;

/**
 * Preguntas por evaluación (post-test y recurrente): debe coincidir con el total
 * del diagnóstico inicial para que las mediciones sean comparables (HU21-2).
 * El servidor lo exige al calificar: así un cliente no puede enviar una sola
 * respuesta correcta y obtener 100%.
 */
export const TOTAL_QUESTIONS = QUESTIONS_PER_TOPIC * diagnosticTopics.length;
