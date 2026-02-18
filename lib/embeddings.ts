import { pipeline } from "@xenova/transformers";

let extractor: any;

async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractor;
}

// Devuelve vector de 384 dims
export async function embedText(text: string): Promise<number[]> {
  const ext = await getExtractor();
  const output = await ext(text, { pooling: "mean", normalize: true });
  // output.data es Float32Array
  return Array.from(output.data as Float32Array);
}
