---
name: project-memory-conventions-decisions
description: Decision lifecycle, ADR creation steps, touches field guidance, and decision resolution rules.
---

# Architectural Decision Records

**Profile scope:**
|- `standard` — DECISION files + `decisions/index.md` + optional ADR mirror (gated by `adr_enabled` flag in `config.yml`).
|- `minimal` — this file does not apply. Decisions are appended as single-line rows in `MEMORY.md → ## Decisions` per `minimal/minimal.md`. ADR mirror does not apply (no DECISION files are created).

The rules below describe `standard` behavior. Under `minimal`, this file does not apply.

---

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
supersedes:
  - DECISION-YYYY-MM-DD-... # null if none
superseded_by: DECISION-YYYY-MM-DD-... # null if none; set when a later decision overrides this
applies_globally: false              # default false; true = cross-cutting policy surfaced at every Pre-Implementation Gate regardless of touches overlap. See Decision Resolution Rules → Rule 0 (Global surface) and "When to use applies_globally: true" below.
adr_id: null                         # assigned integer (0001, 0002, ...) at write time; matches adr/ filename prefix
spawned_from_discussion: null        # DISCUSSION-YYYY-MM-DD-slug that led to this decision; null if not discussion-driven
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
1. Add a row to `decisions/index.md` (see `templates/index.md`) — this is the file Claude loads at session start to surface active decisions during the Pre-Implementation Gate.
2. If `supersedes` is set, update the superseded file: change its `status` to `superseded` and set its `superseded_by` field. Move its row in `decisions/index.md` from the **Active** section to the **Superseded** section and update the Status cell. The index has two sections; only the Active section is scanned during the Pre-Implementation Gate.
3. **If `adr_enabled: true`** (absent → defaults to `false` for standard profile) in `.project-memory/config.yml`: create the corresponding `adr/` file — count existing `.md` files in `adr_dir` (from config, default `adr/`), assign next integer zero-padded to 4 digits, set `adr_id` in the DECISION frontmatter to that value, write `<adr_dir>/<adr_id>-<slug>.md` using the ADR file template from `templates/index.md`. **If `adr_enabled: false`**: skip this step; leave `adr_id: null` in the DECISION frontmatter.
4. If `supersedes` is set AND `adr_enabled: true`: also update the superseded DECISION's `adr/` counterpart — change its Status line to `Superseded by [NNNN-slug](NNNN-slug.md)`. If `adr_enabled: false`, skip.
5. **Implementation offer:** After completing steps 0–4, if the decision entails concrete implementation work (new feature, schema migration, deployment change, etc.), ask once: *"Does this decision need implementing? (add to roadmap / skip)"*
   - `add to roadmap` → add a roadmap entry in `summaries/roadmap.md` with a pointer to this decision ID.
   - `skip` → no action.
   Skip this step entirely if: (a) the decision is purely directive/policy (no code change expected), or (b) `spawned_from_discussion` is set and the originating discussion already handled the implementation offer.

**ADR Status mapping:**

| DECISION `status` | ADR file Status line |
|---|---|
| `active` | `Accepted` |
| `superseded` | `Superseded by [NNNN-slug](NNNN-slug.md)` |
| `amended` | `Amended by [NNNN-slug](NNNN-slug.md)` |

---

## Decision Resolution Rules

When more than one decision touches the same area, priority is determined in this order:

0. **Global surface.** Active decisions with `applies_globally: true` are surfaced at every Pre-Implementation Gate evaluation regardless of `touches` overlap. They represent cross-cutting policies (language, attribution, gate behavior, security) that bind every implementation. This rule governs **surfacing**, not priority — once surfaced, globals follow rules 1–4 below for precedence against other surfaced rules. See `DECISION-2026-06-17-global-scope-decisions` for the full rationale.

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

---

## When to use `applies_globally: true`

Use `applies_globally: true` when the rule binds **every** implementation regardless of which entities are touched. Such rules cannot list a finite, stable set of `touches` because their scope is the entire project surface.

**Good candidates for `applies_globally: true`:**
- Language / formatting / encoding policies (e.g. skill files English-only).
- Attribution requirements (`created_by`, `contributors` on every record).
- Gate-behavior rules (instruction re-injection, contradiction detection protocol).
- Security / secrets handling rules.
- Provenance / universal frontmatter field rules.

**Not appropriate for `applies_globally: true`:**
- Subsystem-specific rules (e.g. "the auth module uses X" → enumerate concrete touches).
- Feature behavior rules (e.g. "audit accepts implicit triggers" → bind to the feature's concrete files).
- Repository-specific operational decisions.

Rule of thumb: if you can list a finite, grep-able set of touched entities, use `touches`. If the rule applies to "everything we ever write" by its nature, use `applies_globally: true`. Misuse (marking too many decisions global) dilutes the gate signal — be conservative.

Once marked global, the decision must also be reflected in `decisions/index.md` with `Yes` in the `Global` column. The gate's globals scan reads the index, not individual frontmatters.
