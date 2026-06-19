import re
import pathlib
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
