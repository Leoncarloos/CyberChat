import { Tokenizer } from "@huggingface/tokenizers";

export const INDEX_VERSION = "token-sections-v2";
export const EMBEDDING_TOKEN_LIMIT = 120;
let tokenizerPromise: Promise<Tokenizer> | undefined;

async function loadTokenizer() {
  const base = "https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main";
  const files = await Promise.all(["tokenizer.json", "tokenizer_config.json"].map(async (file) => {
    const response = await fetch(`${base}/${file}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`No se pudo cargar ${file}: HTTP ${response.status}`);
    return response.json();
  }));
  return new Tokenizer(files[0], files[1]);
}

export function getTokenizer() {
  tokenizerPromise ??= loadTokenizer().catch((error) => { tokenizerPromise = undefined; throw error; });
  return tokenizerPromise;
}

export async function tokenCount(text: string): Promise<number> {
  const tokenizer = await getTokenizer();
  return tokenizer.encode(text, { add_special_tokens: true }).ids.length;
}

export async function extractDocumentText(name: string, buffer: Buffer): Promise<string> {
  const extension = name.split(".").pop()?.toLowerCase();
  let text: string;
  if (extension === "txt") text = new TextDecoder("utf-8").decode(buffer);
  else if (extension === "docx") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (extension === "pdf") {
    const mod = await import("pdf-extraction");
    text = (await mod.default(buffer)).text;
  } else throw new Error("Formato no soportado. Usa PDF, DOCX o TXT.");
  return String(text).replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export async function chunkDocument(text: string, name: string): Promise<string[]> {
  const tokenizer = await getTokenizer();
  const count = (value: string) => tokenizer.encode(value, { add_special_tokens: true }).ids.length;
  const shorten = (value: string, limit: number) => {
    const words = value.split(/\s+/);
    while (words.length && count(words.join(" ")) > limit) words.pop();
    return words.join(" ");
  };
  const title = shorten(name, 20);
  let section = "";
  let parts: string[] = [];
  let overlapOnly = false;
  const chunks: string[] = [];
  const prefix = () => `Documento: ${title}${section ? `\nSeccion: ${section}` : ""}\n`;
  const flush = () => {
    if (parts.length && !overlapOnly) chunks.push(prefix() + parts.join("\n"));
    parts = [];
    overlapOnly = false;
  };
  for (const line of text.split(/\n+/).map((line) => line.trim()).filter(Boolean)) {
    if (/^#{1,6}\s/.test(line)) {
      flush();
      section = shorten(line.replace(/^#+\s*/, ""), 25);
      continue;
    }
    for (const unit of line.split(/(?<=[.!?])\s+(?=[A-Z\u00c0-\u00dd])/)) {
      let piece = "";
      const pieces: string[] = [];
      for (const word of unit.split(/\s+/)) {
        if (count(prefix() + word) > EMBEDDING_TOKEN_LIMIT) {
          throw new Error("Palabra demasiado larga para indexar sin truncamiento.");
        }
        if (piece && count(prefix() + piece + " " + word) > EMBEDDING_TOKEN_LIMIT) {
          pieces.push(piece); piece = "";
        }
        piece = piece ? piece + " " + word : word;
      }
      if (piece) pieces.push(piece);
      for (const item of pieces) {
        if (parts.length && count(prefix() + [...parts, item].join("\n")) > EMBEDDING_TOKEN_LIMIT) {
          const previous = parts[parts.length - 1];
          flush();
          if (count(previous) <= 24 && count(prefix() + previous + "\n" + item) <= EMBEDDING_TOKEN_LIMIT) {
            parts = [previous]; overlapOnly = true;
          }
        }
        parts.push(item); overlapOnly = false;
      }
    }
  }
  flush();
  return [...new Set(chunks)];
}
