# Convert Report-Only Audit Findings to Auto-Fix

Date: 2026-06-12
Status: Accepted

## Context and Problem Statement

The current audit severity model has a "report only" tier for low-severity findings and aged medium findings. These findings are shown every session but never resolved, causing repetitive noise and an ever-growing list.

## Considered Options

- Option A — Convert all report-only categories to auto-fix with deterministic actions
- Option B — Auto-suppress after first report by tracking seen findings
- Option C — Keep report-only but make them dismissible per session
- Option D — Remove low-severity categories entirely

## Decision Outcome

Chosen option: "Option A", because it directly solves the noise problem with safe, deterministic auto-fix actions per category. No new mechanisms needed — extends existing auto-fix pattern.

### Positive Consequences

- Session-start audit output is shorter and more actionable
- Report-only list no longer grows unboundedly
- All findings are either auto-fixed or enter interactive triage

### Negative Consequences

- Cat 12 auto-rename requires high-confidence threshold (same as flagging)
- Aged medium auto-fixes could mask genuinely stale content (mitigated by generous 3-day boundary)

## Pros and Cons of the Options

### Option A

+ Safe, deterministic auto-fix actions per category
+ No new mechanisms — extends existing auto-fix pattern
+ Eliminates noise completely
- Cat 12 tag rename requires confidence judgment (already built into flagging rule)

### Option B

+ Conservative — only suppresses, doesn't modify data
- Adds tracking complexity (new state file)
- Some findings should be fixed, not just hidden

### Option C

+ Gives user control per session
- Still requires user interaction
- Doesn't prevent accumulation across sessions

### Option D

+ Simplest — removes categories entirely
- Loses real drift detection value of Cat 3, 9, 12
- Not a fix, just an avoidance