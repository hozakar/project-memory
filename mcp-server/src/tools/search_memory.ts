import { embed } from "../embedder";
import { search } from "../db";
import type { SearchResult } from "../types";

export async function searchMemory(
  query: string,
  topK: number = 8,
  include_commits: boolean = false,
  createdByEmail?: string,
  typeFilter?: string,
  touchesFilter?: string[],
  tagsFilter?: string[],
  assignedToEmail?: string,
  assignedByEmail?: string,
  scopeFilter?: string[]
): Promise<SearchResult[]> {
  try {
    const vector = await embed(query);
    const results = await search(vector, topK, typeFilter, !include_commits, createdByEmail, touchesFilter, tagsFilter, assignedToEmail, assignedByEmail, scopeFilter);
    return results;
  } catch {
    return [];
  }
}