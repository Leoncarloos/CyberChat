import { z } from "zod";

/**
 * En ambas evaluaciones el cliente envía sus RESPUESTAS, nunca el puntaje: hasta el
 * 2026-09-12 el score se calculaba en el navegador y el backend lo guardaba tal
 * cual, así que cualquiera podía enviarse la nota que quisiera. Ahora el servidor
 * califica contra el banco correspondiente —`lib/diagnosticBank.ts` (server-only)
 * para el diagnóstico, `posttest_questions` para el post-test— y estos esquemas
 * ya no aceptan `score`, `total` ni `topicsPerformance` desde el cliente.
 */
const selectedIndexSchema = z.number().int().min(0).max(9);

const answersSchema = <T extends z.ZodTypeAny>(questionId: T) =>
  z
    .array(z.object({ questionId, selectedIndex: selectedIndexSchema }))
    .min(1, "Debes enviar al menos una respuesta")
    .max(64, "Demasiadas respuestas");

// Los ids del diagnóstico son claves cortas del banco en código ("p1", "ia2"...).
export const diagnosticBodySchema = z.object({
  answers: answersSchema(z.string().min(1, "questionId requerido").max(64)),
});

// Los del post-test son UUID de la tabla posttest_questions.
export const quizBodySchema = z.object({
  testType: z.enum(["posttest", "recurrente"]).optional(),
  answers: answersSchema(z.string().uuid("questionId debe ser un UUID")),
});

export type DiagnosticBodyInput = z.infer<typeof diagnosticBodySchema>;
export type QuizBodyInput = z.infer<typeof quizBodySchema>;
