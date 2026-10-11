import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const route = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
const source = route.slice(route.indexOf("function buildSystemPrompt("), route.indexOf("export async function POST("))
  .replace("function buildSystemPrompt(", "export function buildSystemPrompt(");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildSystemPrompt } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const prompt = buildSystemPrompt("--- Fuente 1 ---\nEVIDENCIA_ACTUAL", 1, true);
for (const rule of ["actor, destinatario y escenario", "ni lo sustituyas por una recomendacion",
  "no declares que faltan pasos adicionales", "No cambies el foco a un procedimiento de derivacion",
  "telefono exacto", "No prometas eliminar riesgos", "[Fuente N]", "EVIDENCIA_ACTUAL"]) {
  assert(prompt.includes(rule), `Missing prompt guard: ${rule}`);
}
assert(!buildSystemPrompt("", 0, true).includes("EVIDENCIA_ACTUAL"));
assert(buildSystemPrompt("", 0, true).includes("No encontre evidencia suficiente"));

// Exercise the actual fallback expression without calling a provider or database.
const start = route.indexOf("top = retrieval.vector");
assert(start > 0);
const end = route.indexOf(";", start);
const fallback = new Function("retrieval", "SIM_THRESHOLD", "MAX_CHUNKS",
  `let top; ${route.slice(start, end + 1)} return top;`);
const chunk = (id, similarity, content = id) => ({ id, similarity, content });
assert.deepEqual(fallback({ vector: [chunk("low", 0.2), chunk("b", 0.5),
  chunk("a", 0.9, "same text"), chunk("duplicate", 0.8, " Same  text ")],
  candidates: [chunk("lexical-only", 1)] }, 0.38, 5).map(item => item.id), ["a", "b"]);
assert.deepEqual(fallback({ vector: [] }, 0.38, 5), []);
console.log("PASS: prompt guards, no-evidence branch, vector fallback ordering, threshold and deduplication.");
