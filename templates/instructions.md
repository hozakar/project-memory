---
name: project-memory-templates-instructions
description: Template for INSTRUCTION records. User workflow preferences re-injected at gate checkpoints.
---

# Instruction Templates

## INSTRUCTION-YYYY-MM-DD-slug.md

Instruction records capture user workflow preferences as short prompts that must be in context on **every turn** — per the fourth directive in `standard/main-directives.md` and `DECISION-2026-07-26-per-turn-instruction-load`. They are loaded at session start, kept present by that per-turn directive, and re-injected at gate checkpoints (Pre-Implementation Gate, turn-boundary sweep, Discussion trigger) as redundancy. User-scoped via `created_by`, stored in `.project-memory/instructions/`.

**The `# Prompt` section is the payload, and brevity is a hard requirement.** It is re-read on every turn for the life of the project, so every word is paid for permanently. A long instruction is not a more binding instruction — it is a more expensive one that is likelier to be skimmed.

**Frontmatter (required):**
```yaml
---
id: INSTRUCTION-YYYY-MM-DD-short-slug
state: active              # active | dropped
created_by:                # required — see templates/attribution.md
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
mode: prompt               # always prompt — re-injected at every gate, no per-instruction trigger needed
origin: null               # INSTRUCTION-ID if forked from another user
origin_updated: false      # true when origin instruction has been modified since fork
---
```

**Body:**
```md
# <Title>
# Prompt
<the directive itself — imperative, trigger + required action, 5 lines or fewer>
```

**`# Prompt` rules — these are hard, not stylistic:**

1. **`# Prompt` is mandatory.** The parser resolves the payload as `# Prompt` section → frontmatter `prompt:` → **empty string**. There is no fallback to the file body, and nothing warns you. An instruction without `# Prompt` is `state: active` and injects nothing — silently dead. This has already happened: `INSTRUCTION-2026-06-14-deep-review-every-5-phases` sat active from 2026-06-14 injecting an empty payload.
2. **Budget: 5 lines or fewer, roughly 60 words.** It is injected every turn, forever.
3. **The Prompt holds only the directive** — the trigger and the required action. No rationale, no scope enumeration, no numbered procedures, no enforcement paragraphs, no "why this matters."
4. **Rationale belongs outside the Prompt section**, where it is not injected — or better, in the DECISION or NOTE that motivated the instruction, referenced by one line. Instructions are prompts; decisions carry reasoning.
5. **Write it so it survives being read for the thousandth time.** If it cannot be obeyed from the Prompt alone, the Prompt is wrong — not too short.

**Well-formed example** (`INSTRUCTION-2026-06-13-branch-per-phase.md` has the right shape and length, though it predates the mandatory `# Prompt` section):

```md
# Branch Per Phase
# Prompt
Before implementing a phase: create a branch from main named after the phase ID.
Merge back via PR when done. Never commit phase work directly to main.
```

**Naming:** `INSTRUCTION-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order
- Slug describes the instruction topic
- Use kebab-case
- Example: `INSTRUCTION-2026-06-13-branch-per-phase.md`

**Lifecycle:**
- `active` → loaded at session start for the matching user, and kept in context every turn
- `dropped` → retained but not loaded
- No auto-expiry; user explicitly drops via "drop instruction X"

**Cross-user sharing (fork model):**
- User adopts another's instruction → new INSTRUCTION created with `created_by` set to current user, `origin` set to source ID
- If original is updated → `origin_updated: true` set on fork; user prompted at session start

**Scope limits:**
- NOT architectural decisions — no ADR counterpart
- NOT scanned during Pre-Implementation Gate
- NOT a deterministic rule engine — mode is always `prompt`
- Filesystem is source of truth; vector DB is derived read-optimized index
