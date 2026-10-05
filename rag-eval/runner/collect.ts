// Recolecta, para cada consulta del conjunto, todo lo que el protocolo exige conservar:
// candidatos, contextos que entran al prompt, prompt final y respuesta. Solo lee de la base.
//
//   npx tsx --env-file=.env.local rag-eval/runner/collect.ts --config rag-eval/configs/baseline.json
//
// Opciones: --dataset conjunto|bateria|ambos (ambos) · --ids Q01,Q02 · --limit N
//           --no-generate (solo recuperación, sin llamar al generador)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EMBED_DIM, EMBED_MODEL, embedHF } from "@/lib/embedHF";
import {
  GENERATOR,
  MAX_CHUNKS,
  MAX_HISTORY,
  SIM_THRESHOLD,
  buildMessages,
  filterCandidates,
  generate,
  lastUserMessage,
  retrieve,
  type ChatMsg,
  type GenerateResult,
  type GeneratorParams,
  type RpcMatch,
} from "@/lib/ragPipeline";
import { computeCorpus } from "./corpusHash";
import { loadOrgMap, type OrgMap } from "./orgMap";
import { rewriteQuery, type RewriteConfig } from "./rewrite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export type Config = {
  config_id: string;
  description?: string;
  retrieval: {
    threshold: number;
    max_chunks: number;
    match_count: number;
    candidates: number;
    rewrite_query?: RewriteConfig;
  };
  generator: GeneratorParams;
  history: { max_history: number };
  repetitions: number;
};

export type DatasetItem = {
  id: string;
  dataset: "conjunto" | "bateria";
  tipo: string;
  tema_clave: string;
  org_alias: string;
  org_contenido?: string;
  history?: ChatMsg[];
  user_input: string;
  reference?: string;
  expected_evidence?: string;
  expected_behavior?: string;
};

