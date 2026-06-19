---
name: project-memory-gates-commit
description: Commit significance classification and Pre-Commit Gate for both full and lite profiles.
---

# Commit Significance

## Full Profile — Three-way Classification

Runs before every commit. Classify the work:

| Significance | Examples | Action |
|---|---|---|
| **Trivial** | unused import/var removal, typo fix, formatting, `console.log` cleanup | Attach to open phase silently, or skip if no open phase |
| **Significant** | feature, bugfix, refactor, schema/type change, config with runtime effect, security fix, perf optimization | Open a phase if none is open; attach to open phase |
| **Ambiguous** | test additions, config tweaks, dependency upgrades, doc updates | Ask the user before deciding |

**Grouping rule:** commits in the same session on the same topic belong to the same phase. If the topic shifts substantially mid-session, close the current phase and open a new one.

**Trivial-only session:** if the entire session produces only trivial commits and no open phase exists, no phase is created. Memory is not polluted with noise.

## Lite Profile — Binary Classification

Lite collapses the 3-way classification into a binary check:

| Class | Examples | Action |
|---|---|---|
| **Trivial** | unused import/var removal, typo fix, formatting, `console.log` cleanup, single-line comment edit | Attach to open phase silently, or skip if no open phase. Skip the decision check. |
| **Everything else** | features, bugfixes, refactors, schema/type changes, dependency upgrades, test additions, config tweaks, doc updates with runtime effect | Open a phase if none is open; run the decision check at the gate. |

The `Ambiguous` category from `full` collapses into "everything else" — lite optimizes for simplicity over fine-grained gating.

**Trivial-only session:** if the entire session produces only trivial commits and no open phase exists, no phase is created.

---

# Pre-Commit Gate

## Full Profile

```
BEFORE IMPLEMENTATION → phase must exist → create it first
BEFORE COMMIT         → classify significance → update phase files if significant (see Pre-Commit Gate)
BEFORE MERGE/CLOSE    → Pre-Close Gate must pass (3 files complete)
PIPELINE SUBMISSION   → counts as implementation → phase must exist before submit
```

Before executing ANY commit, classify significance and update phase files accordingly. The commit boundary is the natural decision point where you already answer "what changed and why?" — the phase files capture the structured version of that same reasoning.

**Step 1 — Classify significance:**
Use the commit significance table above. Trivial → skip Steps 2–3. Significant → continue.

**Step 2 — Update phase.yml:**
Append the commit hash to `phase.yml.commits`.

**Step 3 — Update phase files (significant commits only):**
Write or append to these files before the commit lands:

| File | What to record |
|---|---|
| `implementation.md` | What this commit does and why. Not a copy of the commit message — capture the reasoning, the alternatives considered at this step, the constraints that shaped this decision. Append; do not overwrite. |
| `followup.md` | Any newly discovered debt, open questions, or recommended next phases. Incremental — add to whatever is already there. |
| `review-and-fixes.md` | Self-review findings for this commit: edge cases noticed, potential issues, things to revisit. |

**Rules:**
- **No instruction injection at this gate.** This is an operational gate, not a strategic one. Instruction re-injection happens at Pre-Implementation and Pre-Close only.
- **Trivial commits** (typo, formatting, import cleanup, single-line bugfix, comment edit) → attach to phase silently, skip all file updates.
- **Ambiguous commits** → treat as trivial (no user question, per frictionless UX decision).
- **Incremental, not replacement.** Append to existing files. Do not rewrite. Each commit adds a paragraph or bullet; the file grows as the phase progresses.
- **Multi-session safe.** When a phase spans sessions, each session appends its own context. The next session reads what was written before and continues.
- **Profile-aware.** This is the full-profile version. Lite has its own simplified version in `gates/commit.md` → Lite Profile.

## Lite Profile

Before executing ANY commit, classify using the lite binary check and update `phase.yml` if non-trivial.

**Lite collapses full's Pre-Commit Gate into one action: update `phase.yml`.**

| Class | Action |
|---|---|
| **Trivial** (typo, formatting, import cleanup, single-line comment edit) | Attach to open phase silently. No file updates. |
| **Everything else** (features, bugfixes, refactors, schema/type changes, dependency upgrades, test additions, config tweaks) | 1) Append commit hash to `phase.yml.commits`. 2) If `plan.md` exists and the plan evolved during this commit, update it. 3) Then commit. |

**Rules:**
- **No instruction injection at this gate.** This is an operational gate. Lite re-injects instructions only at Pre-Impl Gate Step 0 — not here.
- **No user questions.** The lite binary check is deterministic; there is no ambiguous category to escalate.
- **Incremental.** `plan.md` updates are append-only when the plan evolves. `phase.yml.commits` grows by one hash per significant commit.
- **Multi-session safe.** When a phase spans sessions, each session appends its own commit hashes and plan updates.
- **Full profile has more ceremony** — see `gates/commit.md` → Full Profile for the 5-file version.
