---
name: project-memory-templates-assignments
description: Templates for ASSIGNMENT records and assignments/index.yml. Cross-user task delegation with session-start notifications. Author Attribution schema in templates-attribution.md.
---

# Assignment Templates

## ASSIGNMENT-YYYY-MM-DD-slug.md

Assignment records capture cross-user task delegation with persistent session-start notifications. Stored in `.project-memory/assignments/`.

**Frontmatter (required):**
```yaml
---
id: ASSIGNMENT-YYYY-MM-DD-short-slug
status: pending | accepted | rejected | ongoing | completed
type: direct | freeform

assigned_to:
  name: "Mehmet Yilmaz"
  email: "mehmet@example.com"
assigned_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
assigned_at: YYYY-MM-DD

# Direct assignment — linked to existing record
target_type: issue | phase | discussion | roadmap_item | null
target_id: ISSUE-YYYY-MM-DD-slug | null

# Freeform assignment — standalone task
description: null            # required for freeform, optional for direct

# Rejection
rejected_at: null
rejection_reason: null

# Completion
completed_at: null
completion_note: null
completed_phase_id: null
completed_decision_id: null
completed_discussion_id: null

# Reminder tracking
remind_count: 0
last_reminded_at: null

# Attribution
created_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
---
```

**Body:**
```md
# Task Description
<For direct: summary of the target record>
<For freeform: the full task description, context, and expectations>

# Target
<For direct: link and key details from the target file>
<For freeform: "Freeform assignment — no linked record.">
```

**Naming:** `ASSIGNMENT-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order
- Slug describes the task topic (e.g. `mehmet-review-auth`, `ahmet-payment-research`)
- Use kebab-case
- Example: `ASSIGNMENT-2026-06-14-mehmet-review-auth-bug.md`

**State machine:**
```
pending → accepted → ongoing → completed
pending → rejected → (assigner loop: assign to another / do it yourself / remind me later)
pending → remind me later → pending (remind_count incremented)
rejected → assign to another → new ASSIGNMENT (new ID)
rejected → do it yourself → completed (by assigner)
rejected → remind me later → pending (remind_count++)
```

**Completion rules:**
- Only the assignee can mark `completed` (assigner uses "Do It Yourself" to close from their side)
- At least one evidence field required: `completion_note`, `completed_phase_id`, `completed_decision_id`, or `completed_discussion_id`
- `completed_at` set when status transitions to `completed`

**Session-start discovery:**
- MCP: `search_memory` with `assigned_to_email` filter for pending/accepted/ongoing assignments; `assigned_by_email` filter for rejected/completed notifications
- Fallback: directory scan of `.project-memory/assignments/` filtered by frontmatter `assigned_to.email` / `assigned_by.email`

**Author attribution:** Set `created_by` (assigned_by identity) and seed `contributors` on creation. Append current git identity to `contributors` on status change and on completion (dedup by email). Full rules: `conventions.md` → Author Attribution. Schema: `templates-attribution.md`.

## assignments/index.yml

One-row-per-assignment summary table. Loaded at session start. Rows sorted newest first.

```yaml
# Assignments Index
# Rows sorted newest first.

assignments:
  - id: ASSIGNMENT-2026-06-14-mehmet-review-auth
    status: pending
    type: direct
    assigned_to: "Mehmet Yilmaz <mehmet@example.com>"
    assigned_by: "Hakan Ozakar <hozakar@gmail.com>"
    target: "ISSUE-2026-06-14-auth-bug"
    assigned_at: 2026-06-14
    completed_at: null
```

**Maintenance rules:**
- Every new `ASSIGNMENT-*.md` file gets a row added at the top (newest first).
- Status updated on every state transition.
- Rows never deleted — completed and rejected assignments remain for history.
