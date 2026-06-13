---
name: project-memory-conventions-decisions
description: Decision lifecycle, ADR creation steps, touches field guidance, and decision resolution rules.
---

# Architectural Decision Records

Create when architecture changes, major dependencies are introduced, important tradeoffs are made, or a significant alternative was rejected.

**Naming:** `DECISION-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order in directory listings
- Slug describes the decision topic, not the outcome (e.g. `no-auth-profile-only`, `stop-failed-cancel-cancelled`)
- Use kebab-case
- Example: `DECISION-2026-06-06-no-auth-profile-only.md`

**Frontmatter (required):**
```yaml
---
id: DECISION-YYYY-MM-DD-short-slug
status: active | superseded | amended
provenance: directive | collaborative  # directive = user-imposed rule; collaborative = joint design
primary_scope: <category>           # auth, persistence, deployment, ui, schema, ...
touches: [entity1, entity2]         # concrete names — see Touches Field Guidance
supersedes: DECISION-YYYY-MM-DD-... # null if none
superseded_by: DECISION-YYYY-MM-DD-... # null if none; set when a later decision overrides this
adr_id: null                         # assigned integer (0001, 0002, ...) at write time; matches adr/ filename prefix
created_by:                          # required — see Author Attribution section below
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:                        # required — appended on status change
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
---
```

**Body:**
```md
# Context
# Alternatives Considered
  Option A — why rejected
  Option B — why rejected
# Decision
# Chosen Solution
# Reasoning
# Consequences
  Benefits / Tradeoffs / Future implications
```

Rejected alternatives are first-class content. Future agents need to know what was tried and why it didn't fit.

**After writing any DECISION file:**
0. Set `created_by` and seed `contributors` from current git identity (see Author Attribution section above). On a status change (`active → superseded` / `amended`), append the current identity to `contributors` of BOTH the new decision and the affected superseded decision; dedup by email.
1. Add a one-liner per rejected alternative to `project-memory.md` → Rejected Decisions. The DECISION file has the full reasoning; the summary entry is a one-line pointer (using the full DECISION-YYYY-MM-DD-slug identifier).
2. Add a row to `decisions/index.md` (see `templates.md`) — this is the file Claude loads at session start to surface active decisions during the Pre-Implementation Gate.
3. If `supersedes` is set, update the superseded file: change its `status` to `superseded` and set its `superseded_by` field. Move its row in `decisions/index.md` from the **Active** section to the **Superseded** section and update the Status cell. The index has two sections; only the Active section is scanned during the Pre-Implementation Gate.
4. **If `adr_enabled: true`** (or absent) in `.project-memory/config.yml`: create the corresponding `adr/` file — count existing `.md` files in `adr_dir` (from config, default `adr/`), assign next integer zero-padded to 4 digits, set `adr_id` in the DECISION frontmatter to that value, write `<adr_dir>/<adr_id>-<slug>.md` using the ADR file template from `templates.md`. **If `adr_enabled: false`**: skip this step; leave `adr_id: null` in the DECISION frontmatter.
5. If `supersedes` is set AND `adr_enabled: true`: also update the superseded DECISION's `adr/` counterpart — change its Status line to `Superseded by [NNNN-slug](NNNN-slug.md)`. If `adr_enabled: false`, skip.

**ADR Status mapping:**

| DECISION `status` | ADR file Status line |
|---|---|
| `active` | `Accepted` |
| `superseded` | `Superseded by [NNNN-slug](NNNN-slug.md)` |
| `amended` | `Amended by [NNNN-slug](NNNN-slug.md)` |

---

## Decision Resolution Rules

When more than one decision touches the same area, priority is determined in this order:

1. **Explicit supersession.** If decision B has `supersedes: A`, then A is `superseded` and B is the active record. Recency does not enter this case.
2. **Active conflict.** If two `active` decisions overlap (same `primary_scope` or intersecting `touches`) and their claims contradict, do NOT silently resolve. Surface both to the user and ask which holds, or whether one supersedes the other.
3. **Active refinement.** If two `active` decisions overlap but their claims do not contradict (one extends or details the other), both remain active. No question needed.
4. **Recency fallback.** Only used when no `supersedes` is set and no scope/touches overlap exists between candidates. This is the weakest signal — a recent unrelated decision must not override an older architectural one. Recency is a tiebreaker within the same active scope, never a rule that overrides explicit references.

`superseded` decisions remain in the index's **Superseded** section for historical context. Claude reads them as past state, not as active constraint. They are NOT loaded during Pre-Implementation Gate scanning — only on explicit historical lookup.

---

## Touches Field Guidance

The `touches` field is the primary axis for detecting decision intersections during the Pre-Implementation Gate. It must list **concrete entities** that a decision affects — not abstract categories.

Good entries: `user_id`, `auth_token`, `session_store`, `deployment_target`, `db_schema_users`, `frontend_router`, `electron_main_process`.

Avoid: `user` (too abstract — use `user_id`, `user_profile`, etc.), `auth` (use the concrete artifact: `auth_token`, `auth_middleware`), `system` (meaningless).

Rule of thumb: if you can't grep for the entity in code or config, it's too abstract.

When implementing a new feature, Claude lists the concrete entities the feature touches, then cross-references `decisions/index.md` against that list. Overlap = candidate. Directional conflict among candidates = batch question. Overlap without conflict = silent note.
