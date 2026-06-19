#!/usr/bin/env python3
"""
Validate generated .project-memory/ fixture files against expected schema.

Usage:
  python stress-test/validate_schema.py <generated-dir>
  python stress-test/validate_schema.py .   # validates the live repo

Exit 0 = all files valid. Exit 1 = schema errors found.
"""
import sys
import yaml
from pathlib import Path

PHASE_REQUIRED = {"id", "title", "started_at", "status", "commits", "tags", "created_by"}
PHASE_VALID_STATUSES = {"planning", "in_progress", "completed", "abandoned"}
DECISION_REQUIRED = {"id", "status", "primary_scope"}
DISCUSSION_REQUIRED = {"id", "title", "date", "status", "summary", "conclusion", "outcome", "tags", "created_by"}


def extract_frontmatter(path: Path) -> dict | None:
    # utf-8-sig strips UTF-8 BOM automatically (common on Windows-authored files)
    text = path.read_text(encoding="utf-8-sig")
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None
    end = next((i for i, ln in enumerate(lines[1:], 1) if ln.strip() == "---"), None)
    if end is None:
        return None
    return yaml.safe_load("\n".join(lines[1:end]))


def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "stress-test/generated")
    pm = root / ".project-memory"
    if not pm.exists():
        print(f"ERROR: {pm} does not exist — run generate.py first.", file=sys.stderr)
        sys.exit(1)

    errors: list[str] = []

    # --- Phases ---
    phases_dir = pm / "phases"
    if phases_dir.exists():
        for phase_dir in phases_dir.iterdir():
            if not phase_dir.is_dir():
                continue
            yml = phase_dir / "phase.yml"
            if not yml.exists():
                errors.append(f"MISSING_FILE: {phase_dir.name}/phase.yml")
                continue
            try:
                data = yaml.safe_load(yml.read_text(encoding="utf-8"))
            except yaml.YAMLError as e:
                errors.append(f"YAML_ERROR {phase_dir.name}/phase.yml: {e}")
                continue
            missing = PHASE_REQUIRED - set(data.keys())
            if missing:
                errors.append(f"MISSING_FIELDS {phase_dir.name}/phase.yml: {sorted(missing)}")
            if data.get("status") not in PHASE_VALID_STATUSES:
                errors.append(f"INVALID_STATUS {phase_dir.name}/phase.yml: '{data.get('status')}'")
            # Detect duplicate keys (PyYAML silently overwrites — use raw text check)
            raw_keys = [ln.split(":")[0].strip() for ln in yml.read_text(encoding="utf-8").splitlines()
                        if ln and not ln.startswith(" ") and ":" in ln and not ln.startswith("#") and not ln.startswith("-")]
            dupes = [k for k in set(raw_keys) if raw_keys.count(k) > 1]
            if dupes:
                errors.append(f"DUPLICATE_KEYS {phase_dir.name}/phase.yml: {dupes}")

    # --- Decisions ---
    decisions_dir = pm / "decisions"
    if decisions_dir.exists():
        for f in sorted(decisions_dir.glob("DECISION-*.md")):
            try:
                fm = extract_frontmatter(f)
            except yaml.YAMLError as e:
                errors.append(f"YAML_ERROR {f.name}: {e}")
                continue
            if fm is None:
                errors.append(f"NO_FRONTMATTER {f.name}")
                continue
            missing = DECISION_REQUIRED - set(fm.keys())
            if missing:
                errors.append(f"MISSING_FIELDS {f.name}: {sorted(missing)}")

    # --- Discussions ---
    discussions_dir = pm / "discussions"
    if discussions_dir.exists():
        for f in sorted(discussions_dir.glob("DISCUSSION-*.md")):
            try:
                fm = extract_frontmatter(f)
            except yaml.YAMLError as e:
                errors.append(f"YAML_ERROR {f.name}: {e}")
                continue
            if fm is None:
                errors.append(f"NO_FRONTMATTER {f.name}")
                continue
            missing = DISCUSSION_REQUIRED - set(fm.keys())
            if missing:
                errors.append(f"MISSING_FIELDS {f.name}: {sorted(missing)}")

    # --- Report ---
    n_phases = len([d for d in phases_dir.iterdir() if d.is_dir()]) if phases_dir.exists() else 0
    n_decisions = len(list(decisions_dir.glob("DECISION-*.md"))) if decisions_dir.exists() else 0
    n_discussions = len(list(discussions_dir.glob("DISCUSSION-*.md"))) if discussions_dir.exists() else 0

    if errors:
        print(f"VALIDATION FAILED: {len(errors)} error(s) in {root}")
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"OK: {n_phases} phases, {n_decisions} decisions, {n_discussions} discussions — all valid")


if __name__ == "__main__":
    main()
