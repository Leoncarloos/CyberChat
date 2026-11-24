// Siembra el corpus sintético (rag-eval/corpus/ORG-A y ORG-B) en una base de DESARROLLO.
//
//   RAG_EVAL_DEV_PROJECT_REF=<ref de la rama> \
//   npx tsx --env-file=.env.rag-eval.local rag-eval/runner/seedCorpus.ts --org-map-out ../org-map.json
//
// Por cada organización crea un administrador de prueba y sube sus documentos con la misma
// fragmentación y los mismos embeddings que el endpoint de subida. Escribe el mapeo
// alias -> id del administrador en --org-map-out, que debe quedar fuera del repositorio.
//
// Se niega a ejecutarse contra producción: el ref de la URL debe coincidir con
// RAG_EVAL_DEV_PROJECT_REF y no puede ser el de producción.

import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { embedHF } from "@/lib/embedHF";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { chunkBySentences } from "./chunking";

const PRODUCTION_REF = "wyzzrjeeuwjiqzseclob";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORPUS = join(REPO, "rag-eval", "corpus");

export const ORGANIZATIONS: Record<string, { email: string; ruc: string }> = {
  "ORG-A": { email: "org-a-admin@rag-eval.invalid", ruc: "20999999991" },
  "ORG-B": { email: "org-b-admin@rag-eval.invalid", ruc: "20999999992" },
};

export function assertDevelopmentTarget(
  url: string | undefined,
  devRef: string | undefined,
  production: string = PRODUCTION_REF
) {
  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL.");
  if (!devRef) throw new Error("Falta RAG_EVAL_DEV_PROJECT_REF (el ref de la rama de desarrollo).");
  if (devRef === production) throw new Error("Ese ref es el de producción: no se siembra ahí.");
  const host = new URL(url).hostname;
  if (host.includes(production)) throw new Error("La URL apunta a producción: no se siembra ahí.");
  if (!host.startsWith(`${devRef}.`)) {
    throw new Error(`La URL (${host}) no corresponde al ref de desarrollo declarado.`);
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function ensureAdmin(alias: string) {
  const { email, ruc } = ORGANIZATIONS[alias];
  const admin = supabaseAdmin();
  const found = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (found.error) throw new Error(found.error.message);
  const existing = found.data.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const created = await admin.auth.admin.createUser({
    email,
    password: randomBytes(24).toString("base64url"), // nadie inicia sesión con esta cuenta
    email_confirm: true,
    app_metadata: { role: "admin", ruc, approval_status: "active", diagnostic_done: true },
    user_metadata: { full_name: `Administrador ${alias} (prueba)` },
  });
  if (created.error || !created.data.user) throw new Error(created.error?.message ?? "sin usuario");
  return created.data.user.id;
}

async function seedOrganization(alias: string, adminId: string, reset: boolean) {
  const admin = supabaseAdmin();
  const dir = join(CORPUS, alias);
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();

  if (reset) {
    const del = await admin.from("documents").delete().eq("uploaded_by", adminId);
    if (del.error) throw new Error(del.error.message);
  }
  const current = await admin.from("documents").select("name").eq("uploaded_by", adminId);
  if (current.error) throw new Error(current.error.message);
  const present = new Set((current.data ?? []).map((d) => d.name as string));

  let documents = 0;
  let chunksTotal = 0;
  for (const file of files) {
    if (present.has(file)) continue;
    const text = readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n").trim();
    const chunks = chunkBySentences(text);
    const embeddings: number[][] = [];
    for (const content of chunks) embeddings.push(await embedHF(content));

    const doc = await admin
      .from("documents")
      .insert({ name: file, storage_path: `synthetic/${alias}/${file}`, uploaded_by: adminId })
      .select("id")
      .single();
    if (doc.error) throw new Error(doc.error.message);

    const ins = await admin.from("document_chunks").insert(
      chunks.map((content, i) => ({
        document_id: doc.data.id,
        chunk_index: i,
        content,
        embedding: embeddings[i],
      }))
    );
    if (ins.error) {
      await admin.from("documents").delete().eq("id", doc.data.id);
      throw new Error(ins.error.message);
    }
    documents += 1;
    chunksTotal += chunks.length;
    console.log(`  ${alias}/${file}: ${chunks.length} fragmentos`);
  }
  return { documents, chunks: chunksTotal, skipped: files.length - documents };
}

async function main() {
  assertDevelopmentTarget(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.RAG_EVAL_DEV_PROJECT_REF);

  const out = argument("--org-map-out");
  if (!out) throw new Error("Falta --org-map-out ruta/fuera/del/repo/org-map.json");
  const outPath = resolve(out);
  const rel = relative(REPO, outPath);
  if (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)) {
    throw new Error("El mapeo debe quedar FUERA del repositorio.");
  }

  const reset = process.argv.includes("--reset");
  const map: Record<string, string> = {};
  for (const alias of Object.keys(ORGANIZATIONS)) {
    if (!existsSync(join(CORPUS, alias))) throw new Error(`Falta rag-eval/corpus/${alias}`);
    map[alias] = await ensureAdmin(alias);
    const r = await seedOrganization(alias, map[alias], reset);
    console.log(`${alias}: ${r.documents} documentos nuevos, ${r.chunks} fragmentos, ${r.skipped} ya existían`);
  }
  writeFileSync(outPath, JSON.stringify(map, null, 2) + "\n", "utf8");
  console.log(`Mapeo escrito en ${outPath}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
