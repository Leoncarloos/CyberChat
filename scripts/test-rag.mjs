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
  '"@huggingface/tokenizers"', JSON.stringify(import.meta.resolve("@huggingface/tokenizers"))));
const retrieval = await loadTs("../lib/ragRetrieval.ts", (source) => source.replace(
  'import { supabaseAdmin } from "@/lib/supabaseAdmin";',
  'const supabaseAdmin = () => { throw new Error("Database not used in unit tests"); };'));
const prompts = await loadTs("../app/api/chat/route.ts", (source) => source
  .slice(source.indexOf("function buildSystemPrompt("), source.indexOf("export async function POST("))
  .replace("function buildSystemPrompt(", "export function buildSystemPrompt("));
const consentQuestion = "El equipo comercial quiere escribir a nuevos contactos. Que condicion establece la politica para esa finalidad?";
assert.deepEqual(retrieval.focusedQueryTerms(consentQuestion), ["consentimiento"]);
assert.deepEqual(retrieval.focusedQueryTerms("Un asesor atiende por WhatsApp personal. Esta permitido?"), []);
assert(retrieval.queryTerms(consentQuestion).includes("consentimiento"));
assert(retrieval.queryTerms("Un cliente solicita corregir su DNI. Que derecho ejerce?").includes("arco"));
assert(retrieval.queryTerms("Recibo una peticion de cancelacion de datos personales").includes("dpo"));
assert(retrieval.isPolicyQuestion("El ingreso al ERP queda exento del segundo factor?"));
assert(retrieval.isPolicyQuestion("Un cliente pide saber que informacion mantiene la empresa sobre el"));
assert(!retrieval.isPolicyQuestion("Hola"));
const rotationQuestion = "¿La política exige cambiar por calendario una contraseña que tiene dos meses de uso si no existen alertas de seguridad?";
assert(retrieval.isPolicyQuestion(rotationQuestion));
assert(retrieval.focusedQueryTerms(rotationQuestion).includes("rotación"));
assert(retrieval.queryTerms(rotationQuestion).includes("rutinarios"));
assert.deepEqual(retrieval.focusedQueryTerms("¿Qué longitud debe tener una contraseña?"), []);
const grounded = prompts.buildSystemPrompt("Evidencia de prueba", 1, true);
assert(grounded.includes("autosuficiente"));
assert(grounded.includes("derecho especifico"));
assert(grounded.includes("punto no verificado"));
assert(grounded.includes("[Fuente N]"));
assert(prompts.buildSystemPrompt("", 0, true).includes("No encontre evidencia suficiente"));
const routeSource = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
const guardStart = routeSource.indexOf("if (!top.length && policyQuestion)");
assert(guardStart > 0 && guardStart < routeSource.indexOf('const groqRes = await fetch('));
const guardBody = routeSource.slice(guardStart, routeSource.indexOf("const context =", guardStart));
const guardResult = await loadTs("../app/api/chat/route.ts", () =>
  `export function check() {
    const top = [], policyQuestion = true;
    const retrieval = { vector: [], lexicalCount: 0, candidates: [] };
    const rerankStatus = "ok", EMBED_MODEL = "test", SIM_THRESHOLD = 0.38;
    const NextResponse = { json: (body) => body };
    ${guardBody}
  }`);
assert.equal(guardResult.check().retrievalDiagnostics.mode, "sin-evidencia");
assert.deepEqual(guardResult.check().retrieved_contexts, []);
assert(!guardResult.check().answer.includes("90"));
assert(!guardResult.check().answer.includes("[Fuente"));

const calls = [];
globalThis.__ragTestAdmin = {
  from: () => ({ select: () => ({ eq: async () => ({ data: [{ id: "owned", name: "Policy" }], error: null }) }) }),
  rpc: async (name, params) => {
    calls.push({ name, params });
    if (name === "match_document_chunks_scoped") return { data: [], error: null };
    return { data: [{ id: params.search_terms === "consentimiento" ? "consent" : "channel", document_id: "owned", content: params.search_terms },
      { id: "foreign", document_id: "another-company", content: "Must not leak" }], error: null };
  },
};
try {
  const scopedRetrieval = await loadTs("../lib/ragRetrieval.ts", (source) => source.replace(
    'import { supabaseAdmin } from "@/lib/supabaseAdmin";', 'const supabaseAdmin = () => globalThis.__ragTestAdmin;'));
  const found = await scopedRetrieval.retrieveHybrid("owner", null, [1], consentQuestion);
  assert.equal(found.candidates[0].id, "consent");
  assert(!found.candidates.some((c) => c.document_id === "another-company"));
  assert(calls.every((c) => c.params.filter_user_id === "owner"));
  assert(calls.some((c) => c.params.search_terms === "consentimiento"));
} finally { delete globalThis.__ragTestAdmin; }

