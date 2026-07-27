---
name: project-memory-conventions-maintainer
description: Language policy, author attribution rules (created_by + contributors).
---
# Language

All skill files are written in English — English is the LLM's native register for instruction-following. `.project-memory/` data is not subject to this rule.

# Author Attribution
**Profile scope:**
| - `standard` — `created_by` required; `contributors` omitted.
| - `minimal` — no attribution metadata.

All records carry `created_by` in frontmatter:

```yaml
created_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
```
**Capture.** On each record-creating/status-changing write, run `git config user.name` / `git config user.email`; fall back to `unknown` on failure. Never prompt.
**`created_by`** set once, never changed. **`contributors`** (when used) appended on status-changing writes only. Dedup by email.

| Record     | Appends on |
|------------|------------|
| decision   | initial write; status change |
| discussion | initial write; resume update; close (concluded) |
| issue      | initial write; status change (open → closed) |
**In scope:** `DECISION-*.md`, `DISCUSSION-*.md`, `ISSUE-*.md`.
**Out of scope:** `era-NNN.md`, `summaries/*.md`, `MEMORY.md`, `adr/NNNN-*.md`, index files.
