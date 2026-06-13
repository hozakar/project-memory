---
name: project-memory-conventions-maintainer
description: Language policy, author attribution rules (created_by + contributors), and maintainer role system.
---

# Language

All skill files (`SKILL.md`, `init.md`, `audit.md`, `conventions.md`, `templates.md`) are written in English.

Rationale: skill files are LLM-facing rules — they never surface directly to the end user. English is the LLM's native register for instruction-following. User-facing communication (conversation, summaries shown to the user) may follow the user's preferred language; the rule files themselves do not.

This applies to all text inside the skill files: prose, comments, placeholder identifiers, headings, table cells, code-block strings used as examples. Memory data under `.project-memory/` (which the user authors and reads) is NOT subject to this rule.

---

# Author Attribution

All phase / decision / discussion / issue records carry author attribution via two required frontmatter fields:

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
| phase      | first or substantive write of `implementation.md` / `review-and-fixes.md` / `followup.md`; phase close (status: completed) |
| decision   | initial write; status change (active → superseded / amended) |
| discussion | initial write; resume update; close (status: concluded) |
| issue      | initial write; status change (open → closed) |

**In scope:** `phase.yml`, `DECISION-YYYY-MM-DD-*.md`, `DISCUSSION-YYYY-MM-DD-*.md`, `ISSUE-YYYY-MM-DD-*.md`.

**Out of scope (do NOT add these fields):** `era-NNN.md` (project-wide), `summaries/*.md` (project-wide), `MEMORY.md` (single-user), `adr/NNNN-*.md` (MADR has no Author field — DECISION is canonical), index files (`phases/index.yml`, `decisions/index.md`, `discussions/index.md` — token economy).

**No audit category.** Soft-fall to `unknown` makes "missing field" impossible by construction; the drift audit does not check attribution.

---

# Maintainer Role

Project-memory uses a lightweight two-role system for era creation gating only. All other operations are unrestricted.

**Roles:**
- **Maintainer** — receives era creation prompts when ~10 phases accumulate. Can decide to create an era.
- **Developer** — default role. No era prompts. Everything else is identical to maintainer.

**Source of truth:** `.project-memory/maintainers.md` — a flat YAML file:

```yaml
maintainers:
  - email: "alice@example.com"
  - email: "bob@example.com"
```

**Role determination (session start):**
1. Read `maintainers.md`
2. Run `git config user.email`
3. If email is in the list → maintainer
4. Otherwise → developer

**Editing rules:**
- Anyone can edit `maintainers.md` (no restrictions — git controls push permissions)
- Add or remove emails to promote/demote
- Changes take effect next session

**Gated actions:**
| Action | Developer | Maintainer |
|--------|-----------|------------|
| Audit | ✅ | ✅ |
| Phase management | ✅ | ✅ |
| Era creation decision | ❌ (silent) | ✅ (prompted) |

**What this is NOT:**
- NOT a security boundary (git handles that)
- NOT tamper-proof
- NOT a general access-control system
