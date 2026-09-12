import { z } from "zod";
import { diagnosticTopics } from "@/lib/diagnosticQuestions";

const VALID_TOPIC_KEYS = diagnosticTopics.map((t) => t.key) as [string, ...string[]];

const topicPerfSchema = z
  .object({
    correct: z.number().int().min(0),
    total: z.number().int().min(1),
  })
  .refine((v) => v.correct <= v.total, {
    message: "correct no puede ser mayor que total",
    path: ["correct"],
  });

const topicsPerformanceSchema = z.record(z.enum(VALID_TOPIC_KEYS), topicPerfSchema);

const scoreAndTotal = {
  score: z.number().int().min(0, "score no puede ser negativo"),
  total: z.number().int().min(1, "total debe ser al menos 1"),
};

export const diagnosticBodySchema = z
  .object({
    ...scoreAndTotal,
    topicsPerformance: topicsPerformanceSchema,
  })
  .refine((v) => v.score <= v.total, {
    message: "score no puede ser mayor que total",
    path: ["score"],
  });

/**
 * El cliente envía sus RESPUESTAS, no el puntaje: calificar en el navegador
 * permitía enviar cualquier nota. El score, el total y el desempeño por tema los
 * calcula el servidor contra `posttest_questions.correct_index`.
 */
export const quizBodySchema = z.object({
  testType: z.enum(["posttest", "recurrente"]).optional(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid("questionId debe ser un UUID"),
        selectedIndex: z.number().int().min(0).max(9),
      })
    )
    .min(1, "Debes enviar al menos una respuesta")
    .max(64, "Demasiadas respuestas"),
});

export type DiagnosticBodyInput = z.infer<typeof diagnosticBodySchema>;
export type QuizBodyInput = z.infer<typeof quizBodySchema>;