const chunks = await text.chunkDocument("# Politica\nMFA\n" + "Conserva las credenciales y reporta incidentes. ".repeat(100), "politica.txt");
assert(chunks.length > 1);
assert(chunks.some((chunk) => chunk.includes("MFA")), "Short rules must not be dropped");
for (const chunk of chunks) assert(await text.tokenCount(chunk) <= text.EMBEDDING_TOKEN_LIMIT);
assert.deepEqual(await text.chunkDocument("", "empty.txt"), []);
assert(retrieval.queryTerms("Que significa MFA y derechos ARCO?").includes("mfa"));
assert(retrieval.queryTerms("El ingreso al ERP queda exento del segundo factor?").includes("mfa"));
assert(retrieval.queryTerms("El ingreso al ERP queda exento del segundo factor?").includes("erp"));
assert(retrieval.queryTerms("Un cliente pide saber que informacion mantiene sobre él. Que derecho ejerce?").includes("arco"));
const a = { id: "a", document_id: "doc", content: "shared heading ".repeat(10) + "a".repeat(120) };
const b = { id: "b", document_id: "doc", content: "shared heading ".repeat(10) + "b".repeat(120) };
const fused = retrieval.fuseCandidates([a, b], [b]);
assert.equal(fused[0].id, "b");
assert.equal(fused.length, 2);
assert.equal(retrieval.fuseCandidates([a], [{ ...a, id: "duplicate" }]).length, 1);
assert(retrieval.queryTerms("Contraseñas seguras").includes("contraseñas"));
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(body.response_format.json_schema.schema.properties.ids.items.enum, ["a", "b"]);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ids":["b","b","a"]}' } }] }));
  };
  assert.deepEqual((await retrieval.rerank("question", [a, b], "test-key")).map((c) => c.id), ["b", "a"]);
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ids":["unknown"]}' } }] }));
  await assert.rejects(() => retrieval.rerank("question", [a], "test-key"), /IDs invalidos/);
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ids":[]}' } }] }));
  assert.deepEqual(await retrieval.rerank("question", [a], "test-key"), []);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "json_validate_failed", failed_generation: "PRIVATE DOCUMENT" } }), { status: 400 });
  await assert.rejects(() => retrieval.rerank("question", [a], "test-key"), (error) => {
    assert.match(error.message, /400 \(json_validate_failed\)/);
    assert(!error.message.includes("PRIVATE DOCUMENT"));
    return true;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"ids":[]}' } }] }));
  await assert.rejects(() => retrieval.rerank("question", [a], "test-key"), /salida incompleta/);
} finally { globalThis.fetch = originalFetch; }
console.log("PASS: token limit, short rules, empty documents, RRF, deduplication and reranking IDs.");

if (process.argv.includes("--live")) {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY requerida para prueba real");
  const evidence = { id: "11111111-1111-4111-8111-111111111111", document_id: "test", content: "El MFA es obligatorio en todas las cuentas de MB TECH: correo, ERP, VPN y servidores." };
  const unrelated = { id: "22222222-2222-4222-8222-222222222222", document_id: "test", content: "Realiza copias de seguridad cada semana." };
  const selected = await retrieval.rerank("El ingreso al ERP queda exento del segundo factor por ser una herramienta interna?", [evidence, unrelated], process.env.GROQ_API_KEY);
  assert.deepEqual(selected.map((item) => item.id), [evidence.id]);
  const empty = await retrieval.rerank("Cual es el precio del almuerzo?", [evidence, unrelated], process.env.GROQ_API_KEY);
  assert.deepEqual(empty, []);
  const consent = { id: "33333333-3333-4333-8333-333333333333", document_id: "test", content: "Para contactar a nuevos clientes con fines comerciales, MB TECH exige consentimiento previo libre, expreso e informado." };
  const channel = { id: "44444444-4444-4444-8444-444444444444", document_id: "test", content: "WhatsApp comercial debe utilizar los numeros oficiales integrados en el CRM." };
  const consentSelected = await retrieval.rerank(consentQuestion, [channel, consent], process.env.GROQ_API_KEY);
  assert.equal(consentSelected[0]?.id, consent.id);
  async function answer(question, context) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-oss-20b", reasoning_effort: "low", temperature: 0.15, max_tokens: 900,
        messages: [{ role: "system", content: prompts.buildSystemPrompt(`--- Fuente 1 ---\n${context}`, 1, true) }, { role: "user", content: question }] }),
    });
    assert(response.ok, `Generation HTTP ${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    assert(content.includes("[Fuente 1]"));
    assert(!/^\s*#/m.test(content));
    return content;
  }
  assert.match(await answer(consentQuestion, consent.content), /consentimiento/i);
  const access = await answer("Un cliente pide saber que informacion mantiene la empresa sobre el. Que derecho esta ejerciendo?",
    "ARCO comprende acceso, rectificacion, cancelacion y oposicion. Acceso permite conocer los datos que mantiene la empresa; rectificacion permite corregirlos.");
  assert.match(access.split(/[\n.!]/)[0], /acceso/i);
  const cancellation = await answer("Que debe hacer el asesor que recibe una peticion de cancelacion de datos personales?",
    "El asesor debe derivar inmediatamente la solicitud al DPO o al area legal. No debe ignorarla ni borrarla ni decidir por cuenta propia el resultado.");
  assert.match(cancellation, /DPO|legal/i);
  assert(!/(?:elimina|anonimiza) los datos/i.test(cancellation));
  console.log("PASS: Groq strict reranking selects ERP/MFA evidence and rejects unrelated evidence.");
  console.log("PASS: consent prioritization and grounded, cited answers for consent, access and cancellation (synthetic fixtures; not a database retrieval test).");
}

if (process.argv[2] && !process.argv[2].startsWith("--")) {
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
