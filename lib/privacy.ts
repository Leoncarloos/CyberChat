// Datos que la Ley N.° 29733 y su Reglamento (D.S. N.° 016-2024-JUS, art. 6) exigen informar
// al recopilar datos. Cambiar POLICY_VERSION cada vez que cambie la política: el consentimiento
// queda registrado contra esa versión.
export const POLICY_VERSION = "2026-10-27";

export const CONTROLLER = {
  names: ["Maycolt Alessandro Espinoza Salinas", "Carlos Rodrigo Leon Asencios"],
  role: "equipo responsable de la plataforma CyberChat",
  contactEmail: "u202116219@upc.edu.pe",
  address: "Universidad Peruana de Ciencias Aplicadas (UPC), Prolongación Primavera 2390, Monterrico, Santiago de Surco, Lima, Perú",
};

export const BANK_NAME = "Usuarios de CyberChat";

export type ArcoType = "informacion" | "acceso" | "rectificacion" | "cancelacion" | "oposicion" | "revocacion";

// Plazos máximos de respuesta en días hábiles, contados desde el día siguiente de la
// solicitud (Reglamento, art. 69). La revocación total se atiende como cancelación (art. 10.3).
export const ARCO_TYPES: Record<ArcoType, { label: string; description: string; businessDays: number }> = {
  informacion: {
    label: "Información",
    description: "Saber qué tratamiento se hace de mis datos, con qué finalidad y a quién se transfieren.",
    businessDays: 8,
  },
  acceso: {
    label: "Acceso",
    description: "Obtener una copia de mis datos personales y saber cómo y por qué se recopilaron.",
    businessDays: 20,
  },
  rectificacion: {
    label: "Rectificación",
    description: "Corregir o completar datos inexactos, incompletos o desactualizados.",
    businessDays: 10,
  },
  cancelacion: {
    label: "Cancelación",
    description: "Que se supriman mis datos y se elimine mi cuenta.",
    businessDays: 10,
  },
  oposicion: {
    label: "Oposición",
    description: "Que se deje de tratar mis datos por un motivo legítimo relacionado con mi situación personal.",
    businessDays: 10,
  },
  revocacion: {
    label: "Revocación del consentimiento",
    description: "Retirar la autorización para el tratamiento de mis datos.",
    businessDays: 10,
  },
};

// Feriados nacionales del Perú de fecha fija (MM-DD). Jueves y Viernes Santo se calculan.
const FIXED_HOLIDAYS = new Set([
  "01-01", "05-01", "06-07", "06-29", "07-23", "07-28", "07-29",
  "08-06", "08-30", "10-08", "11-01", "12-08", "12-09", "12-25",
]);

function easterSunday(year: number): Date {
  // Algoritmo de Meeus/Jones/Butcher (calendario gregoriano).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isBusinessDay(d: Date): boolean {
  const weekday = d.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  if (FIXED_HOLIDAYS.has(isoDate(d).slice(5))) return false;
  const easter = easterSunday(d.getUTCFullYear()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const t = d.getTime();
  return t !== easter - 3 * day && t !== easter - 2 * day;
}

/** Fecha (YYYY-MM-DD, hora de Lima) en que vence un plazo de `days` días hábiles desde `from`. */
export function addBusinessDays(from: Date, days: number): string {
  // La fecha de presentación se toma en hora de Lima (UTC-5, sin horario de verano).
  const lima = new Date(from.getTime() - 5 * 60 * 60 * 1000);
  const cursor = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()));
  let counted = 0;
  while (counted < days) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isBusinessDay(cursor)) counted++;
  }
  return isoDate(cursor);
}
