import { pipeline } from "@xenova/transformers";

type FeatureExtractionPipeline = Awaited<ReturnType<typeof pipeline>>;

let _instance: FeatureExtractionPipeline | null = null;

async function getInstance(): Promise<FeatureExtractionPipeline> {
  if (!_instance) {
    _instance = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return _instance;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getInstance();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}