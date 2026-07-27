---
name: project-memory-templates-instructions
description: Template for INSTRUCTION records. User workflow preferences re-injected at gate checkpoints.
---

# Instruction Templates

## INSTRUCTION-YYYY-MM-DD-slug.md

Instruction records capture user workflow preferences as short prompts that must be in context on **every turn** — see the fourth directive in `standard/main-directives.md`. They are loaded at session start, kept present by that per-turn directive, and re-injected at gate checkpoints (Pre-Implementation Gate, turn-boundary sweep, Discussion trigger) as redundancy. User-scoped via `created_by`, stored in `.project-memory/instructions/`.

**An INSTRUCTION file contains frontmatter and a prompt. Nothing else. Ever.**

No scope section, no rationale, no procedure, no examples, no enforcement notes, no title
heading. This is not a style preference — both ways of violating it are wrong:

- Leave the prose in and it is injected every turn.
- Inject only the `# Prompt` section and the agent must still open and interpret the whole
  file every turn to get it.

A 60-line instruction that could have been 5 lines is a permanent tax either way. Rationale,
checklists, and procedures belong in the DECISION or NOTE that motivates the instruction —
read on demand when the trigger fires, never per turn.

Because `# Prompt` is the only heading in a well-formed file, section extraction runs to end of
file and cannot absorb anything unintended.

**Frontmatter (required):**
```yaml
---
id: INSTRUCTION-YYYY-MM-DD-short-slug
state: active              # active | dropped
created_by:                # required — see conventions/maintainer.md → Author Attribution
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
mode: prompt               # always prompt — re-injected at every gate, no per-instruction trigger needed
origin: null               # INSTRUCTION-ID if forked from another user
origin_updated: false      # true when origin instruction has been modified since fork
---
```

**Body — the entire body:**
```md
# Prompt

<the directive: trigger, required action, and what the action operates on>
```

**Rules — hard, not stylistic:**

1. **`# Prompt` is mandatory and is the only heading.** The parser resolves the payload as `# Prompt` section → frontmatter `prompt:` → **empty string**. There is no fallback to the file body, and nothing warns you. An instruction without `# Prompt` is `state: active` and injects nothing — silently dead. This is not hypothetical: it has happened in practice, with an instruction sitting active for six weeks while injecting an empty payload.
2. **As short as it can be while still obeyable.** It is in context every turn, forever, so every word is paid repeatedly. There is no line or word count: shortness is bounded by rule 3, and cutting something the reader needs to act is not shortening.
3. **Trigger, required action, and what the action operates on.** If it cannot be obeyed from the prompt alone, the prompt is wrong. A short list the action needs — the files to touch, the states to check — is part of the action and belongs in the prompt, not in a record the prompt points at.
4. **Everything else goes elsewhere.** Rationale → the motivating DECISION. Long checklists and multi-step procedures → a NOTE the prompt names by ID. Both are read only when the trigger fires. Do not use this route to push the action's own object out of the prompt.
5. **Never add a title heading, scope section, or closing note.** The filename and `id` are the title.

**Well-formed example:**

```md
# Prompt

When 30 commits by <email> have accumulated since the last deep review:
run the 8-item checklist in NOTE-YYYY-MM-DD-slug, then report findings or
"30-commit deep review: clean" and reset the counter.
```

**Naming:** `INSTRUCTION-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order
- Slug describes the instruction topic
- Use kebab-case
- Example: `INSTRUCTION-2026-06-13-squash-before-merge.md`

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
