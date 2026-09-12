import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Metadata = { role?: string; ruc?: string };

// Se resuelve en cada mensaje del chat y no hay tabla de empresas: el vínculo
// RUC -> dueño solo existe en auth.users.user_metadata, así que se cachea para no
// listar el directorio completo por consulta. Un RUC tiene un único admin y se
// fija al registrarse, por eso el TTL puede ser holgado. Los fallos no se cachean.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { adminId: string; cachedAt: number }>();

/**
 * Devuelve el id del dueño (rol admin) de la empresa con ese RUC, o null si no
 * existe. Es el identificador con el que está subida la base documental de la
 * empresa: `documents.uploaded_by`.
 */
export async function resolveOrgAdminId(ruc: string): Promise<string | null> {
  if (!ruc) return null;

  const hit = cache.get(ruc);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) return hit.adminId;

  const { data, error } = await supabaseAdmin().auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return null;

  const owner = (data.users ?? []).find((user) => {
    const metadata = (user.user_metadata ?? {}) as Metadata;
    return metadata.role === "admin" && metadata.ruc === ruc;
  });

  if (!owner) return null;

  cache.set(ruc, { adminId: owner.id, cachedAt: Date.now() });
  return owner.id;
}
