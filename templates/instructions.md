---
name: project-memory-templates-instructions
description: Template for INSTRUCTION records. User workflow preferences re-injected at gate checkpoints.
---

# Instruction Templates

## INSTRUCTION-YYYY-MM-DD-slug.md

Instruction records capture user workflow preferences as short prompts injected into LLM context at session start and re-injected at every gate checkpoint (Pre-Implementation Gate, turn-boundary sweep, Discussion trigger). User-scoped via `created_by`, stored in `.project-memory/instructions/`.

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
# Prompt
<Short, direct instruction injected into LLM context at session start>
```

**Naming:** `INSTRUCTION-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order
- Slug describes the instruction topic
- Use kebab-case
- Example: `INSTRUCTION-2026-06-13-branch-per-phase.md`

**Lifecycle:**
- `active` → loaded at session start for the matching user
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
