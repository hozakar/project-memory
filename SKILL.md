---
name: project-memory
description: Project memory system. Loads at every session start to provide engineering context → history, decisions, active tensions, anti-patterns. Use when planning, implementing, or reviewing. Always active in this project.
---

# On Load

**Subagents are exempt:** if you were dispatched as a subagent for a specific task, skip the session-start load and both gates, and never write to `.project-memory/` — report to your parent instead. The parent owns all memory writes and briefs you with the constraints your task needs.

When this skill activates:

1. Output exactly this line:
   🧠 PROJECT MEMORY LOADED

2. **Determine active profile.**
   - Read `.project-memory/config.yml` directly using the Read tool.
   - If the Read succeeds → parse the `profile` field. Valid values are `standard` and `minimal`. If the profile field does not exist or is not valid then the profile is `standard`.
   - If the Read fails (file not found) → first-run (see step 3).

3. **First-run init (only when `.project-memory/config.yml` does not exist):**
   Read `profiles.md` → Init UX for the profile-selection prompt, then follow its routing (`standard` → `standard/init.md`; `minimal` → `minimal/minimal.md`).

4. **Steady-state on-load** (profile known, project memory exists):
   - `profile=standard` → read `standard/protocol.md` for the Memory Loading Strategy and follow it. Then proceed to step 5.
   - `profile=minimal` → follow `minimal/minimal.md` instead — it covers loading, the single gate, and record-append behavior.

5. **Post-first-response drift audit** (standard only):
   - **If MCP `run_audit` is available:** call `run_audit(project_memory_dir, { profile: 'standard', background: true })` at session open. The server returns `{ status: 'running' }` (audit starting/in-progress) or `{ status: 'done' }` (audit already completed moments ago) — in either case emit the instant-ack line and move on; do not start a second audit. Fixes are applied silently in the background via the chained pipeline (`run_audit → apply_audit_fixes → re-run until clean`). **No report block is emitted.**
   - **If MCP is NOT available:** defer the drift audit to after the LLM answers the user's first message. After the first user-facing response is delivered, run the drift audit (see standard/audit-fs.md for categories) via the file-based `audit.md` path and emit the drift report as a follow-up block.
   - **Exceptions (audit runs synchronously):** (a) explicit invocation via `Skill project-memory audit` or natural-language audit trigger (lenient detection: recognize intent in any language, ask clarification when ambiguous) — uses synchronous `run_audit` (background omitted/false); (b) the first user message is itself an audit-implicit/explicit trigger — run audit synchronously to answer correctly; (c) `minimal` profile — no audit at all, no deferral applies.

6. Continue with the session. Do not ask the user for anything beyond the init UX (step 3) at this stage.

---

# Arguments

## audit

