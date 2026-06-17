---
name: project-memory
version: 0.0.3
description: Project memory and phase management system. Loads at every session start to provide engineering context → history, decisions, active tensions, anti-patterns. Use when planning, implementing, reviewing, or closing phases. Always active in this project.
---

# On Load

When this skill activates:

1. Output exactly this line:
   🧠 PROJECT MEMORY LOADED

2. **Determine active profile.**
   - If `.project-memory/config.yml` exists → read the `profile` field. Route to `full`, `lite`, or `minimal` accordingly. If the `profile` field is absent (legacy project), treat as `full` and offer the user a one-time non-blocking profile choice after on-load completes.
   - If `.project-memory/` does NOT exist → first-run (see step 3).

3. **First-run init UX (only when `.project-memory/` does not exist):**

   Ask the user:
   ```
   How do you want to run project-memory in this project?
     1) full     — full ceremony, for long-lived or multi-contributor projects
     2) lite     — minimal ceremony, for most mid-sized work
     3) minimal  — single MEMORY.md file, for short or throwaway work

   Things to consider:
     • Will the project last 3+ months?
     • Will more than one person contribute?
     • Are "why did we do X?" architectural questions likely to come up?

   You can change this choice later — just say so.
   ```
   Default cursor: `lite`. After the user picks:
   - `full` → read `full/init.md` and follow it.
   - `lite` → read `lite/init.md` and follow it.
   - `minimal` → read `minimal/minimal.md` and follow it.

   Each init writes `config.yml` (or `MEMORY.md` for minimal) with `profile` and seeds `profile_history` with `{profile, effective_date: today, reason: initial}`.

4. **Steady-state on-load** (profile known, project memory exists):
   - `profile=full` → read `full/protocol.md` for the Memory Loading Strategy and follow it. Then proceed to step 5.
   - `profile=lite` → read `lite/protocol.md` for the lite Memory Loading Strategy (loads only `roadmap.md` + `current-state.md`; instruction re-injection scope limited to Pre-Impl Gate Step 0). Then proceed to step 5.
   - `profile=minimal` → follow `minimal/minimal.md` instead — it covers loading, the single gate, and record-append behavior.

5. **Run Drift Audit** (full and lite only) — read `audit.md` for the dispatcher. It routes to `<profile>/audit-mcp.md` or `<profile>/audit-fs.md` based on MCP availability and active profile. Auto-fix findings silently. Interactive triage only on Cat 4 edge cases. `minimal` skips this step entirely.

6. Continue with the session. Do not ask the user for anything beyond the init UX (step 3) at this stage.

---

# Arguments

## audit

