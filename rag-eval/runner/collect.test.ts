// Pruebas del recolector con dependencias simuladas: no hace llamadas de red.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildMessages, filterCandidates, type RpcMatch } from "@/lib/ragPipeline";
import {
  assertBaselineMatchesProduction,
  collectQuery,
  type Config,
  type Context,
  type DatasetItem,
  type Deps,
} from "./collect";

const baseline = JSON.parse(
  readFileSync(fileURLToPath(new URL("../configs/baseline.json", import.meta.url)), "utf8")
) as Config;

const candidatos: RpcMatch[] = Array.from({ length: 20 }, (_, i) => ({
  id: `chunk-${i}`,
  document_id: i % 2 === 0 ? "doc-a" : "doc-b",
  similarity: 0.8 - i * 0.03,
  content: `Fragmento ${i} ${"texto ".repeat(30)}`,
}));

const item: DatasetItem = {
  id: "Q01",
  dataset: "conjunto",
  tipo: "documental",
  tema_clave: "phishing",
  org_alias: "ORG-A",
  user_input: "¿Cómo reporto un correo sospechoso?",
  reference: "Se reporta al canal de seguridad.",
  expected_evidence: "Política de correo",
};

const ctx = (cambios: Partial<Context> = {}): Context => ({
  config: baseline,
  orgMap: { "ORG-A": "admin-a", "ORG-B": "admin-b" },
  ownerByDocument: new Map([["doc-a", "ORG-A"]]),
  runId: "E0-prueba",
  gitCommit: "abc1234",
  corpusHash: "corpus",
  indexHash: "index",
  generateResponses: true,
  ...cambios,
});

function deps(cambios: Partial<Deps> = {}) {
  const llamadas = { embed: [] as string[], retrieve: [] as unknown[], generate: 0, sleep: [] as number[] };
  let reloj = 1_700_000_000_000;
  const d: Deps = {
    embed: async (text) => {
      llamadas.embed.push(text);
      return [0.1, 0.2];
    },
    retrieve: async (params) => {
      llamadas.retrieve.push(params);
      return { matches: candidatos.slice(0, params.matchCount), error: null };
    },
    generate: async () => {
      llamadas.generate += 1;
      return { ok: true, answer: `Respuesta ${llamadas.generate}`, usage: { total_tokens: 50 } };
    },
    now: () => (reloj += 10),
    sleep: async (ms) => {
      llamadas.sleep.push(ms);
    },
    ...cambios,
  };
  return { d, llamadas };
}

