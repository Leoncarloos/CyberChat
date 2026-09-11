"use client";

import { passwordStrengthChecks, PASSWORD_MIN_LENGTH } from "@/lib/validators/auth";

const RULES: { key: keyof ReturnType<typeof passwordStrengthChecks>; label: string }[] = [
  { key: "minLength", label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres` },
  { key: "hasUpper", label: "Una letra mayúscula" },
  { key: "hasLower", label: "Una letra minúscula" },
  { key: "hasNumber", label: "Un número" },
  { key: "hasSpecial", label: "Un carácter especial (!@#$...)" },
];

export default function PasswordStrengthHint({ password }: { password: string }) {
  const checks = passwordStrengthChecks(password);

  return (
    <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
      {RULES.map((rule) => {
        const ok = checks[rule.key];
        return (
          <li
            key={rule.key}
            className={ok ? "text-[var(--green)]" : "text-[var(--muted)]"}
          >
            {ok ? "✓" : "○"} {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
