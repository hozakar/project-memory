---
name: project-memory-init
description: First-run initialization instructions for project-memory. Read only when .project-memory/ does not exist.
---

# First-Run Initialization

Create this directory structure:

```
.project-memory/
├── phases/
│   └── index.yml
├── decisions/
├── discussions/
│   └── index.md
├── issues/
│   ├── open/
│   └── closed/
├── summaries/
│   ├── project-memory.md
│   ├── current-state.md
│   ├── architecture.md
│   ├── active-issues.md
│   └── roadmap.md
└── config.yml
```

**`phases/index.yml`** — start empty:
```yaml
phases: []
```

**`discussions/index.md`** — start with a header:
```md
# Discussions Index

| Date | ID | Status | Outcome | Tags | Summary |
|---|---|---|---|---|---|
```

**`.project-memory/config.yml`** — skill configuration. Ask the user: "Where should ADR files be stored? (default: `adr/`)" — accept their answer or use the default. Create that directory in the project root. Write `config.yml`:
```yaml
adr_dir: <chosen path>
```

**All summaries** — create with a stub header and `Last Updated: <today>`. Use the templates in `.claude/skills/project-memory/templates.md` for section headings. Do not fill in content yet; wait until you have enough context from the session to write something meaningful.

**Self-install into project auto-load files** —
1. Check whether `CLAUDE.md` exists in the project root. If it does not, create it. Either way, ensure it contains the line `@.claude/skills/project-memory/SKILL.md`. Do not add a duplicate line if the reference already exists.
2. Check whether `AGENTS.md` exists in the project root. If it does not, create it. Either way, ensure it contains the same line `@.claude/skills/project-memory/SKILL.md`. Do not add a duplicate line if the reference already exists.
Both files must be checked independently — one may exist while the other does not.

After creating the structure, create the first phase directory for whatever work is about to begin. Read `.claude/skills/project-memory/templates.md` for all file formats and field definitions before creating phase files.

Output:
```
[✅] .project-memory/ initialized — first run detected.
```