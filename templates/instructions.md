---
name: project-memory-templates-instructions
description: Template for INSTRUCTION records. User workflow preferences re-injected at gate checkpoints.
---

# Instruction Templates

## INSTRUCTION-YYYY-MM-DD-slug.md

Instruction records capture user workflow preferences as short prompts in context every turn — see `standard/main-directives.md`. An INSTRUCTION file contains frontmatter and a `# Prompt` section. Nothing else — rationale and procedures belong in the motivating DECISION or NOTE, not here.

**Frontmatter (required):**
```yaml
---
id: INSTRUCTION-YYYY-MM-DD-short-slug
state: active              # active | dropped
created_by:                # required — see conventions/maintainer.md → Author Attribution
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
mode: prompt               # always prompt
origin: null               # INSTRUCTION-ID if forked
origin_updated: false      # true when fork-source modified
---
```

**Body:**
```md
# Prompt
<the directive: trigger, required action, and what the action operates on>
```

**Rules:**
1. **`# Prompt` is mandatory and is the only heading** — without it the instruction silently injects nothing.
2. **As short as obeyable** — every word is paid every turn.
3. **Trigger, action, and operand** — from the prompt alone.
4. **Everything else elsewhere** (DECISION for rationale, NOTE for checklists). No title/scope/closing headings.

**Well-formed example:**
```md
# Prompt
When 30 commits by <email> have accumulated since the last deep review:
run the 8-item checklist in NOTE-YYYY-MM-DD-slug, then report findings
or "30-commit deep review: clean" and reset the counter.
```

**Naming:** `INSTRUCTION-YYYY-MM-DD-<short-slug>.md`. Date first, kebab-case.

**Lifecycle:** `active` → loaded at every turn. `dropped` → retained but not loaded. No auto-expiry.

**Cross-user sharing:** Adoption creates new INSTRUCTION with `origin` set to source ID. `origin_updated: true` if source modified; user prompted at session start.

**Scope limits:** Not architectural decisions, not in Pre-Implementation Gate, not a rule engine.
