// Fija la versión documental de una evaluación. Solo lee.
//
//   npx tsx --env-file=.env.local rag-eval/runner/corpusHash.ts --list
//   npx tsx --env-file=.env.local rag-eval/runner/corpusHash.ts
//
// --list muestra, por administrador, cuántos documentos y fragmentos tiene (para armar el
// archivo de mapeo). Sin argumentos calcula el hash del corpus de las organizaciones del mapeo.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminRef, loadOrgMap, type OrgMap } from "./orgMap";

const RESULTS = join(dirname(fileURLToPath(import.meta.url)), "..", "results");
const PAGE = 1000;

type DocRow = { id: string; uploaded_by: string; created_at: string };
type ChunkRow = {
  id: string;
  document_id: string;
  chunk_index: number | null;
  content: string | null;
  embedding: string | number[] | null;
};

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

async function fetchAll<T>(
  table: string,
  columns: string,
  filter: { column: string; values: string[] } | null
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabaseAdmin().from(table).select(columns).order("id").range(from, from + PAGE - 1);
    if (filter) query = query.in(filter.column, filter.values);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function listAdmins() {
  const docs = await fetchAll<DocRow>("documents", "id, uploaded_by, created_at", null);
  const chunks = await fetchAll<{ id: string; document_id: string }>(
    "document_chunks",
    "id, document_id",
    null
  );
  const owner = new Map(docs.map((d) => [d.id, d.uploaded_by]));
  const stats = new Map<string, { documentos: number; fragmentos: number }>();
  for (const d of docs) {
    const s = stats.get(d.uploaded_by) ?? { documentos: 0, fragmentos: 0 };
    s.documentos += 1;
    stats.set(d.uploaded_by, s);
  }
  for (const c of chunks) {
    const admin = owner.get(c.document_id);
    if (admin) stats.get(admin)!.fragmentos += 1;
  }
  console.log("ref     documentos  fragmentos  id del administrador");
  for (const [admin, s] of [...stats].sort((a, b) => b[1].fragmentos - a[1].fragmentos)) {
    console.log(
      `${adminRef(admin)}  ${String(s.documentos).padStart(10)}  ${String(s.fragmentos).padStart(10)}  ${admin}`
    );
  }
}

export async function computeCorpus(orgMap: OrgMap) {
  const aliasByAdmin = new Map(Object.entries(orgMap).map(([alias, id]) => [id, alias]));
  const docs = await fetchAll<DocRow>("documents", "id, uploaded_by, created_at", {
    column: "uploaded_by",
    values: Object.values(orgMap),
  });
  const chunks = docs.length
    ? await fetchAll<ChunkRow>("document_chunks", "id, document_id, chunk_index, content, embedding", {
        column: "document_id",
        values: docs.map((d) => d.id),
      })
    : [];

  const byDoc = new Map<string, ChunkRow[]>();
  for (const c of chunks) {
    const list = byDoc.get(c.document_id) ?? [];
    list.push(c);
    byDoc.set(c.document_id, list);
  }

  // corpus_hash cambia si cambia el texto; index_hash además si cambian los vectores
  // (misma versión documental reindexada con otra fragmentación u otro modelo).
  const contentLines: string[] = [];
  const indexLines: string[] = [];
  const documents = docs
    .map((d) => ({ ...d, alias: aliasByAdmin.get(d.uploaded_by)! }))
    .sort((a, b) => a.alias.localeCompare(b.alias) || a.id.localeCompare(b.id))
    .map((d) => {
      const list = (byDoc.get(d.id) ?? []).sort(
        (a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0) || a.id.localeCompare(b.id)
      );
      const docLines = list.map((c) => {
        const line = `${d.alias}|${d.id}|${d.created_at}|${c.chunk_index ?? ""}|${sha256(c.content ?? "")}`;
        contentLines.push(line);
        const vector = typeof c.embedding === "string" ? c.embedding : JSON.stringify(c.embedding);
        indexLines.push(`${line}|${sha256(vector ?? "")}`);
        return line;
      });
      if (list.length === 0) contentLines.push(`${d.alias}|${d.id}|${d.created_at}||`);
      return {
        org_alias: d.alias,
        document_id: d.id,
        created_at: d.created_at,
        chunks: list.length,
        chunks_without_embedding: list.filter((c) => c.embedding == null).length,
        content_sha256: sha256(docLines.join("\n")),
      };
    });

  return {
    corpus_hash: sha256(contentLines.join("\n")),
    index_hash: sha256(indexLines.join("\n")),
    computed_at: new Date().toISOString(),
    organizations: Object.keys(orgMap)
      .sort()
      .map((alias) => ({
        org_alias: alias,
        documents: documents.filter((d) => d.org_alias === alias).length,
        chunks: documents.filter((d) => d.org_alias === alias).reduce((n, d) => n + d.chunks, 0),
      })),
    documents,
  };
}

async function hashCorpus() {
  const result = await computeCorpus(loadOrgMap());
  const corpusHash = result.corpus_hash;

  mkdirSync(RESULTS, { recursive: true });
  const file = join(RESULTS, `corpus_${corpusHash.slice(0, 12)}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`corpus_hash ${corpusHash}`);
  console.log(`index_hash  ${result.index_hash}`);
  for (const o of result.organizations) {
    console.log(`  ${o.org_alias}: ${o.documents} documentos, ${o.chunks} fragmentos`);
  }
  console.log(`Guardado en ${file}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  (process.argv.includes("--list") ? listAdmins() : hashCorpus()).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
