import re
import pathlib
from datetime import date
import yaml
import pytest


def parse_frontmatter(text: str) -> dict:
    """Parse YAML frontmatter between --- markers using yaml.safe_load."""
    if not text.startswith("---"):
        return {}
    try:
        end = text.index("---", 3)
    except ValueError:
        return {}
    fm_text = text[3:end].strip()
    try:
        return yaml.safe_load(fm_text) or {}
    except yaml.YAMLError:
        return {}


def pm(generated: pathlib.Path) -> pathlib.Path:
    return generated / ".project-memory"


def test_config(generated):
    config = pm(generated) / "config.yml"
    assert config.exists(), "config.yml missing"
    data = yaml.safe_load(config.read_text())
    assert "profile" in data, "config.yml missing 'profile'"
    assert "adr_enabled" in data, "config.yml missing 'adr_enabled'"


def test_summaries(generated):
    for name in ("roadmap.md", "current-state.md"):
        f = pm(generated) / "summaries" / name
        assert f.exists(), f"summaries/{name} missing"
        assert f.read_text().startswith("# "), f"summaries/{name} must start with '# ' heading"


def test_phases_index(generated):
    index = pm(generated) / "phases" / "index.yml"
    assert index.exists(), "phases/index.yml missing"
    data = yaml.safe_load(index.read_text())
    assert isinstance(data, dict), "phases/index.yml must be a YAML mapping"
    assert "phases" in data, "phases/index.yml missing 'phases' key"
    phases = data["phases"]
    assert isinstance(phases, list), "phases must be a list"
    assert len(phases) >= 1, "phases list is empty"
    for p in phases:
        for field in ("id", "title", "status", "started_at"):
            assert field in p, f"Phase index entry missing '{field}': {p}"


def test_phase_dirs(generated):
    index = pm(generated) / "phases" / "index.yml"
    data = yaml.safe_load(index.read_text())
    phases_root = pm(generated) / "phases"
    for p in data["phases"]:
        phase_dir = phases_root / p["id"]
        assert phase_dir.is_dir(), f"Phase directory missing: {p['id']}"
        assert (phase_dir / "phase.yml").exists(), f"phase.yml missing for {p['id']}"


def test_phase_yml_fields(generated):
    index = pm(generated) / "phases" / "index.yml"
    data = yaml.safe_load(index.read_text())
    phases_root = pm(generated) / "phases"
    required = ("id", "title", "status", "started_at", "closed_at", "commits", "tags", "summary")
    for p in data["phases"]:
        yml = yaml.safe_load((phases_root / p["id"] / "phase.yml").read_text())
        for field in required:
            assert field in yml, f"{p['id']}/phase.yml missing '{field}'"
        assert isinstance(yml["started_at"], date), (
            f"{p['id']}: started_at is not a date: {yml['started_at']!r}"
        )


def test_phase_id_format(generated):
    index = pm(generated) / "phases" / "index.yml"
    data = yaml.safe_load(index.read_text())
    pattern = re.compile(r"^phase-\d{8}-.+$")
    for p in data["phases"]:
        assert pattern.match(p["id"]), f"Phase ID bad format: {p['id']!r}"


def test_decisions_files(generated):
    decisions_dir = pm(generated) / "decisions"
    files = list(decisions_dir.glob("DECISION-*.md"))
    assert len(files) >= 1, "No DECISION-*.md files found in decisions/"


def test_decision_frontmatter(generated):
    decisions_dir = pm(generated) / "decisions"
    required = ("id", "title", "date", "status", "provenance", "touches")
    for f in decisions_dir.glob("DECISION-*.md"):
        fm = parse_frontmatter(f.read_text())
        for field in required:
            assert field in fm, f"{f.name}: frontmatter missing '{field}'"
        assert fm["status"] == "active", (
            f"{f.name}: expected status 'active', got {fm['status']!r}"
        )


def test_decision_id_format(generated):
    decisions_dir = pm(generated) / "decisions"
    pattern = re.compile(r"^DECISION-\d{4}-\d{2}-\d{2}-.+$")
    for f in decisions_dir.glob("DECISION-*.md"):
        fm = parse_frontmatter(f.read_text())
        assert "id" in fm, f"{f.name}: no 'id' in frontmatter"
        assert pattern.match(fm["id"]), f"Decision ID bad format: {fm['id']!r}"


def test_decisions_index(generated):
    index = pm(generated) / "decisions" / "index.md"
    assert index.exists(), "decisions/index.md missing"
    assert "| Date |" in index.read_text(), "decisions/index.md missing header row"
