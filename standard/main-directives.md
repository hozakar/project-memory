---
name: project-memory-main-directives
description: Canonical per-turn directives for the standard profile. Single source of truth, mirrored verbatim into the host instructions file. Full procedures live in standard/gates.md.
---

# Main Directives (project-memory, standard profile)

Mirror the block below verbatim into the host instructions file, so the directives are present
on every turn including after context compaction. That file is the only layer re-injected every
turn independently of conversation history — the gates cannot carry these, because knowing a
gate exists depends on the context compaction removes.

Do not restate the directives anywhere else, and do not replace the block with a pointer to this
file: a pointer is present in context while the directives are not, which is the failure this
file exists to prevent.

Full procedures live in `standard/gates.md`.

<!-- BEGIN project-memory directives -->

- Before any significant implementation: run the Pre-Implementation Gate — load active instructions, then scan `.project-memory/decisions/index.md` (Active section plus every `Global: Yes` row) for conflicting decisions.
- The moment the user picks a direction among alternatives: write the DECISION record immediately, mid-turn. Do not defer it to turn end and do not ask permission.
- Before submitting a turn that included a commit: update `.project-memory/summaries/current-state.md` once, covering the turn's commits (and `summaries/roadmap.md` on scope change).
- Every turn, before acting: the active instructions must be in this turn's context. If you cannot see them, load them first — `search_memory(type_filter: "instruction", created_by_email: <your git email>)`, or scan `.project-memory/instructions/` for `state: active` — and treat every one as binding.

<!-- END project-memory directives -->

**Formatting is part of the contract.** One unwrapped line per directive, no bold markers, so
mirrors stay byte-comparable. Do not reflow or restyle — a cosmetic edit here silently
invalidates every mirror.

# Mirror Registry

When the block above changes, re-mirror every entry here in the same commit.

| Location | Notes |
|---|---|
| `AGENTS.md` → `## Turn Protocol — project-memory` | this repo's own wiring |
| `INSTALLATION.md` → Tier 2 block | shipped template |

Consuming projects add their own host instructions file as a further mirror. Those live outside
this repo and are the installing user's responsibility, which is why the shipped template states
the provenance requirement inline.

Verify from the repo root — both diffs must be silent:

```bash
sed -n '/BEGIN project-memory directives/,/END project-memory directives/p' \
    standard/main-directives.md | grep '^- ' > /tmp/pm-src.txt
sed -n '/Turn Protocol — project-memory/,/^If you edit/p' AGENTS.md | grep '^- ' > /tmp/pm-ag.txt
sed -n '/## project-memory turn protocol/,/^```$/p' INSTALLATION.md | grep '^- ' > /tmp/pm-inst.txt
diff /tmp/pm-src.txt /tmp/pm-ag.txt && diff /tmp/pm-src.txt /tmp/pm-inst.txt && echo "mirrors OK"
```
