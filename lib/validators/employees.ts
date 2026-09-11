import { z } from "zod";

const optionalNamePart = z
  .string()
  .trim()
  .max(80, "Es demasiado largo")
  .regex(/^[A-Za-zÀ-ÖØ-öø-ÿÑñ' -]*$/, "Solo se permiten letras y espacios")
  .optional();

export const employeePatchSchema = z.object({
  userId: z.string().uuid("userId inválido"),
  action: z.enum(["approve", "reject", "edit"]),
  firstName: optionalNamePart,
  lastName: optionalNamePart,
});

export type EmployeePatchInput = z.infer<typeof employeePatchSchema>;
