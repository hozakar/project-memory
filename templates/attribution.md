---
name: project-memory-templates-attribution
description: Shared Author Attribution schema (created_by, contributors) referenced by all record templates. Full attribution rules live in conventions/maintainer.md.
---

# Author Attribution Fields

The `created_by` and `contributors` fields are **required** on phase / decision / discussion / issue records. Full rules are in `conventions.md` → Author Attribution. This file covers the schema only.

**Shape:**
```yaml
created_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
```

**Sentinel for missing git identity:** `{ name: "unknown", email: "unknown" }`. Used when `git config user.name` or `git config user.email` is empty. No user escalation.

**Dedup rule:** Same email is never added twice to `contributors`.

**`contributors` growth triggers (per record type):**

| Record     | Triggers that append the current identity to `contributors` |
|------------|-------------------------------------------------------------|
| phase      | first or substantive write of `implementation.md` / `review-and-fixes.md` / `followup.md`; phase close (status: completed) |
| decision   | initial write; status change (active → superseded / amended) |
| discussion | initial write; resume update; close (status: concluded) |
| issue      | initial write; status change (open → closed) |

**Profile scope:**
- `full`: both `created_by` and `contributors` required.
- `lite`: only `created_by` required; `contributors` omitted.
- `minimal`: neither field used.

**Out of scope (do NOT add these fields):** `era-*.md`, `summaries/*.md`, `MEMORY.md`, `adr/NNNN-*.md`, all index files (`phases/index.yml`, `decisions/index.md`, `discussions/index.md`).
