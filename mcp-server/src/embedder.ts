// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const transformers: any = require("@huggingface/transformers");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _instance: any = null;
let _instancePromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getInstance(): Promise<any> {
  if (!_instance) {
    if (!_instancePromise) {
      _instancePromise = transformers.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    _instance = await _instancePromise;
  }
  return _instance;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getInstance();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Embed multiple texts in parallel with a concurrency cap.
 * The embedder shares a single ONNX model instance — concurrent calls beyond
 * the cap risk overwhelming the runtime and causing hangs.
 */
export async function embedBatch(texts: string[], concurrency = 4): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const vectors = await Promise.all(batch.map(t => embed(t)));
    results.push(...vectors);
  }
  return results;
}
