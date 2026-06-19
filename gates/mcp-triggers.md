---
name: project-memory-gates-mcp-triggers
description: MCP index triggers for decision creation, discussion close, and phase events. Shared across full and lite profiles.
---

# Decision Creation — MCP Index Trigger

When a `DECISION-*.md` file is created or its `status` field changes (e.g. `active → superseded`):

**Author attribution:** On initial write, set `created_by` and seed `contributors` from the current git identity. On status change, append the current identity to `contributors` of the changed decision AND any decision it supersedes / amends (dedup by email). See `conventions.md` → Author Attribution.

**If `index_decision` is in available tools (see `mcp-integration.md`):**
Call `index_decision({ id, title, status, context: context_section[:1000], decisionBody: combined_decision_and_chosen_solution_sections[:1000], touches, created_by, contributors })`.
This is best-effort — if the call fails, continue. The file write already completed.

Re-call on every status change. The tool upserts by ID, so repeated calls are safe.

**Lite note:** Lite does not track `contributors`. The `created_by` field is set; `contributors` is omitted in `index_decision` calls under lite.

---

# Discussion Close — MCP Index Trigger

When a `DISCUSSION-*.md` file is written and added to `discussions/index.md` (at discussion close or on resume/update):

**Author attribution:** On initial write, set `created_by` and seed `contributors`. On resume update and on close, append the current git identity to `contributors` (dedup by email).

**If `index_discussion` is in available tools (see `mcp-integration.md`):**
Call `index_discussion({ id, title, status, outcome, tags, summary: one-line summary from discussions/index.md row, bodyText: first 2000 chars of the DISCUSSION-*.md body, created_by, contributors })`.
This is best-effort — if the call fails, continue. The file write already completed.

Re-call on any update (status open → concluded, or body changed). The tool upserts by ID, so repeated calls are safe.

---

# Phase Index Triggers

**On phase open:** Call `index_phase` per the Phase Creation section in `gates/lifecycle.md`. Full sends `planText`, `implementationText`, `created_by`, `contributors`. Lite sends same but `implementationText` is always empty.

**On phase close:** Call `index_phase` per the End-of-Phase Maintenance section in `gates/close.md`. Full sends full content including commitDiffs. Lite sends what's available.
