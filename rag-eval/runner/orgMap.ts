import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// El alias (ORG-A…) es lo único que aparece en el conjunto y en los resultados. La
// correspondencia con el id del administrador vive en un archivo fuera del repo.
export type OrgMap = Record<string, string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALIAS = /^ORG-[A-Z0-9]+$/;

export function loadOrgMap(path = process.env.RAG_EVAL_ORG_MAP): OrgMap {
  if (!path) {
    throw new Error("Falta RAG_EVAL_ORG_MAP: ruta al archivo de mapeo alias -> administrador.");
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const map: OrgMap = {};
  for (const [alias, adminId] of Object.entries(raw)) {
    if (alias.startsWith("_")) continue;
    if (!ALIAS.test(alias)) throw new Error(`Alias inválido en el mapeo: ${alias}`);
    if (typeof adminId !== "string" || !UUID.test(adminId)) {
      throw new Error(`El id del administrador de ${alias} no es un UUID.`);
    }
    map[alias] = adminId;
  }
  const ids = Object.values(map);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Dos alias apuntan al mismo administrador.");
  }
  if (ids.length === 0) throw new Error("El mapeo no tiene ninguna organización.");
  return map;
}

// Referencia corta y estable de un administrador, para hablar de él sin mostrar su id.
export function adminRef(adminId: string): string {
  return createHash("sha256").update(adminId).digest("hex").slice(0, 6);
}