describe("collectQuery", () => {
  it("guarda tres repeticiones con la recuperación compartida", async () => {
    const { d, llamadas } = deps();
    const registros = await collectQuery(item, ctx(), d);

    expect(registros.map((r) => r.run)).toEqual([1, 2, 3]);
    expect(registros.map((r) => r.response)).toEqual(["Respuesta 1", "Respuesta 2", "Respuesta 3"]);
    expect(llamadas.embed).toEqual([item.user_input]);
    expect(llamadas.retrieve).toEqual([
      { queryEmbedding: [0.1, 0.2], scopeUserId: "admin-a", matchCount: 5 },
      { queryEmbedding: [0.1, 0.2], scopeUserId: "admin-a", matchCount: 20 },
    ]);

    const [r] = registros;
    const top = filterCandidates(candidatos.slice(0, 5));
    expect(r.candidates_raw).toHaveLength(20);
    expect(r.candidates_raw[1]).toMatchObject({ rank: 2, chunk_id: "chunk-1", owner_alias: "FUERA" });
    expect(r.retrieved_contexts.map((c) => c.chunk_id)).toEqual(top.map((c) => c.id));
    expect(r.retrieved_contexts[0]).toMatchObject({ rank: 1, owner_alias: "ORG-A" });
    expect(r.retrieved_contexts[0].content).toBe(candidatos[0].content);
    expect(r.messages).toEqual(buildMessages([{ role: "user", content: item.user_input }], top));
    expect(r).toMatchObject({
      query_id: "Q01",
      config_id: "E0",
      org_alias: "ORG-A",
      used_context: true,
      matches_count: top.length,
      best_similarity: 0.8,
      top_matches_candidates: true,
      reference: item.reference,
      git_commit: "abc1234",
      corpus_hash: "corpus",
      error: null,
      usage: { total_tokens: 50 },
    });
    expect(r.latency_ms).toEqual({ embedding: 10, search: 10, search_candidates: 10, generation: 10 });
    expect(r.generator).toEqual(baseline.generator);
  });

  it("usa el historial en el prompt y solo la última pregunta para buscar", async () => {
    const { d, llamadas } = deps();
    const seguimiento: DatasetItem = {
      ...item,
      tipo: "seguimiento",
      user_input: "¿Y en ese caso?",
      history: [
        { role: "user", content: "¿Qué es el phishing?" },
        { role: "assistant", content: "Un engaño por correo." },
      ],
    };
    const [r] = await collectQuery(seguimiento, ctx(), d);

    expect(llamadas.embed).toEqual(["¿Y en ese caso?"]);
    expect(r.messages.slice(1).map((m) => m.content)).toEqual([
      "¿Qué es el phishing?",
      "Un engaño por correo.",
      "¿Y en ese caso?",
    ]);
    expect(r.history).toEqual(seguimiento.history);
  });

  it("marca sin contexto cuando nada supera el umbral", async () => {
    const { d } = deps({
      retrieve: async (params) => ({
        matches: candidatos.slice(0, params.matchCount).map((c) => ({ ...c, similarity: 0.2 })),
        error: null,
      }),
    });
    const [r] = await collectQuery(item, ctx(), d);

    expect(r).toMatchObject({ used_context: false, matches_count: 0, best_similarity: 0 });
    expect(r.retrieved_contexts).toEqual([]);
    expect(r.candidates_raw).toHaveLength(20);
    expect(r.messages[0].content).toContain("### SIN CONTEXTO DOCUMENTAL");
  });

  it("detecta que la búsqueda ampliada no coincide con la de producción", async () => {
    const { d } = deps({
      retrieve: async (params) => ({
        matches: params.matchCount === 5 ? candidatos.slice(0, 5) : candidatos.slice(1, 21),
        error: null,
      }),
    });
    const [r] = await collectQuery(item, ctx(), d);
    expect(r.top_matches_candidates).toBe(false);
  });

  it.each([
    ["embedding", { embed: async () => Promise.reject(new Error("HF caído")) }, "HF caído"],
    [
      "recuperacion",
      { retrieve: async () => ({ matches: [], error: "function not found" }) },
      "function not found",
    ],
    ["recuperacion", { retrieve: async () => ({ matches: [], error: "" }) }, ""],
  ] as Array<[string, Partial<Deps>, string]>)(
    "registra el fallo de %s en vez de descartar la consulta",
    async (etapa, cambios, mensaje) => {
      const { d, llamadas } = deps(cambios);
      const registros = await collectQuery(item, ctx(), d);

      expect(registros).toHaveLength(3);
      for (const r of registros) {
        expect(r.error).toEqual({ stage: etapa, message: mensaje });
        expect(r.response).toBeNull();
        expect(r.query_id).toBe("Q01");
      }
      expect(llamadas.generate).toBe(0);
    }
  );

  it("registra el fallo del generador y conserva lo recuperado", async () => {
    const { d } = deps({
      generate: async () => ({ ok: false, status: 500, detail: { message: "interno" } }),
    });
    const registros = await collectQuery(item, ctx(), d);

    expect(registros).toHaveLength(3);
    expect(registros[0].error).toEqual({
      stage: "generacion",
      message: "HTTP 500",
      detail: { message: "interno" },
    });
    expect(registros[0].response).toBeNull();
    expect(registros[0].retrieved_contexts.length).toBeGreaterThan(0);
  });

  it("registra una excepción del generador", async () => {
    const { d } = deps({ generate: async () => Promise.reject(new Error("sin red")) });
    const [r] = await collectQuery(item, ctx(), d);
    expect(r.error).toEqual({ stage: "generacion", message: "sin red" });
  });

  it("reintenta un 429 respetando la espera indicada", async () => {
    let n = 0;
    const { d, llamadas } = deps({
      generate: async () => {
        n += 1;
        return n === 1
          ? { ok: false, status: 429, detail: { message: "Please try again in 7.2s." } }
          : { ok: true, answer: "ok", usage: null };
      },
    });
    const registros = await collectQuery(item, ctx(), d);

    expect(registros[0]).toMatchObject({ response: "ok", retries: 1, error: null });
    expect(registros[1].retries).toBe(0);
    expect(llamadas.sleep).toEqual([7700]);
  });

  it("deja de reintentar y registra el 429", async () => {
    const { d, llamadas } = deps({
      generate: async () => ({ ok: false, status: 429, detail: "límite" }),
    });
    const config = { ...baseline, repetitions: 1 };
    const [r] = await collectQuery(item, ctx({ config }), d);

    expect(r.retries).toBe(5);
    expect(r.error).toMatchObject({ stage: "generacion", message: "HTTP 429" });
    expect(llamadas.sleep).toEqual([2000, 4000, 8000, 16000, 32000]);
  });

  it("registra una organización sin administrador en el mapeo", async () => {
    const { d, llamadas } = deps();
    const registros = await collectQuery({ ...item, org_alias: "ORG-Z" }, ctx(), d);

    expect(registros).toHaveLength(3);
    expect(registros[0].error).toEqual({
      stage: "configuracion",
      message: "No hay administrador para ORG-Z",
    });
    expect(llamadas.embed).toEqual([]);
  });

  it("con --no-generate recupera sin llamar al generador", async () => {
    const { d, llamadas } = deps();
    const registros = await collectQuery(item, ctx({ generateResponses: false }), d);

    expect(llamadas.generate).toBe(0);
    expect(registros).toHaveLength(3);
    expect(registros[0]).toMatchObject({ response: null, error: null, used_context: true });
    expect(registros[0].latency_ms.generation).toBeNull();
  });
});

