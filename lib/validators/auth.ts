import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/;
const RUC_VALID_PREFIXES = ["10", "15", "17", "20"];

export const emailSchema = z
  .string()
  .trim()
  .min(1, "El correo es obligatorio")
  .max(254, "El correo es demasiado largo")
  .email("Ingresa un correo electrónico válido");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(72, "La contraseña es demasiado larga")
  .refine((v) => /[a-z]/.test(v), "Debe incluir al menos una minúscula")
  .refine((v) => /[A-Z]/.test(v), "Debe incluir al menos una mayúscula")
  .refine((v) => /[0-9]/.test(v), "Debe incluir al menos un número")
  .refine((v) => SPECIAL_CHARS_REGEX.test(v), "Debe incluir al menos un carácter especial");

export const rucSchema = z
  .string()
  .trim()
  .regex(/^\d{11}$/, "El RUC debe tener exactamente 11 dígitos")
  .refine(
    (v) => RUC_VALID_PREFIXES.includes(v.slice(0, 2)),
    "El RUC debe iniciar con 10, 15, 17 o 20"
  );

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^9\d{8}$/, "Debe ser un celular peruano válido (9 dígitos, empieza con 9)");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Debe tener al menos 2 caracteres")
  .max(80, "Es demasiado largo")
  .regex(/^[A-Za-zÀ-ÖØ-öø-ÿÑñ' -]+$/, "Solo se permiten letras y espacios");

export const businessNameSchema = z
  .string()
  .trim()
  .min(2, "Debe tener al menos 2 caracteres")
  .max(150, "Es demasiado largo");

const optionalTradeNameSchema = z
  .string()
  .trim()
  .max(150, "Es demasiado largo")
  .optional()
  .transform((v) => v ?? "");

/** Reglas evaluadas individualmente para mostrar un medidor de fuerza en el cliente. */
export function passwordStrengthChecks(password: string) {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: SPECIAL_CHARS_REGEX.test(password),
  };
}

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La contraseña es obligatoria"),
});

const passwordsMatch = (data: { password: string; confirmPassword: string }) =>
  data.password === data.confirmPassword;

export const registerAdminSchema = z
  .object({
    ruc: rucSchema,
    businessName: businessNameSchema,
    tradeName: optionalTradeNameSchema,
    ownerName: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, { message: "Las contraseñas no coinciden", path: ["confirmPassword"] });

export const registerEmployeeSchema = z
  .object({
    ruc: rucSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, { message: "Las contraseñas no coinciden", path: ["confirmPassword"] });

export type RegisterAdminInput = z.infer<typeof registerAdminSchema>;
export type RegisterEmployeeInput = z.infer<typeof registerEmployeeSchema>;

export { flattenFieldErrors } from "@/lib/validators/shared";
