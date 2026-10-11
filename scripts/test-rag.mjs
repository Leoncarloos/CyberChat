import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadTs(path, transform = (source) => source) {
  const source = transform(await readFile(new URL(path, import.meta.url), "utf8"));
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const text = await loadTs("../lib/ragText.ts", (source) => source.replace(
  '"@xenova/transformers"', JSON.stringify(import.meta.resolve("@xenova/transformers"))));
const retrieval = await loadTs("../lib/ragRetrieval.ts", (source) => source.replace(
  'import { supabaseAdmin } from "@/lib/supabaseAdmin";',
  'const supabaseAdmin = () => { throw new Error("Database not used in unit tests"); };'));

const chunks = await text.chunkDocument("# Politica\nMFA\n" + "Conserva las credenciales y reporta incidentes. ".repeat(100), "politica.txt");
assert(chunks.length > 1);
assert(chunks.some((chunk) => chunk.includes("MFA")), "Short rules must not be dropped");
for (const chunk of chunks) assert(await text.tokenCount(chunk) <= text.EMBEDDING_TOKEN_LIMIT);
assert.deepEqual(await text.chunkDocument("", "empty.txt"), []);
assert(retrieval.queryTerms("Que significa MFA y derechos ARCO?").includes("mfa"));
const a = { id: "a", document_id: "doc", content: "shared heading ".repeat(10) + "a".repeat(120) };
const b = { id: "b", document_id: "doc", content: "shared heading ".repeat(10) + "b".repeat(120) };
const fused = retrieval.fuseCandidates([a, b], [b]);
assert.equal(fused[0].id, "b");
assert.equal(fused.length, 2);
assert.equal(retrieval.fuseCandidates([a], [{ ...a, id: "duplicate" }]).length, 1);
assert(retrieval.queryTerms("Contraseñas seguras").includes("contraseñas"));
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ids":["b","b","a"]}' } }] }));
  assert.deepEqual((await retrieval.rerank("question", [a, b], "test-key")).map((c) => c.id), ["b", "a"]);
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ids":["unknown"]}' } }] }));
  await assert.rejects(() => retrieval.rerank("question", [a], "test-key"), /IDs invalidos/);
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ids":[]}' } }] }));
  assert.deepEqual(await retrieval.rerank("question", [a], "test-key"), []);
} finally { globalThis.fetch = originalFetch; }
console.log("PASS: token limit, short rules, empty documents, RRF, deduplication and reranking IDs.");

if (process.argv[2]) {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  for (const name of (await readdir(process.argv[2])).filter((name) => /^politica_\d+.*\.txt$/i.test(name))) {
    const raw = await readFile(join(process.argv[2], name), "utf8");
    const documentChunks = await text.chunkDocument(raw, name);
    assert(documentChunks.length);
    for (const chunk of documentChunks) assert(await text.tokenCount(chunk) <= text.EMBEDDING_TOKEN_LIMIT);
    console.log(`${name}: ${documentChunks.length} chunks within token limit`);
  }
}