describe("reescritura de la consulta (E2)", () => {
  const seguimiento: DatasetItem = {
    ...item,
    tipo: "seguimiento",
    user_input: "¿Y en ese caso?",
    history: [
      { role: "user", content: "¿Qué es el phishing?" },
      { role: "assistant", content: "Un engaño por correo." },
    ],
  };
  const e2: Config = {
    ...baseline,
    config_id: "E2",
    repetitions: 1,
    retrieval: {
      ...baseline.retrieval,
      rewrite_query: { enabled: true, params: { ...baseline.generator, temperature: 0, max_tokens: 400 } },
    },
  };

  it("busca con la pregunta reescrita y deja la conversación original para el generador", async () => {
    const pedidos: string[][] = [];
    const { d, llamadas } = deps({
      generate: async (messages) => {
        pedidos.push(messages.map((m) => m.content));
        return { ok: true, answer: "¿Qué hago si ya hice clic en el enlace de phishing?", usage: null };
      },
    });
    const [r] = await collectQuery(seguimiento, ctx({ config: e2 }), d);
    expect(llamadas.embed).toEqual(["¿Qué hago si ya hice clic en el enlace de phishing?"]);
    expect(r.rewritten_query).toBe("¿Qué hago si ya hice clic en el enlace de phishing?");
    expect(r.messages.at(-1)?.content).toBe("¿Y en ese caso?");
    expect(pedidos[0][1]).toContain("Última pregunta: ¿Y en ese caso?");
  });

  it("no reescribe una pregunta sin historial", async () => {
    const { d, llamadas } = deps();
    const [r] = await collectQuery(item, ctx({ config: e2 }), d);
    expect(llamadas.embed).toEqual([item.user_input]);
    expect(r.rewritten_query).toBeNull();
  });

  it("si la reescritura falla busca con la pregunta original y lo anota", async () => {
    let n = 0;
    const { d, llamadas } = deps({
      generate: async () => {
        n += 1;
        return n === 1 ? { ok: false, status: 400, detail: "x" } : { ok: true, answer: "ok", usage: null };
      },
    });
    const [r] = await collectQuery(seguimiento, ctx({ config: e2 }), d);
    expect(llamadas.embed).toEqual(["¿Y en ese caso?"]);
    expect(r.rewritten_query).toBeNull();
    expect(r.rewrite_error).toBe("HTTP 400");
    expect(r.response).toBe("ok");
  });
});

describe("configuración de la línea base", () => {
  it("coincide con las constantes de producción", () => {
    expect(() => assertBaselineMatchesProduction(baseline)).not.toThrow();
  });

  it.each([
    ["umbral", { retrieval: { ...baseline.retrieval, threshold: 0.3 } }],
    ["k", { retrieval: { ...baseline.retrieval, max_chunks: 10 } }],
    ["temperatura", { generator: { ...baseline.generator, temperature: 0 } }],
    ["historial", { history: { max_history: 6 } }],
  ] as Array<[string, Partial<Config>]>)("rechaza un E0 con otro valor de %s", (_n, cambios) => {
    expect(() => assertBaselineMatchesProduction({ ...baseline, ...cambios })).toThrow(/E0/);
  });

  it("no restringe las demás configuraciones", () => {
    const e1 = { ...baseline, config_id: "E1", retrieval: { ...baseline.retrieval, threshold: 0.2 } };
    expect(() => assertBaselineMatchesProduction(e1)).not.toThrow();
  });
});
