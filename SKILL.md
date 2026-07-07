---
name: project-memory
version: 0.1.1
description: Project memory system. Loads at every session start to provide engineering context → history, decisions, active tensions, anti-patterns. Use when planning, implementing, or reviewing. Always active in this project.
---

# On Load

When this skill activates:

1. Output exactly this line:
   🧠 PROJECT MEMORY LOADED

2. **Determine active profile.**
   - **DO NOT use glob or directory listing to detect project memory.** Read `.project-memory/config.yml` directly using the Read tool. Do not infer existence from search results or file listings — they can miss hidden directories.
   - If the Read succeeds → parse the `profile` field. Route to `standard` or `minimal` accordingly. **Backward compatibility:** `profile: full` and `profile: lite` from legacy configs are treated as `profile: standard` at read time — route to `standard/`. If the `profile` field is absent (legacy project), treat as `standard` and offer the user a one-time non-blocking profile choice after on-load completes.
   - If the Read fails (file not found) → first-run (see step 3).

3. **First-run init UX (only when `.project-memory/` does not exist):**

   Ask the user:
   ```
   How do you want to run project-memory in this project?
     1) standard — lean ceremony, 2 summaries, 10-category audit, for most projects
     2) minimal  — single MEMORY.md file, for short or throwaway work

   Things to consider:
     • Will the project last 3+ months?
     • Will more than one person contribute?
     • Are "why did we do X?" architectural questions likely to come up?

   You can change this choice later — just say so.
   ```
   Default cursor: `standard`. After the user picks:
   - `standard` → read `standard/init.md` and follow it.
   - `minimal` → read `minimal/minimal.md` and follow it.

   Each init writes `config.yml` (or `MEMORY.md` for minimal) with `profile` and seeds `profile_history` with `{profile, effective_date: today, reason: initial}`.

4. **Steady-state on-load** (profile known, project memory exists):
   - `profile=standard` → read `standard/protocol.md` for the Memory Loading Strategy and follow it. Then proceed to step 5.
   - `profile=minimal` → follow `minimal/minimal.md` instead — it covers loading, the single gate, and record-append behavior.

5. **Post-first-response drift audit** (standard only) — the drift audit is deferred to after the LLM answers the user's first message. After the first user-facing response is delivered, run the drift audit (10 categories) via `audit.md` and emit the drift report as a follow-up block. Exceptions (audit runs synchronously): (a) explicit invocation via `Skill project-memory audit` or natural-language audit trigger per `DECISION-2026-06-17-audit-implicit-triggers`; (b) the first user message is itself an audit-implicit/explicit trigger — run audit synchronously to answer correctly; (c) `minimal` profile — no audit at all, no deferral applies.

6. Continue with the session. Do not ask the user for anything beyond the init UX (step 3) at this stage.

---

# Arguments

## audit

