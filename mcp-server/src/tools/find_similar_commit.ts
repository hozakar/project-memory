import { embed } from "../embedder";
import { search } from "../db";
import type { CommitSearchResult } from "../types";

export async function findSimilarCommit(
  diffSnippet: string,
  topK: number = 5
): Promise<CommitSearchResult[]> {
  try {
    const vector = await embed(diffSnippet);
    const results = await search(vector, topK, "commit");
    return results.map((r) => {
      const parts = r.id.split("__commit__");
      const hash = parts[1] ?? "";
      return {
        hash,
        message: r.title,
        similarity: r.similarity,
      };
    });
  } catch (err) {
    console.error("find_similar_commit failed:", err);
    return [];
  }
}