export type Deps = {
  embed: (text: string) => Promise<number[]>;
  retrieve: typeof retrieve;
  generate: (messages: ChatMsg[], params: GeneratorParams) => Promise<GenerateResult>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export type Context = {
  config: Config;
  orgMap: OrgMap;
  ownerByDocument: Map<string, string>;
  runId: string;
  gitCommit: string;
  corpusHash: string;
  indexHash: string;
  generateResponses: boolean;
};

type Fragment = {
  rank: number;
  chunk_id: string | null;
  document_id: string | null;
  owner_alias: string;
  similarity: number;
  content: string;
};

const MAX_RETRIES = 5;

// El generador de la cuenta tiene un límite de tokens por minuto: un 429 se reintenta
// respetando la espera que indica el proveedor, en vez de registrarse como fallo.
function retryDelayMs(detail: unknown, attempt: number): number {
  const text = typeof detail === "string" ? detail : JSON.stringify(detail ?? "");
  const match = /try again in ([\d.]+)\s*(ms|s)/i.exec(text);
  if (match) {
    const value = Number(match[1]);
    return Math.ceil(match[2].toLowerCase() === "ms" ? value : value * 1000) + 500;
  }
  return 2000 * 2 ** attempt;
}

async function generateWithRetry(messages: ChatMsg[], params: GeneratorParams, deps: Deps) {
  let retries = 0;
  for (;;) {
    const result = await deps.generate(messages, params);
    if (result.ok || result.status !== 429 || retries >= MAX_RETRIES) return { result, retries };
    await deps.sleep(retryDelayMs(result.detail, retries));
    retries += 1;
  }
}

function toFragments(matches: RpcMatch[], owners: Map<string, string>): Fragment[] {
  return matches.map((m, i) => ({
    rank: i + 1,
    chunk_id: m.id ?? null,
    document_id: m.document_id ?? null,
    // Un documento que no pertenece a ninguna organización del mapeo queda como "FUERA".
    owner_alias: owners.get(m.document_id ?? "") ?? "FUERA",
    similarity: Number(m.similarity ?? 0),
    content: String(m.content ?? ""),
  }));
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function collectQuery(item: DatasetItem, ctx: Context, deps: Deps) {
  const { config } = ctx;
  const incoming: ChatMsg[] = [...(item.history ?? []), { role: "user", content: item.user_input }];
  const base = {
    run_id: ctx.runId,
    config_id: config.config_id,
    query_id: item.id,
    dataset: item.dataset,
    tipo: item.tipo,
    tema_clave: item.tema_clave,
    org_alias: item.org_alias,
    org_contenido: item.org_contenido ?? null,
    user_input: item.user_input,
    history: item.history ?? [],
    reference: item.reference ?? null,
    expected_evidence: item.expected_evidence ?? null,
    expected_behavior: item.expected_behavior ?? null,
    generator: config.generator,
    git_commit: ctx.gitCommit,
    corpus_hash: ctx.corpusHash,
    index_hash: ctx.indexHash,
  };
  const stamp = () => new Date(deps.now()).toISOString();
  const failed = (stage: string, error: string, latencies: Record<string, number | null>) =>
    Array.from({ length: config.repetitions }, (_, i) => ({
      ...base,
      run: i + 1,
      candidates_raw: [],
      retrieved_contexts: [],
      top_matches_candidates: null,
      used_context: null,
      matches_count: null,
      best_similarity: null,
      messages: [],
      response: null,
      usage: null,
      retries: 0,
      latency_ms: { embedding: null, search: null, search_candidates: null, generation: null, ...latencies },
      error: { stage, message: error },
      timestamp: stamp(),
    }));

  const scopeUserId = ctx.orgMap[item.org_alias];
  if (!scopeUserId) return failed("configuracion", `No hay administrador para ${item.org_alias}`, {});

  // La recuperación es determinista: se hace una vez por consulta y se comparte entre las
  // repeticiones, que solo miden la variación del generador.
  let embedding: number[];
  let t = deps.now();
  const rewrite = await rewriteQuery(
    item.history ?? [],
    lastUserMessage(incoming),
    config.retrieval.rewrite_query,
    deps.generate
  );
  const rewriteOn = config.retrieval.rewrite_query?.enabled === true;
  const rewriteMs = rewriteOn ? deps.now() - t : null;
  if (rewriteOn) t = deps.now();
  try {
    embedding = await deps.embed(rewrite.query);
  } catch (error) {
    return failed("embedding", message(error), { embedding: deps.now() - t });
  }
  const embeddingMs = deps.now() - t;

  // Dos búsquedas: la de producción (lo que entra al prompt) y la ampliada (para los barridos
  // offline de umbral y de k). Se comparan porque el índice HNSW es aproximado y filtra
  // después de buscar: los primeros de la ampliada pueden no coincidir con la de producción.
  t = deps.now();
  const production = await deps.retrieve({
    queryEmbedding: embedding,
    scopeUserId,
    matchCount: config.retrieval.match_count,
  });
  const searchMs = deps.now() - t;
  if (production.error !== null) {
    return failed("recuperacion", production.error, { embedding: embeddingMs, search: searchMs });
  }

  t = deps.now();
  const wide = await deps.retrieve({
    queryEmbedding: embedding,
    scopeUserId,
    matchCount: config.retrieval.candidates,
  });
  const candidatesMs = deps.now() - t;
  if (wide.error !== null) {
    return failed("recuperacion", wide.error, {
      embedding: embeddingMs,
      search: searchMs,
      search_candidates: candidatesMs,
    });
  }

  const top = filterCandidates(production.matches, {
    threshold: config.retrieval.threshold,
    maxChunks: config.retrieval.max_chunks,
  });
  const messages = buildMessages(incoming, top, config.history.max_history);
  const ids = (list: RpcMatch[]) => list.map((m) => m.id ?? "");
  const shared = {
    ...base,
    candidates_raw: toFragments(wide.matches, ctx.ownerByDocument),
    retrieved_contexts: toFragments(top, ctx.ownerByDocument),
    top_matches_candidates:
      JSON.stringify(ids(production.matches)) ===
      JSON.stringify(ids(wide.matches).slice(0, production.matches.length)),
    used_context: top.length > 0,
    matches_count: top.length,
    best_similarity: Number(top[0]?.similarity ?? 0),
    messages,
    rewritten_query: rewrite.rewritten ? rewrite.query : null,
    rewrite_error: rewrite.error,
    rewrite_usage: rewrite.usage,
  };
  const latency = { ...(rewriteOn ? { rewrite: rewriteMs } : {}), embedding: embeddingMs, search: searchMs, search_candidates: candidatesMs };

  const records = [];
  for (let run = 1; run <= config.repetitions; run++) {
    if (!ctx.generateResponses) {
      records.push({
        ...shared,
        run,
        response: null,
        usage: null,
        retries: 0,
        latency_ms: { ...latency, generation: null },
        error: null,
        timestamp: stamp(),
      });
      continue;
    }
    t = deps.now();
    let outcome: Awaited<ReturnType<typeof generateWithRetry>> | null = null;
    let thrown: string | null = null;
    try {
      outcome = await generateWithRetry(messages, config.generator, deps);
    } catch (error) {
      thrown = message(error);
    }
    const result = outcome?.result;
    records.push({
      ...shared,
      run,
      response: result?.ok ? result.answer : null,
      usage: result?.ok ? result.usage : null,
      retries: outcome?.retries ?? 0,
      latency_ms: { ...latency, generation: deps.now() - t },
      error:
        thrown !== null
          ? { stage: "generacion", message: thrown }
          : result && !result.ok
            ? { stage: "generacion", message: `HTTP ${result.status}`, detail: result.detail }
            : null,
      timestamp: stamp(),
    });
  }
  return records;
}

// La línea base debe ser lo que corre en producción: si alguien cambia una constante del
// chat y no la configuración, la evaluación dejaría de medir el sistema real sin avisar.
export function assertBaselineMatchesProduction(config: Config) {
  if (config.config_id !== "E0") return;
  const expected = {
    retrieval: { threshold: SIM_THRESHOLD, max_chunks: MAX_CHUNKS, match_count: MAX_CHUNKS },
    generator: { ...GENERATOR },
    history: { max_history: MAX_HISTORY },
  };
  const actual = {
    retrieval: {
      threshold: config.retrieval.threshold,
      max_chunks: config.retrieval.max_chunks,
      match_count: config.retrieval.match_count,
    },
    generator: config.generator,
    history: config.history,
  };
  const sort = (value: object) => JSON.stringify(value, Object.keys(value).sort());
  for (const key of ["retrieval", "generator", "history"] as const) {
    if (sort(expected[key]) !== sort(actual[key])) {
      throw new Error(
        `La configuración E0 no coincide con producción en «${key}»: ` +
          `${JSON.stringify(actual[key])} frente a ${JSON.stringify(expected[key])}`
      );
    }
  }
}

function readJsonl(file: string, dataset: DatasetItem["dataset"]): DatasetItem[] {
  if (!existsSync(file)) {
    throw new Error(`No existe ${file}. Genera el conjunto con rag-eval/dataset/xlsx_to_jsonl.py.`);
  }
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => ({ ...(JSON.parse(line) as DatasetItem), dataset }));
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function packageVersion(name: string): string | null {
  try {
    const file = join(ROOT, "..", "node_modules", name, "package.json");
    return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
  } catch {
    return null;
  }
}

async function main() {
  const configPath = argument("--config");
  if (!configPath) throw new Error("Falta --config ruta/al/archivo.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as Config;
  assertBaselineMatchesProduction(config);

  const groqKey = process.env.GROQ_API_KEY;
  const generateResponses = !process.argv.includes("--no-generate");
  if (generateResponses && !groqKey) throw new Error("Falta GROQ_API_KEY");

  const which = argument("--dataset") ?? "ambos";
  const datasetDir = join(ROOT, "dataset");
  const files = [
    ...(which !== "bateria" ? (["conjunto"] as const) : []),
    ...(which !== "conjunto" ? (["bateria"] as const) : []),
  ];
  let items = files.flatMap((name) => readJsonl(join(datasetDir, `${name}.jsonl`), name));
  const datasetSha = Object.fromEntries(
    files.map((name) => [
      name,
      createHash("sha256").update(readFileSync(join(datasetDir, `${name}.jsonl`))).digest("hex"),
    ])
  );
  const onlyIds = argument("--ids")?.split(",");
  if (onlyIds) items = items.filter((item) => onlyIds.includes(item.id));
  const limit = argument("--limit");
  if (limit) items = items.slice(0, Number(limit));
  if (items.length === 0) throw new Error("No hay consultas que ejecutar.");

  const orgMap = loadOrgMap();
  const corpus = await computeCorpus(orgMap);
  const gitCommit = git("rev-parse", "HEAD");
  const dirty = git("status", "--porcelain", "--untracked-files=no") !== "";
  const startedAt = new Date();
  const runId = `${config.config_id}-${startedAt.toISOString().replace(/[-:]/g, "").slice(0, 15)}-${gitCommit.slice(0, 7)}`;

  const ctx: Context = {
    config,
    orgMap,
    ownerByDocument: new Map(corpus.documents.map((d) => [d.document_id, d.org_alias])),
    runId,
    gitCommit,
    corpusHash: corpus.corpus_hash,
    indexHash: corpus.index_hash,
    generateResponses,
  };
  const deps: Deps = {
    embed: embedHF,
    retrieve,
    generate: (messages, params) => generate(messages, groqKey ?? "", params),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };

  const resultsDir = join(ROOT, "results");
  mkdirSync(resultsDir, { recursive: true });
  const output = join(resultsDir, `${runId}.jsonl`);
  let errors = 0;
  for (const [index, item] of items.entries()) {
    const records = await collectQuery(item, ctx, deps);
    for (const record of records) {
      appendFileSync(output, JSON.stringify(record) + "\n", "utf8");
      if (record.error) errors += 1;
    }
    console.log(`${index + 1}/${items.length} ${item.id}`);
  }

  writeFileSync(
    join(resultsDir, `${runId}.meta.json`),
    JSON.stringify(
      {
        run_id: runId,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        config,
        generate_responses: generateResponses,
        queries: items.length,
        records: items.length * config.repetitions,
        records_with_error: errors,
        dataset_sha256: datasetSha,
        git_commit: gitCommit,
        git_dirty: dirty,
        corpus_hash: corpus.corpus_hash,
        index_hash: corpus.index_hash,
        organizations: corpus.organizations,
        embedding: { model: EMBED_MODEL, dimensions: EMBED_DIM, max_input_chars: 512 },
        versions: {
          node: process.version,
          next: packageVersion("next"),
          "@supabase/supabase-js": packageVersion("@supabase/supabase-js"),
          tsx: packageVersion("tsx"),
        },
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(`\n${runId}: ${items.length} consultas, ${errors} registros con error`);
  console.log(`Resultados en ${output}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(message(error));
    process.exit(1);
  });
}
