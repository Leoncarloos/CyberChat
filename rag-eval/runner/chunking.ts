// COPIA de la fragmentación de app/api/documents/upload-and-process/route.ts, para sembrar el
// corpus sintético con el mismo criterio que el endpoint de subida. La prueba chunking.test.ts
// falla si el original cambia y esta copia no se actualiza (npm run test:rag-eval).

// Sentence-aware chunking — no corta oraciones a la mitad.
// Una "oración" puede superar el límite (listas o tablas sin puntuación al extraer
// el PDF): se descompone en palabras para que el empaquetado la reparta entre
// fragmentos sin pasar de maxChars. Una palabra más larga que el límite se corta.
export function splitLongSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];
  return sentence.split(/\s+/).flatMap((word) => {
    const parts: string[] = [];
    for (let i = 0; i < word.length; i += maxChars) parts.push(word.slice(i, i + maxChars));
    return parts;
  });
}

export function chunkBySentences(text: string, maxChars = 800, overlapSentences = 1): string[] {
  const sentences = text
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const lengthOf = (parts: string[]) => parts.reduce((n, s) => n + s.length, 0) + Math.max(0, parts.length - 1);

  const chunks: string[] = [];
  let current: string[] = [];
  // Cuántas oraciones iniciales de `current` son solapamiento del fragmento anterior:
  // un fragmento que solo tuviera solapamiento duplicaría texto ya indexado.
  let overlapCount = 0;

  for (const sentence of sentences.flatMap((s) => splitLongSentence(s, maxChars))) {
    if (current.length > 0 && lengthOf([...current, sentence]) > maxChars) {
      if (current.length > overlapCount) chunks.push(current.join(" "));
      // El solapamiento se recorta hasta que quepa junto a la oración nueva; si no
      // cabe ninguna, el fragmento siguiente empieza sin solapamiento.
      let overlap = current.slice(-overlapSentences);
      while (overlap.length > 0 && lengthOf([...overlap, sentence]) > maxChars) overlap = overlap.slice(1);
      current = overlap;
      overlapCount = overlap.length;
    }
    current.push(sentence);
  }

  if (current.length > overlapCount) chunks.push(current.join(" "));

  return chunks.filter((c) => c.trim().length > 40);
}
