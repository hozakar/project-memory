---
name: project-memory-templates-notes
description: Template for NOTE records — personal, private, deletable note-taking. User-scoped. No status workflow. No index file.
---

# Note Template

## NOTE-YYYY-MM-DD-slug.md

Note records capture personal thoughts, drafts, ideas, and reminders. They are user-scoped (private) and deletable by the owner. Stored in `.project-memory/notes/`. No `index.yml` — notes are searched on demand via filesystem scan or MCP semantic search.

**Frontmatter (required):**
```yaml
---
id: NOTE-YYYY-MM-DD-short-slug
title: "Human-readable title"
tags: [optional, tags]
created_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
---

# Note

Free-form markdown body. Any content — design sketch,
plan draft, TODO list, reference, idea, personal reminder.
No structure enforced.
```

**Fields:**

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | `NOTE-YYYY-MM-DD-short-slug`, kebab-case |
| `title` | Yes | Human-readable, single line |
| `tags` | No | List of strings, for filtering |
| `created_by` | Yes | `{ name, email }` from git config (see templates/attribution.md) |
| `created_at` | Yes | Creation date |
| `updated_at` | Yes | Last modification date |

**What notes are NOT:**
- NOT project decisions — no ADR counterpart
- NOT collaborative — no sharing, no fork model
- NOT audited — no audit category
- NOT loaded at session start — passive, search-only
- NOT in any index file — filesystem scan or MCP semantic search

**Deletion:** Owner can delete a note at any time. Delete the file and drop the MCP index entry. No archive — deletion is permanent.

**MCP indexing:** Notes are indexed via `index_note` MCP tool. `search_memory` with `type_filter="note"` automatically applies `created_by_email` filter (user can only search their own notes). File system is source of truth; DB is derived read-optimized index.
