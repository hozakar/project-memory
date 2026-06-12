# Phase Directory Naming Convention

Date: 2026-06-11
Status: Accepted

## Context and Problem Statement

Phase directories and phase IDs used two different formats for the same logical identifier:

- Directory: `2026-06-09-init-agents-md-branch-fallback/`
- Phase ID in YAML: `phase-20260609-init-agents-md-branch-fallback`

Build agents and humans consistently created directories in the wrong format because the two formats look similar but differ in date punctuation and prefix. Unification was needed.

## Considered Options

- Option A: Keep status quo (directories `YYYY-MM-DD-slug`, IDs `phase-YYYYMMDD-slug`)
- Option B: Unify on `YYYY-MM-DD-slug` for both (drop the prefix, keep dashed dates)

## Decision Outcome

Chosen option: "Unify on `phase-YYYYMMDD-slug` for both directories and IDs", because the ID format was already established and correct — changing only directory names is the smaller change, and it eliminates the two-format confusion entirely.

### Positive Consequences

- Zero ambiguity: agents and humans see one format everywhere
- Directory name and phase ID are identical (minus the trailing `/`)
- `phase-` prefix makes phase directories visually distinct in file listings

### Negative Consequences

- Date readability slightly reduced for humans (`20260611` vs `2026-06-11`), mitigated by the `created_at: YYYY-MM-DD` field in `phase.yml`

## Pros and Cons of the Options

### Option A — Status quo (two formats)

- Good: no migration needed
- Bad: two formats differing only in punctuation and prefix is the root cause of persistent naming errors; the confusion is inherent, not incidental

### Option B — Unify on `YYYY-MM-DD-slug`

- Good: more human-readable dates in directory names
- Bad: requires renaming all `id` fields in every `phase.yml` and `index.yml`; loses the `phase-` prefix that makes directories self-documenting