`Skill project-memory audit`, or natural-language phrasings that clearly request an audit / drift review of project memory (e.g. "let's audit", "run a drift check", "review project memory"), enters **Interactive Audit Mode**: read `audit.md` → Interactive Mode (which routes to the profile's audit file). Prompt user per finding; re-run detection; loop until clean.

In `minimal` profile this argument (and natural-language triggers) is a no-op — minimal has no audit. Print a one-line notice and exit.

**Implicit triggers:** Lenient detection of audit / drift-review intent. The user may phrase the request in any language; recognize the intent, not the keywords. When phrasing is genuinely ambiguous (e.g. "let's review what we have" with no project-memory cue), ask a one-line clarification *"Did you mean run the project-memory drift audit?"* before triggering. Governing rule: recognize intent in any language; ask a one-line clarification when genuinely ambiguous.

## discuss

`Skill project-memory discuss`, or natural-language phrasings that clearly request a planning / brainstorming conversation (e.g. "let's discuss", "let's brainstorm", "let's talk this through"), enters **Discussion Mode**: read `conventions/discussions.md` for the full lifecycle (shared across profiles). Load `discussions/index.md` for prior context. At close, apply relevancy scoring gate. If saving: write DISCUSSION file, update index.

Discussions are a user-triggered feature — available in all profiles. In `minimal`, discussion files go to `.project-memory/discussions/` even though no other `.project-memory/` infrastructure exists; the directory is created on first use.

**Implicit triggers:** Lenient detection of planning / brainstorming intent. The user may phrase the request in any language; recognize the intent, not the keywords.

**Resume:** "continue this discussion" → load existing DISCUSSION file, UPDATE it at close.

## change profile

When the user says "switch project-memory to <standard|minimal>" or similar phrasing:

1. Read current `config.yml` (or detect `MEMORY.md` for minimal).
2. Append a new entry to `profile_history`: `{profile: <new>, effective_date: today, reason: <user's stated motivation or "user request">}`.
3. Update top-level `profile` field.
4. For `standard → minimal`: Validate `summaries/roadmap.md` and `decisions/index.md` for non-empty content; emit warnings as a single batched block if empty. Existing `.project-memory/` stays in place; new behavior follows minimal rules going forward. Roadmap content appended to freshly created `MEMORY.md`.
5. For `minimal → standard`: Validate `MEMORY.md`'s `## Roadmap` and `## Decisions` for non-empty content; emit warnings as a single batched block if empty. Create `.project-memory/` skeleton; migrate `MEMORY.md` sections into seed `roadmap.md` and `decisions/index.md`.
6. Inform the user what becomes active / inactive from this point. No existing artifacts are deleted.

---

# Profiles

This skill supports two profiles (`standard`, `minimal`). Profiles gate ceremony-bearing features (gate steps, audit categories, summaries, attribution depth, instruction re-injection scope, decisions storage shape).

User-triggered features (discussions, issues, instructions, notes creation, ADR mirror, MCP companion) are **NOT** tier-bound — they remain opt-in regardless of profile.

**Backward compatibility:** Legacy config.yml files with `profile: full` or `profile: lite` are treated as `profile: standard` at read time. The `profile_history` retains original values for audit-aware checks. No migration action is needed.

For the full tier matrix, init UX text, migration semantics, and orthogonal-feature list → read `profiles.md`.

---

# MCP Companion

The optional `mcp-server/` subdirectory provides semantic search and deterministic audits. Read `mcp-integration.md` for availability detection, tool catalog, proactive sync, and degradation rules. MCP is an accelerator, never a requirement. Available across all profiles when installed.

---

# CRITICAL GATES

The compressed per-turn directives have a single source of truth: `standard/main-directives.md`.
Read it for the trigger list; its directive block is mirrored verbatim into the host instructions file so
the directives survive context compaction. They are deliberately not restated here — a second
copy is a drift surface.

For detailed gate procedures → read standard/gates.md.
For agent thinking protocol and memory loading → read `standard/protocol.md`.
For quick reference cheatsheet → read `standard/cheatsheet.md`.

`<profile>` is `standard`. `minimal` covers all of the above in `minimal/minimal.md`.

---

# Philosophy

Git answers what/where/when/diff. Project Memory answers why/alternatives/constraints/tensions/what-next. Git is the source of truth for code; .project-memory/ is the source of truth for engineering reasoning.

Records carry author attribution via `created_by` (and `contributors` in legacy projects). Full rules: `conventions/maintainer.md` → Author Attribution.

---

# Project Structure

## `.project-memory/` (standard)

```
.project-memory/
├── phases/
├── decisions/
├── discussions/
├── issues/
├── instructions/
├── notes/
└── summaries/
```

See standard/init.md for the full scaffold.

## `MEMORY.md` (minimal)

`.project-memory/MEMORY.md` — single file inside the shared `.project-memory/` directory, with four fixed sections (`## Roadmap`, `## Decisions`, `## Notes`, `## Log`). User-triggered features create their own subdirectories inside `.project-memory/` on first use.

## Skill Files

```
.claude/skills/project-memory/
├── SKILL.md                   ← Entry point (this file) — profile router
├── profiles.md                ← Tier matrix, init UX, migration semantics
│
├── standard/                      ← Files used when profile=standard
│   ├── audit-fs.md
│   ├── audit-mcp.md
│   ├── cheatsheet.md
│   ├── gates.md              ← Pre-Implementation Gate + turn-boundary sweep
│   ├── init.md
│   ├── main-directives.md    ← Canonical per-turn directives (single source)
│   ├── protocol.md
│   └── templates-config.md
│
├── minimal/                   ← Files used when profile=minimal
│   └── minimal.md             ← Single-file spec (covers everything)
│
├── audit.md                   ← Dispatcher (shared) — routes to <profile>/audit-*.md
├── conventions/               ← Dispatcher (shared) — routes to conventions/*.md
│   ├── decisions.md           ← Shared (lifecycle identical across profiles)
│   ├── discussions.md         ← Shared
│   ├── maintainer.md          ← Shared (language policy, author attribution)
│   └── records.md             ← Shared
├── templates/                 ← Dispatcher (shared) — routes to templates/*.md
│   ├── decisions.md           ← Shared
│   ├── discussions.md         ← Shared
│   ├── instructions.md        ← Shared
│   └── notes.md               ← Shared (NOTE template)
├── mcp-integration.md         ← Shared
└── README.md                  ← Human-readable overview
```

---

# Records & Conventions

For decision lifecycle, ADR steps, touches guidance → `conventions/decisions.md`.
For discussion lifecycle, relevancy scoring, expiry → `conventions/discussions.md`.
For issue and instruction lifecycles → `conventions/records.md`.
For language policy and author attribution → `conventions/maintainer.md`.

---

# Quick Reference

Turn ending with commits?  → turn-boundary sweep: update current-state.md (once, covering the turn's commits) + roadmap.md on scope-change per standard/gates.md

For the full quick reference, read standard/cheatsheet.md.
