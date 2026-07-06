---
name: project-memory-conventions-discussions
description: Discussion lifecycle, loss-heuristic gate, expiry rules, and Pre-Implementation Gate integration.
---

# Discussions

Discussions capture exploratory conversations between the user and the LLM that may lead to decisions, issues, or roadmap entries.

**Naming:** `DISCUSSION-YYYY-MM-DD-<short-slug>.md`
- Date first -- chronological sort order
- Slug describes the topic (e.g. `discussion-feature-design`, `auth-approach-debate`)
- Use kebab-case
- Example: `DISCUSSION-2026-06-11-discussion-feature-design.md`

**Frontmatter (required):**
See `templates.md` for the full schema. Key fields:
- `id`: unique identifier
- `status`: `open` (still active / can be resumed) or `concluded` (finished)
- `outcome.type`: `decision`, `issue`, `roadmap`, or `none` — plus the legacy type `phase` (existing files only; see `templates/discussions.md` → Backward compatibility)
- `outcome.id`: the ID of the linked artifact (null for roadmap and none)

**Lifecycle:**
```
Trigger (explicit or implicit)
  -> Discussion Mode engages
      -> Load active instructions (same as GATE 0 in gates/implementation.md)
      -> Find prior discussions:
           - MCP available: `search_memory(query="<topic keywords>", type="discussion", top_k=5)` — semantically relevant discussions returned in `body` field.
           - MCP unavailable: load `discussions/index.md`; read entries matching topic by title/tags; open the 2–3 most relevant DISCUSSION-*.md files.
      -> Conversation proceeds
  -> Close discussion
      -> Apply Loss Heuristic Gate (see below)
          explicit user save   -> always write
          concrete loss answer -> auto-save
          vague / no loss      -> silent drop; proceed to decision if applicable
          razor-thin           -> ask user: "Worth saving? (yes/no)"
      -> If saving: determine outcome type:
          decision -> offer to create DECISION file; set `spawned_from_discussion: <this-discussion-id>` in the DECISION frontmatter;
                      then ask once: "Does this decision need implementing? (add to roadmap / skip)"
          issue    -> offer to create ISSUE file
          roadmap  -> add entry to roadmap.md
          none     -> just save the discussion
      -> Write DISCUSSION-YYYY-MM-DD-slug.md
      -> Add row to discussions/index.md
```

**Loss Heuristic Gate:**

At discussion close, answer this question internally:

> "If this discussion is never saved, what specifically goes wrong in a future session?"

Evaluate the answer:

| Answer type | Action |
|-------------|--------|
| Concrete scenario (see examples below) | Auto-save |
| Vague, uncertain, or borderline | Silent drop (default when in doubt) |
| Razor-thin — nearly concrete but genuinely unresolvable | Ask user: "Worth saving? (yes/no)" |

**Explicit user save request → always write, skip gate.**

**Concrete scenarios (auto-save):**
- A future session would re-ask the same question and re-litigate the same ground
- A rejected alternative would look attractive again without the reasoning that ruled it out
- The reasoning behind a choice is invisible in the code — someone would wonder "why not X?"
- A constraint, trade-off, or external factor shaped the outcome and isn't recorded elsewhere

**Vague / drop scenarios:**
- "It was a good discussion" — without a concrete consequence of losing it
- The outcome is fully captured in a DECISION file — the discussion adds no new reasoning
- The topic is trivial or cosmetic; re-discovering it costs nothing
- Uncertain which tier applies — default to drop, not escalate

**Calibration rule:** If you find yourself reaching "ask user" more than once every 10 discussions, your razor-thin threshold is too loose — recalibrate toward drop. Uncertainty alone is not a reason to escalate; the loss heuristic should resolve almost all cases on its own.

**Outcome chain** (when a discussion is saved, it must link to its downstream artifact):

```
discussion → decision (outcome.type: decision, outcome.id: DECISION-slug)
    DECISION.spawned_from_discussion = this discussion's id
                └→ roadmap  (roadmap entry points to DECISION-slug; implementation scheduled later)
```

Traceability rules:
- `discussion.outcome.id` → always points forward to the artifact the discussion spawned.
- `DECISION.spawned_from_discussion` → points back to the discussion that created it; null if decision was opened standalone.

**Resume:**
User says "continue discussion X" -> load the full DISCUSSION file -> continue conversation -> UPDATE the same file at close. Status remains `open` until conclusively finished. If the outcome changes on resume, update the frontmatter accordingly. On every resume update AND on close, append the current git identity to `contributors` (dedup by email).

**Expiry:**
Discussions with `outcome.type: none` AND `date` older than 30 days are expired:
1. Move the file from `discussions/` to `discussions/archive/`.
2. Remove its row from `discussions/index.md`.
3. Archived discussions are excluded from session-start loading and Pre-Implementation Gate scanning — accessible on explicit request only.

Discussions with any other outcome type (`decision`, `issue`, `roadmap`) are never expired automatically regardless of age. The 30-day threshold is intentionally lenient; tighten in conventions.md if noise accumulates faster than expected.

**Pre-Implementation Gate integration:**
When the gate scans `decisions/index.md` for `touches` overlap, also scan `discussions/index.md` for discussions with outcome types that relate to the proposed implementation. If a past discussion explicitly concluded against the current direction, surface it as a directional conflict alongside decision conflicts.

**Discussion index maintenance:**
Same rules as `decisions/index.md`: add row on creation, update on conclusion, rows sorted newest first.
