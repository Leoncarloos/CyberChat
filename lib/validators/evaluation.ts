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

export const quizBodySchema = z
  .object({
    ...scoreAndTotal,
    testType: z.enum(["posttest", "recurrente"]).optional(),
    topicsPerformance: topicsPerformanceSchema.optional(),
    questionIds: z.array(z.string().uuid()).optional(),
  })
  .refine((v) => v.score <= v.total, {
    message: "score no puede ser mayor que total",
    path: ["score"],
  });

export type DiagnosticBodyInput = z.infer<typeof diagnosticBodySchema>;
export type QuizBodyInput = z.infer<typeof quizBodySchema>;
