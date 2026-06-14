---
name: project-memory-conventions-discussions
description: Discussion lifecycle, relevancy scoring (25-55-10-10), expiry rules, and Pre-Implementation Gate integration.
---

# Discussions

Discussions capture exploratory conversations between the user and the LLM that may lead to decisions, phases, issues, or roadmap entries.

**Naming:** `DISCUSSION-YYYY-MM-DD-<short-slug>.md`
- Date first -- chronological sort order
- Slug describes the topic (e.g. `discussion-feature-design`, `auth-approach-debate`)
- Use kebab-case
- Example: `DISCUSSION-2026-06-11-discussion-feature-design.md`

**Frontmatter (required):**
See `templates.md` for the full schema. Key fields:
- `id`: unique identifier
- `status`: `open` (still active / can be resumed) or `concluded` (finished)
- `outcome.type`: `phase`, `decision`, `issue`, `roadmap`, or `none`
- `outcome.id`: the ID of the linked artifact (null for roadmap and none)

**Lifecycle:**
```
Trigger (explicit or implicit)
  -> Discussion Mode engages
      -> Load active instructions (same as Pre-Implementation Gate Step 0 in gates.md)
      -> LLM loads discussions/index.md for prior context
      -> Conversation proceeds
  -> Close discussion
      -> Apply Relevancy Scoring Gate (see below)
          explicit user save -> skip scoring, always write
          score < 60        -> silent drop; proceed to phase/decision if applicable
          score 60–80       -> ask user: "Do you think we should save this discussion?" (yes/no)
          score >= 80       -> auto-save
          safety rule hit   -> escalate to user (overrides silent drop)
      -> If saving: determine outcome type:
          phase -> offer to create phase
          decision -> offer to create DECISION file
          issue -> offer to create ISSUE file
          roadmap -> add entry to roadmap.md
          none -> just save the discussion
      -> Write DISCUSSION-YYYY-MM-DD-slug.md
      -> Add row to discussions/index.md
```

**Relevancy Scoring Gate:**

Score is computed at discussion close using four weighted criteria (100-point total):

| # | Criterion | Weight |
|---|-----------|--------|
| 1 | Conclusion reached (explicit rejection with reasoning counts) | 25 |
| 2 | Long-term impact on future decisions | 55 |
| 3 | Enough material to fill a discussion file | 10 |
| 4 | Enough material to fill a decision file | 10 |

**Thresholds:**

| Score | Action |
|-------|--------|
| < 60 | Silent drop — no file written |
| 60–80 | Escalate to user: "Do you think we should save this discussion?" (yes/no) |
| ≥ 80 | Auto-save — write file immediately |

**Safety rule:** If the long-term impact subscore (criterion 2) exceeds 75% of its maximum (i.e., > ~41/55), the discussion is always escalated to the user regardless of total score. This prevents silently dropping systemically important conversations that lack a formal conclusion.

**Long-term impact rubric** (for LLM scoring consistency):

| Score | Level | Examples |
|-------|-------|---------|
| 0–10 | Trivial/cosmetic | Separator line color, minor naming tweak |
| 10–25 | Local | Approach choice within a single module |
| 25–40 | Significant | Architectural decision affecting one domain |
| 40–55 | Systemic | Shapes how future decisions are made; cross-cutting concerns |

**Outcome chain** (when a discussion is saved, it must link to its downstream artifact):

```
discussion → decision (if conclusion without immediate implementation)
                └→ phase    (when decision is implemented later)
                └→ roadmap  (if decision is pending / no phase yet)

discussion → phase (if conversation leads directly to implementation)
```

**Resume:**
User says "continue discussion X" -> load the full DISCUSSION file -> continue conversation -> UPDATE the same file at close. Status remains `open` until conclusively finished. If the outcome changes on resume, update the frontmatter accordingly. On every resume update AND on close, append the current git identity to `contributors` (dedup by email).

**Expiry:**
Discussions with `outcome.type: none` AND `date` older than 30 days are expired:
1. Move the file from `discussions/` to `discussions/archive/`.
2. Remove its row from `discussions/index.md`.
3. Archived discussions are excluded from session-start loading and Pre-Implementation Gate scanning — accessible on explicit request only.

Discussions with any other outcome type (`phase`, `decision`, `issue`, `roadmap`) are never expired automatically regardless of age. The 30-day threshold is intentionally lenient; tighten in conventions.md if noise accumulates faster than expected.

**Pre-Implementation Gate integration:**
When the gate scans `decisions/index.md` for `touches` overlap, also scan `discussions/index.md` for discussions with outcome types that relate to the proposed implementation. If a past discussion explicitly concluded against the current direction, surface it as a directional conflict alongside decision conflicts.

**Discussion index maintenance:**
Same rules as `decisions/index.md`: add row on creation, update on conclusion, rows sorted newest first.
