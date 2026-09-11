import { z } from "zod";
import { diagnosticTopics } from "@/lib/diagnosticQuestions";

const VALID_TOPIC_KEYS = diagnosticTopics.map((t) => t.key) as [string, ...string[]];

export const learningPathBodySchema = z.object({
  topicKey: z.enum(VALID_TOPIC_KEYS, { message: "Tema inválido" }),
  status: z.enum(["pendiente", "en_progreso", "completado"], {
    message: "Estado inválido",
  }),
});

export type LearningPathBodyInput = z.infer<typeof learningPathBodySchema>;
