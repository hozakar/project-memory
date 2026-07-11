---
name: project-memory-conventions-maintainer
description: Language policy, author attribution rules (created_by + contributors).
---

# Language

All skill files (`SKILL.md`, `init.md`, `audit.md`, `conventions.md`, `templates.md`) are written in English.

Rationale: skill files are LLM-facing rules — they never surface directly to the end user. English is the LLM's native register for instruction-following. User-facing communication (conversation, summaries shown to the user) may follow the user's preferred language; the rule files themselves do not.

This applies to all text inside the skill files: prose, comments, placeholder identifiers, headings, table cells, code-block strings used as examples. Memory data under `.project-memory/` (which the user authors and reads) is NOT subject to this rule.

---

# Author Attribution

**Profile scope:**
|- `standard` — both `created_by` and `contributors` are required (the rules below apply in full).
|- `minimal` — no attribution metadata at all. Git already records the author; minimal does not duplicate it into record frontmatter.

The rules below describe `standard` behavior. Under `minimal`, this section does not apply.

---

All decision / discussion / issue records carry author attribution via two required frontmatter fields:

```yaml
created_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
```

**Capture.** At every record-creating or status-changing write, the LLM runs:

```
git config user.name
git config user.email
```

The pair becomes the current identity. If either command fails or returns an empty string, the current identity falls back to the sentinel `{ name: "unknown", email: "unknown" }`. **The user is NEVER prompted** — soft-fail is intentional, so the skill works during install, trial, or external contributor scenarios without git identity configured.

**`created_by`** is set once at record creation and never changed.

**`contributors`** is appended on **status-changing writes only** — not on re-indents, format fixes, or passive reads. Dedup by `email`: the same contributor is not added twice. Growth triggers per record type:

| Record     | Triggers that append the current identity to `contributors` |
|------------|-------------------------------------------------------------|
| decision   | initial write; status change (active → superseded / amended) |
| discussion | initial write; resume update; close (status: concluded) |
| issue      | initial write; status change (open → closed) |

**In scope:** `DECISION-YYYY-MM-DD-*.md`, `DISCUSSION-YYYY-MM-DD-*.md`, `ISSUE-YYYY-MM-DD-*.md`.

**Out of scope (do NOT add these fields):** `era-NNN.md` (project-wide), `summaries/*.md` (project-wide), `MEMORY.md` (single-user), `adr/NNNN-*.md` (MADR has no Author field — DECISION is canonical), index files (`decisions/index.md`, `discussions/index.md` — token economy).

**No audit category.** Soft-fall to `unknown` makes "missing field" impossible by construction; the drift audit does not check attribution.

---

> **Note:** The Maintainer Role and Era Frontmatter Schema sections were removed on 2026-07-11 per `DECISION-2026-07-11-era-and-maintainer-dropped`. The era concept and maintainer role have been dropped. This file now covers language policy and author attribution only. The filename is retained to minimize disruption to existing references.

