import { embed } from "../embedder";
import { search } from "../db";
import type { SearchResult } from "../types";

export async function searchMemory(
  query: string,
  topK: number = 8,
  include_commits: boolean = false,
  createdByEmail?: string,
  createdByName?: string,
  typeFilter?: string,
  touchesFilter?: string[],
  tagsFilter?: string[],
  assignedToEmail?: string,
  assignedByEmail?: string,
  scopeFilter?: string[],
  outcomeTypeFilter?: string,
  diversify?: boolean,
  include_superseded: boolean = false,
  /**
   * NOTE: Phase rows are legacy read-only. No new phases can be indexed via this
   * surface. Historical type:phase entries in the vector DB continue to be
   * returned for backward-compatible search results.
   */
  /** Caller identity email — required for note privacy enforcement. Only used when typeFilter === "note". */
  callerEmail?: string
): Promise<SearchResult[]> {
  try {
    // Notes are user-scoped (private). They are excluded from all broad searches
    // at the database level (db.ts). Only returned when type_filter is explicitly "note".
    // When searching notes, auto-apply the caller's email if no explicit filter is set
    // to ensure only the owner's notes are returned.
    let effectiveCreatedByEmail = createdByEmail;
    if (typeFilter === "note" && !effectiveCreatedByEmail && callerEmail) {
      effectiveCreatedByEmail = callerEmail;
    }

    const vector = await embed(query);
    const results = await search(vector, topK, typeFilter, !include_commits, effectiveCreatedByEmail, createdByName, touchesFilter, tagsFilter, assignedToEmail, assignedByEmail, scopeFilter, outcomeTypeFilter, diversify, include_superseded);
    return results;
  } catch {
    return [];
  }
}