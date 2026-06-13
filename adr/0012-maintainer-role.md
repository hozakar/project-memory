# ADR 0012 — Maintainer Role for Era Decision Gating

Date: 2026-06-13
Status: Accepted

## Context and Problem Statement

Era creation currently prompts every user when ~10 phases accumulate since the last era. In multi-user projects, this creates noise for developers who shouldn't be making era decisions. The system needs a lightweight mechanism to identify which users should receive era-creation prompts — without building a full access-control system.

Git already controls push permissions. The goal is signal management, not security.

## Considered Options

- Option A — Three-role model with "last owner commit" as source of truth. Owner/maintainer/developer. Tamper-proof via git log. Rejected: excessive complexity. Owner transfer deadlock. "Last commit" source of truth creates confusion when file on disk differs from effective state.
- Option B — INSTRUCTION-based role claim. Each user declares their role via an INSTRUCTION file. Rejected: self-declaration is unreliable; no way to prevent everyone from claiming maintainer.
- Option C — Two-role flat file, anyone can edit. Chosen.

## Decision Outcome

Chosen option: "Option C — Two-role flat file, anyone can edit", because simplicity is the primary virtue and git already controls push permissions.

### Implementation

- `maintainers.md` — flat YAML file listing maintainer emails. Anyone can edit. No owner role, no tamper-proofing.
- Session-start: `git config user.email` → if in maintainers.md → maintainer; else → developer.
- Only gated action: era creation prompt. Maintainers receive it, developers do not.
- All other operations (audit, reading, editing, phase management) remain unrestricted.
- init.md auto-adds the initializing user to maintainers.md.

### Positive Consequences

- Clean signal: only maintainers see era prompts
- Zero friction for developers
- No deadlock scenarios (anyone can self-promote if needed)
- Minimal implementation surface area

### Negative Consequences

- No tamper-proofing (accepted tradeoff)
- Slight increase in session-start complexity (one file read + email check)