`Skill project-memory audit`, or implicit triggers (e.g. "audit yapalım", "let's audit", "drift kontrolü yap", "review project memory"), enters **Interactive Audit Mode**: read `audit.md` → Interactive Mode (which routes to the profile's audit file). Prompt user per finding; re-run detection; loop until clean.

In `minimal` profile this argument (and implicit triggers) is a no-op — minimal has no audit. Print a one-line notice and exit.

**Implicit triggers:** Turkish and English audit/drift-review phrases. Lenient detection. When phrasing is genuinely ambiguous (e.g. "let's review what we have" with no project-memory cue), ask a one-line clarification *"Did you mean run the project-memory drift audit?"* before triggering. Governing rule: `DECISION-2026-06-17-audit-implicit-triggers`.

## discuss

`Skill project-memory discuss`, or implicit triggers (e.g. "tartışalım", "let's discuss"), enters **Discussion Mode**: read `conventions-discussions.md` for the full lifecycle (shared across profiles). Load `discussions/index.md` for prior context. At close, apply relevancy scoring gate. If saving: write DISCUSSION file, update index.

Discussions are a user-triggered feature — available in all profiles. In `minimal`, discussion files go to `.project-memory/discussions/` even though no other `.project-memory/` infrastructure exists; the directory is created on first use.

**Implicit triggers:** Turkish and English planning/brainstorming phrases. Lenient detection.

**Resume:** "continue this discussion" → load existing DISCUSSION file, UPDATE it at close.

## change profile

When the user says "switch project-memory to <full|lite|minimal>" or similar phrasing ("change profile to X", "switch to lite", etc.):

1. Read current `config.yml` (or detect `MEMORY.md` for minimal).
2. Append a new entry to `profile_history`: `{profile: <new>, effective_date: today, reason: <user's stated motivation or "user request">}`.
3. Update top-level `profile` field.
4. For `full → minimal` or `lite → minimal`: existing `.project-memory/` stays in place; new behavior follows minimal rules going forward. Roadmap content from `summaries/roadmap.md` is appended to a freshly created `MEMORY.md`.
5. For `minimal → lite` or `minimal → full`: create `.project-memory/` skeleton; migrate `MEMORY.md` sections into seed `roadmap.md` and `decisions/index.md`.
6. Inform the user what becomes active / inactive from this point. No existing artifacts are deleted.

---

# Profiles

This skill supports three profiles (`full`, `lite`, `minimal`). Profiles gate ceremony-bearing features (phase ceremony, gate steps, audit categories, summaries, attribution depth, topic-shift detection, commit classification, instruction re-injection scope, decisions storage shape).

User-triggered features (discussions, issues, assignments, instructions creation, eras, maintainer role, ADR mirror, MCP companion) are **NOT** tier-bound — they remain opt-in regardless of profile.

For the full tier matrix, init UX text, migration semantics, and orthogonal-feature list → read `profiles.md`.

---

# MCP Companion

The optional `mcp-server/` subdirectory provides semantic search and deterministic audits. Read `mcp-integration.md` for availability detection, tool catalog, proactive sync, and degradation rules. MCP is an accelerator, never a requirement. Available across all profiles when installed.

---

# CRITICAL GATES

```
BEFORE IMPLEMENTATION → phase must exist (full/lite) → create it first
                      → instruction re-inject (all profiles)
BEFORE MERGE/CLOSE    → Pre-Close Gate (full: 3-file verify + roadmap transfer; lite: sanity + TODO warn)
BEFORE SESSION END    → if significant commits landed, phase must be updated (full/lite)
PIPELINE SUBMISSION   → counts as implementation → phase must exist before submit (full/lite)
```

For detailed gate procedures, commit significance, topic shift → read `<profile>/gates.md`.
For agent thinking protocol and memory loading → read `<profile>/protocol.md`.
For quick reference cheatsheet → read `<profile>/cheatsheet.md`.

`<profile>` is `full` or `lite`. `minimal` covers all of the above in `minimal/minimal.md`.

---

# Core Principles

Git answers: what changed, where, when, what is the diff.

Project Memory answers: why it was changed, what alternatives were considered and rejected, what constraints existed, what tensions are unresolved, what approaches have proven harmful, what should happen next.

Git is the source of truth for code changes. `.project-memory/` (or `MEMORY.md` under minimal) is the source of truth for engineering reasoning.

Records carry author attribution via `created_by` and `contributors` frontmatter fields. Full rules: `conventions-maintainer.md` → Author Attribution. (Note: `contributors` is omitted in `lite`; both omitted in `minimal`.)

---

# Project Structure

## `.project-memory/` (full / lite)

```
.project-memory/
├── phases/           phase-YYYYMMDD-slug/{phase.yml, plan.md, ...} (5 files in full, 2 in lite)
├── decisions/        DECISION-YYYY-MM-DD-slug.md + index.md
├── discussions/      DISCUSSION-YYYY-MM-DD-slug.md + index.md
├── issues/           open/ + closed/
├── instructions/     INSTRUCTION-YYYY-MM-DD-slug.md
├── assignments/      ASSIGNMENT-YYYY-MM-DD-slug.md + index.yml
├── eras/             era-NNN.md + index.yml
└── summaries/        full: 5 files; lite: roadmap.md + current-state.md
```

## `MEMORY.md` (minimal)

Single file at project root with three fixed sections (`## Roadmap`, `## Decisions`, `## Log`). No `.project-memory/` directory unless discussions/instructions/issues are created on demand.

## Skill Files

```
.claude/skills/project-memory/
├── SKILL.md                   ← Entry point (this file) — profile router
├── profiles.md                ← Tier matrix, init UX, migration semantics
│
├── full/                      ← Files used when profile=full
│   ├── gates.md
│   ├── protocol.md
│   ├── audit-fs.md
│   ├── audit-mcp.md
│   ├── templates-phase.md
│   ├── templates-config.md
│   ├── init.md
│   └── cheatsheet.md
│
├── lite/                      ← Files used when profile=lite (same names as full/)
│   └── (same 8 files, lite-specific content)
│
├── minimal/                   ← Files used when profile=minimal
│   └── minimal.md             ← Single-file spec (covers everything)
│
├── audit.md                   ← Dispatcher (shared) — routes to <profile>/audit-*.md
├── templates.md               ← Dispatcher (shared) — routes to <profile>/templates-* where applicable
├── conventions.md             ← Dispatcher (shared) — routes to conventions-*.md (all shared root)
├── conventions-decisions.md   ← Shared (lifecycle identical across profiles)
├── conventions-discussions.md ← Shared
├── conventions-records.md     ← Shared
├── conventions-maintainer.md  ← Shared (with profile-specific notes for attribution)
├── templates-records.md       ← Shared
├── mcp-integration.md         ← Shared
└── README.md                  ← Human-readable overview
```

---

# Phase Lifecycle (full / lite)

```
Significant work begins → Phase created (status: planning)
          ↓
Commits accumulate → phase.yml updated with commit hashes
          ↓
Work unit complete → Phase closes (status: completed)
                     full: followup.md → roadmap.md transfer (mandatory)
                     lite: roadmap entries already added during work
```

**Key rules:**
- Phase created BEFORE first significant commit → see `<profile>/gates.md` for commit significance.
- Required files (full): `phase.yml`, `plan.md`, `implementation.md`, `review-and-fixes.md`, `followup.md`.
- Required files (lite): `phase.yml`. `plan.md` is optional.
- Phase status transitions and close criteria in `<profile>/gates.md`.
- Phases sorted newest first in `index.yml`. Prepend on creation.

Minimal has no phase concept — work is logged as rows in `MEMORY.md`.

---

# Records & Conventions

For naming conventions, file templates, lifecycle rules, and the Decision Resolution Rules → read `conventions.md` (dispatcher — routes to shared topic-specific sub-files).

For decision lifecycle, ADR steps, touches guidance → `conventions-decisions.md`.
For discussion lifecycle, relevancy scoring, expiry → `conventions-discussions.md`.
For issue, instruction, assignment lifecycles → `conventions-records.md`.
For language policy, author attribution, maintainer role → `conventions-maintainer.md`.

---

# Quick Reference

```
About to commit?          → Classify significance (full only), check phase exists (full/lite)
About to open a phase?    → phase.yml + plan.md (lite: plan optional) + index.yml entry
About to close a phase?   → full: verify 3 files; lite: commits sanity + TODO warn
About to close discussion?→ Determine outcome, write file, update index (all profiles)
About to assign work?     → Create ASSIGNMENT-YYYY-MM-DD-slug.md + index entry (all profiles)
About to implement?       → Pre-Implementation Gate (gates.md per profile)
About to receive assignment?→ Accept / Reject / Remind at session start
About to change profile?  → "change profile to X" intent — appends profile_history entry
```

For the full quick reference → read `<profile>/cheatsheet.md`.
