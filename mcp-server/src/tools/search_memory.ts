import { embed } from "../embedder";
import { search } from "../db";
import type { SearchResult } from "../types";

export async function searchMemory(query: string, topK: number = 8): Promise<SearchResult[]> {
  try {
    const vector = await embed(query);
    const results = await search(vector, topK);
    return results;
  } catch {
    return [];
  }
}