// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const transformers: any = require("@xenova/transformers");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _instance: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getInstance(): Promise<any> {
  if (!_instance) {
    _instance = await transformers.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return _instance;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getInstance();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}
