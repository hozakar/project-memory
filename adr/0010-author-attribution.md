# ADR 0010 — Author Attribution for Project-Memory Records

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

Project-memory records (phases, decisions, discussions, issues) are anonymous. In multi-developer projects the user needs to know who created and who contributed to each record. Git history is unreliable (rebase / squash drops hashes; orchestration commits hide the actual author) and conflates "started" with "touched later".

## Considered Options

1. **`belongs_to` single free-text field** — RFC 5322 string. Rejected: "belongs_to" implies ownership; free-text breaks programmatic filtering; single value loses contributor history.
2. **Derive from git commit history** — no frontmatter. Rejected: rebase / squash drops trail; orchestrator-only commits hide real author.
3. **MCP-driven capture** — server injects identity. Rejected: couples attribution to MCP being installed; skill must work file-only.
4. **Hard-fail on missing git identity** — block writes until configured. Rejected: introduces friction; user opted against escalation.
5. **Backfill historical records with sole known author** — set all to Hakan. Rejected: contradicts the soft-fail principle; pre-rule records have no authoritative source.
6. **Structured `created_by` + `contributors` with LLM-driven capture and soft-fail** — chosen.

## Decision Outcome

**Option 6 is chosen.** Add structured `created_by` and `contributors` frontmatter to phase / decision / discussion / issue records. LLM reads `git config user.name` + `user.email` at every status-changing write. Missing values fall back to `{name: "unknown", email: "unknown"}` silently. `contributors` grows only on status-changing writes, dedup by email. ADR files excluded (MADR has no Author). Eras / summaries / index files excluded. Backfill existing records with `unknown`.

### Positive Consequences
- Multi-author attribution without dependency on git history.
- Programmatic filtering possible (future search_memory author filter, contributors tool).
- Zero friction during trial / install (unknown is valid).
- Index files unchanged — session-start token cost stable.

### Negative Consequences
- Each record file grows by ~5-8 frontmatter lines.
- MCP DB rebuild required at deployment (one-time).
- LLM runs two `git config` commands per status-changing write (negligible).