`Skill project-memory audit`, or natural-language phrasings that clearly request an audit / drift review of project memory (e.g. "let's audit", "run a drift check", "review project memory"), enters **Interactive Audit Mode**: read `audit.md` → Interactive Mode (which routes to the profile's audit file). Prompt user per finding; re-run detection; loop until clean.

In `minimal` profile this argument (and natural-language triggers) is a no-op — minimal has no audit. Print a one-line notice and exit.

**Implicit triggers:** Lenient detection of audit / drift-review intent. The user may phrase the request in any language; recognize the intent, not the keywords. When phrasing is genuinely ambiguous (e.g. "let's review what we have" with no project-memory cue), ask a one-line clarification *"Did you mean run the project-memory drift audit?"* before triggering. Governing rule: `DECISION-2026-06-17-audit-implicit-triggers`.

## discuss

`Skill project-memory discuss`, or natural-language phrasings that clearly request a planning / brainstorming conversation (e.g. "let's discuss", "let's brainstorm", "let's talk this through"), enters **Discussion Mode**: read `conventions/discussions.md` for the full lifecycle (shared across profiles). Load `discussions/index.md` for prior context. At close, apply relevancy scoring gate. If saving: write DISCUSSION file, update index.

Discussions are a user-triggered feature — available in all profiles. In `minimal`, discussion files go to `.project-memory/discussions/` even though no other `.project-memory/` infrastructure exists; the directory is created on first use.

**Implicit triggers:** Lenient detection of planning / brainstorming intent. The user may phrase the request in any language; recognize the intent, not the keywords.

**Resume:** "continue this discussion" → load existing DISCUSSION file, UPDATE it at close.

## change profile

When the user says "switch project-memory to <standard|minimal>" or similar phrasing ("change profile to X", "switch to standard", etc.):

1. Read current `config.yml` (or detect `MEMORY.md` for minimal).
2. Append a new entry to `profile_history`: `{profile: <new>, effective_date: today, reason: <user's stated motivation or "user request">}`.
3. Update top-level `profile` field.
4. For `standard → minimal`:
   - **Validation (non-blocking):** Read `summaries/roadmap.md` — if no `### Short-term` or `### Later` sections exist, warn: `"summaries/roadmap.md appears empty — ## Roadmap section in MEMORY.md will be seeded empty."` Read `decisions/index.md` — if no Active section entries exist, warn: `"decisions/index.md has no active entries — ## Decisions section in MEMORY.md will be seeded empty."` Emit warnings as a single batched block. User may Ctrl-C to clean up first, or proceed.
   - Existing `.project-memory/` stays in place; new behavior follows minimal rules going forward. Roadmap content from `summaries/roadmap.md` is appended to a freshly created `MEMORY.md`.
5. For `minimal → standard`:
   - **Validation (non-blocking):** Read `MEMORY.md` — if `## Roadmap` section is missing or empty, warn: `"MEMORY.md → ## Roadmap is empty; summaries/roadmap.md will be seeded empty."` If `## Decisions` section is missing or empty, warn: `"MEMORY.md → ## Decisions is empty; decisions/index.md will be seeded empty."` Emit warnings as a single batched block. User may Ctrl-C to clean up first, or proceed.
   - Create `.project-memory/` skeleton; migrate `MEMORY.md` sections into seed `roadmap.md` and `decisions/index.md`.
6. Inform the user what becomes active / inactive from this point. No existing artifacts are deleted.

---

# Profiles

This skill supports two profiles (`standard`, `minimal`). Profiles gate ceremony-bearing features (gate steps, audit categories, summaries, attribution depth, instruction re-injection scope, decisions storage shape).

User-triggered features (discussions, issues, assignments, instructions, notes creation, eras, maintainer role, ADR mirror, MCP companion) are **NOT** tier-bound — they remain opt-in regardless of profile.

**Backward compatibility:** Legacy config.yml files with `profile: full` or `profile: lite` are treated as `profile: standard` at read time. The `profile_history` retains original values for audit-aware checks. No migration action is needed.

For the full tier matrix, init UX text, migration semantics, and orthogonal-feature list → read `profiles.md`.

---

# MCP Companion

The optional `mcp-server/` subdirectory provides semantic search and deterministic audits. Read `mcp-integration.md` for availability detection, tool catalog, proactive sync, and degradation rules. MCP is an accelerator, never a requirement. Available across all profiles when installed.

---

# CRITICAL GATES

```
BEFORE IMPLEMENTATION → Pre-Implementation Gate (GATE 0 + Steps 1–3) per standard/gates.md
BEFORE COMMIT         → Pre-Commit Gate (significance → update summaries → capture decision) per standard/gates.md
```

For detailed gate procedures → read standard/gates.md.
For agent thinking protocol and memory loading → read `<profile>/protocol.md`.
For quick reference cheatsheet → read `<profile>/cheatsheet.md`.

`<profile>` is `standard`. `minimal` covers all of the above in `minimal/minimal.md`.

---

# Core Principles

Git answers: what changed, where, when, what is the diff.

Project Memory answers: why it was changed, what alternatives were considered and rejected, what constraints existed, what tensions are unresolved, what approaches have proven harmful, what should happen next.

Git is the source of truth for code changes. `.project-memory/` (or `MEMORY.md` under minimal) is the source of truth for engineering reasoning.

Records carry author attribution via `created_by` and `contributors` frontmatter fields. Full rules: `conventions/maintainer.md` → Author Attribution. (Note: `contributors` is omitted in `lite`; both omitted in `minimal`.)

---

# Project Structure

## `.project-memory/` (standard)

```
.project-memory/
├── phases/           # frozen archive — see phases/README.md
├── decisions/        DECISION-YYYY-MM-DD-slug.md + index.md
├── discussions/      DISCUSSION-YYYY-MM-DD-slug.md + index.md
├── issues/           open/ + closed/
├── instructions/     INSTRUCTION-YYYY-MM-DD-slug.md
├── notes/            NOTE-YYYY-MM-DD-slug.md
├── assignments/      ASSIGNMENT-YYYY-MM-DD-slug.md + index.yml
├── eras/             era-NNN.md + index.yml
└── summaries/        2 files: roadmap.md + current-state.md
```

## `MEMORY.md` (minimal)

`.project-memory/MEMORY.md` — single file inside the shared `.project-memory/` directory, with four fixed sections (`## Roadmap`, `## Decisions`, `## Notes`, `## Log`). User-triggered features (discussions, instructions, issues, notes) create their own subdirectories inside `.project-memory/` on first use.

## Skill Files

```
.claude/skills/project-memory/
├── SKILL.md                   ← Entry point (this file) — profile router
├── profiles.md                ← Tier matrix, init UX, migration semantics
│
├── standard/                      ← Files used when profile=standard
│   ├── protocol.md
│   ├── audit-fs.md
│   ├── audit-mcp.md
│   ├── templates-config.md
│   ├── init.md
│   ├── cheatsheet.md
│   └── gates.md              ← Pre-Implementation Gate + Pre-Commit Gate
│
├── minimal/                   ← Files used when profile=minimal
│   └── minimal.md             ← Single-file spec (covers everything)
│
├── audit.md                   ← Dispatcher (shared) — routes to <profile>/audit-*.md
├── conventions/               ← Dispatcher (shared) — routes to conventions/*.md
│   ├── index.md               ← Dispatcher
│   ├── decisions.md           ← Shared (lifecycle identical across profiles)
│   ├── discussions.md         ← Shared
│   ├── records.md             ← Shared
│   └── maintainer.md          ← Shared (with profile-specific notes for attribution)
├── templates/                 ← Dispatcher (shared) — routes to templates/*.md
│   ├── index.md               ← Dispatcher
│   ├── decisions.md           ← Shared
│   ├── discussions.md         ← Shared
│   ├── instructions.md        ← Shared
│   ├── assignments.md         ← Shared
│   └── attribution.md         ← Shared (created_by / contributors schema)
├── mcp-integration.md         ← Shared
└── README.md                  ← Human-readable overview
```

---

# Records & Conventions

For naming conventions, file templates, lifecycle rules, and the Decision Resolution Rules → read `conventions.md` (dispatcher — routes to shared topic-specific sub-files).

For decision lifecycle, ADR steps, touches guidance → `conventions/decisions.md`.
For discussion lifecycle, relevancy scoring, expiry → `conventions/discussions.md`.
For issue, instruction, assignment lifecycles → `conventions/records.md`.
For language policy, author attribution, maintainer role → `conventions/maintainer.md`.

---

# Quick Reference

```
About to commit?          → update current-state.md (and roadmap.md on scope-change) per standard/gates.md (Pre-Commit Gate)
About to close discussion?→ Determine outcome, write file, update index (all profiles)
About to assign work?     → Create ASSIGNMENT-YYYY-MM-DD-slug.md + index entry (all profiles)
About to implement?       → Pre-Implementation Gate (standard/gates.md)
About to receive assignment?→ Accept / Reject / Remind at session start
About to change profile?  → "change profile to X" intent — appends profile_history entry
```

For the full quick reference → read `<profile>/cheatsheet.md`.
