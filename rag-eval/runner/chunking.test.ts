import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ORGANIZATIONS, assertDevelopmentTarget } from "./seedCorpus";
import { chunkBySentences } from "./chunking";

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p: string) => readFileSync(root(p), "utf8").replace(/\r\n/g, "\n");

const functionsOf = (source: string) => {
  const start = source.indexOf("function splitLongSentence");
  const end = source.indexOf("function getExt");
  return source.slice(start, end).replace(/^export /gm, "").trim();
};

describe("fragmentación del sembrado", () => {
  it("es idéntica a la del endpoint de subida", () => {
    const route = functionsOf(read("app/api/documents/upload-and-process/route.ts"));
    const copy = functionsOf(read("rag-eval/runner/chunking.ts"));
    expect(copy).toBe(route);
  });

  it("ningún fragmento del corpus supera los 800 caracteres", () => {
    for (const alias of Object.keys(ORGANIZATIONS)) {
      const dir = `rag-eval/corpus/${alias}`;
      for (const file of readdirSync(root(dir))) {
        const chunks = chunkBySentences(read(`${dir}/${file}`).trim());
        expect(chunks.length, `${alias}/${file}`).toBeGreaterThan(0);
        for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(800);
      }
    }
  });

  it("cada organización tiene un documento por cada uno de los 8 temas", () => {
    for (const alias of Object.keys(ORGANIZATIONS)) {
      const files = readdirSync(root(`rag-eval/corpus/${alias}`)).sort();
      expect(files.map((f) => f.replace(/^\d+_|\.txt$/g, ""))).toEqual([
        "phishing", "ia_amenazas", "canales_venta", "contrasenas",
        "accesos", "ley_29733", "datos_sensibles", "resiliencia",
      ]);
    }
  });
});

describe("protección contra sembrar en producción", () => {
  const prod = "wyzzrjeeuwjiqzseclob";
  it("acepta una rama de desarrollo", () => {
    expect(() => assertDevelopmentTarget("https://abcdefghij.supabase.co", "abcdefghij")).not.toThrow();
  });
  it.each([
    ["URL de producción", `https://${prod}.supabase.co`, prod],
    ["ref de producción con otra URL", "https://abcdefghij.supabase.co", prod],
    ["URL de producción con ref de desarrollo declarado", `https://${prod}.supabase.co`, "abcdefghij"],
    ["ref que no coincide con la URL", "https://abcdefghij.supabase.co", "zzzzzzzzzz"],
    ["sin ref declarado", "https://abcdefghij.supabase.co", undefined],
    ["sin URL", undefined, "abcdefghij"],
  ])("rechaza: %s", (_n, url, ref) => {
    expect(() => assertDevelopmentTarget(url, ref)).toThrow();
  });
});
