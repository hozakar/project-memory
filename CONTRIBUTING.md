# Contributing

Thank you for considering contributing to project-memory. This document covers
the practical guidelines for making changes.

project-memory is a skill for agentic coding AI assistants. It has two
contribution surfaces that differ in language, tooling, and verification
requirements.

---

## Contribution surfaces

### Skill markdown (root-level `.md` files)

The skill consists of markdown instruction files read by an LLM agent. These
live at the repository root and in `standard/`, `minimal/`, `conventions/`, and
`templates/`. Changes here remodel the agent's behavior — its prompts, gates,
audit rules, conventions, and record schemas.

Changes to the markdown surface do not require any build step or test run, but
automatic drift detection (the audit pipeline) will flag inconsistencies such as
missing index entries, stale cross-references, and orphaned records.

### MCP server (`mcp-server/`)

The companion MCP server is a TypeScript project under `mcp-server/`. It
provides deterministic semantic search, drift audit execution, and vector DB
management. Changes here affect tool availability at runtime.

The dev loop for the MCP server:

```sh
cd mcp-server/
npm ci           # clean install dependencies
npm run build    # compile TypeScript
npm run lint     # ESLint check
npm run typecheck
npm test         # unit + integration tests
```

---

## Language policy

Every skill file — all `.md` files that form the skill — must be written
entirely in English. This includes prose, headings, comments, identifiers, and
example strings. This applies to every file under root, `standard/`,
`minimal/`, `conventions/`, `templates/`, and the MCP server's own
documentation. The goal is to keep the skill consumable by the widest possible
audience without language barriers.

---

## Testing policy

**Zero tolerance.** When a commit touches any file under `mcp-server/`, the
entire MCP server test suite must pass:

```sh
cd mcp-server/ && npm test
```

This runs both unit tests (`vitest.unit.config.ts`) and integration tests
(`vitest.integration.config.ts`). There is no "pre-existing failure" exception
— if the suite is red, the commit must fix every failure before it can land.

Changes to the markdown surface do not require a test run, but the reviewer may
ask you to verify that no drift audit category is regressing.

---

## Doc coupling

The skill's behavior is split across several files that must stay in sync:

- `SKILL.md` — the on-load instructions that bootstrap everything
- `profiles.md` — the tier matrix and what each profile enables
- `conventions/` — how records, decisions, and discussions work
- `templates/` — the frontmatter schemas that records must follow

A change that modifies a record schema, convention, or profile behavior must
update **all** of the above in the same commit. No single file change counts as
a complete fix when the coupling chain is involved. The drift audit will flag
missed cross-references.

---

## Profiles

project-memory supports two profiles (`standard` and `minimal`) that differ in
ceremony — what the skill does automatically vs. what the user triggers
explicitly. A change that alters shared behavior (something both profiles can
do) must account for both profiles:

- If the new behavior is profile-bound, declare which profile it applies to and
  update the tier matrix in `profiles.md`.
- If the new behavior applies to both, verify that neither profile's loading
  path or feature set is broken by the change.
- Features the user triggers explicitly (discussions, issues, assignments,
  instructions, ADR) are available in all profiles regardless — a change to any
  of these must work in both profiles.

---

## Changelog

Every user-visible change gets an entry in `CHANGELOG.md`. Use the existing
format (see `## Unreleased` at the top of the file). If the change is a fix or
improvement to an unreleased feature, update or consolidate rather than adding a
duplicate entry.

---

## Branching and commits

- Create a feature branch from `main` for your work.
- Use descriptive commit messages. A good format:
  `area: brief description` (e.g. `audit: fix Cat 9 drift detection`).
- Keep commits focused. A commit should represent one logical change.
- `.project-memory/` directories are gitignored here — they hold a project's
  own working memory, not skill code. Never force-add one to a commit.

## Pull requests

- Open a pull request against `main`.
- If your change touches `mcp-server/`, CI must pass (tests + lint + build).
- For markdown-only changes, a reviewer will verify doc coupling and profile
  consistency manually.
- Mark the PR with a descriptive title and reference any relevant discussion or
  decision record if one exists.
