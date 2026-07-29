import { embed } from "../embedder";
import { search } from "../db";
import type { SearchResult } from "../types";

/**
 * Options for {@link searchMemory}.
 *
 * This is an options object rather than a positional list on purpose. The previous
 * positional signature carried thirteen parameters, most of them optional, so call
 * sites degenerated into long `undefined, undefined, …` chains. Removing a parameter
 * then silently rebound every later argument — a scope filter arriving as an outcome
 * filter returns wrong results instead of throwing. Named fields make that impossible.
 *
 * NOTE: `phase` and `era` rows are legacy read-only. No tool can index them any more,
 * but historical entries stay searchable via `typeFilter`.
 */
export interface SearchMemoryOptions {
  query: string;
  topK?: number;
  includeCommits?: boolean;
  createdByEmail?: string;
  createdByName?: string;
  typeFilter?: string;
  touchesFilter?: string[];
  tagsFilter?: string[];
  scopeFilter?: string[];
  outcomeTypeFilter?: string;
  diversify?: boolean;
  includeSuperseded?: boolean;
  /** Caller identity email — required for note privacy enforcement. Only used when typeFilter === "note". */
  callerEmail?: string;
}

export async function searchMemory(opts: SearchMemoryOptions): Promise<SearchResult[]> {
  const {
    query,
    topK = 8,
    includeCommits = false,
    createdByEmail,
    createdByName,
    typeFilter,
    touchesFilter,
    tagsFilter,
    scopeFilter,
    outcomeTypeFilter,
    diversify,
    includeSuperseded = false,
    callerEmail,
  } = opts;

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
    return await search({
      vector,
      topK,
      typeFilter,
      excludeCommits: !includeCommits,
      createdByEmail: effectiveCreatedByEmail,
      createdByName,
      touchesFilter,
      tagsFilter,
      scopeFilter,
      outcomeTypeFilter,
      diversify,
      includeSuperseded,
    });
  } catch (err) {
    console.error("search_memory failed:", err);
    return [];
  }
}
