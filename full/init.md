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
├── instructions/
├── eras/
├── maintainers.md
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

**`.project-memory/config.yml`** — skill configuration. Always start with the profile block at the top:

```yaml
profile: full

profile_history:
  - profile: full
    effective_date: <today YYYY-MM-DD>
    reason: initial
```

Then ask the user:

> "Do you want ADR (Architecture Decision Record) support? (y/n)"

- **If yes:** Ask "Where should ADR files be stored? (default: `adr/`)" — accept their answer or use the default. Create that directory in the project root. Append to `config.yml`:
  ```yaml
  adr_enabled: true
  adr_dir: <chosen path>
  ```
- **If no:** Append to `config.yml`:
  ```yaml
  adr_enabled: false
  ```
  Do NOT create an `adr/` directory. `adr_dir` is omitted when ADR is disabled.

ADR support can be toggled at any time by editing `config.yml`. See `audit.md` Cat 8 for behavior when re-enabling on an existing project.

**All summaries** — create with a stub header and `Last Updated: <today>`. Use the templates in `.claude/skills/project-memory/templates.md` for section headings. Do not fill in content yet; wait until you have enough context from the session to write something meaningful.

**`maintainers.md`** — create with the current user's email as the first maintainer. Run `git config user.email`. If it returns a value, write:
```yaml
maintainers:
  - email: "<user email>"
```
If git email is not configured, write a placeholder that can be edited later:
```yaml
maintainers: []
```

**`.gitignore`** — Add `.project-memory/vector-index` to the project's `.gitignore`.
Check if `.gitignore` already contains this entry before appending. If `.gitignore`
does not exist, create it. The vector index is a binary LanceDB artifact generated
by the MCP companion server — it is always regenerable and must not be tracked in git.

**Auto-load reminder** — Do NOT write to CLAUDE.md, AGENTS.md, or any other
config file. Instead, print this message to the user:

```
[ℹ] To make sure I load at the start of every session, add this line to your
    global instructions file (CLAUDE.md, GEMINI.md, User Rules, etc.):

      "At the start of every session, load the project-memory skill from
       <path-to-skill>/SKILL.md and follow its on-load instructions."

    Not sure where your global instructions file is?
    → See INSTALLATION.md for platform-specific instructions.
```

Only show this message on first run (i.e., only during this initialization
flow). Do not repeat it on subsequent sessions.

After creating the structure, create the first phase directory for whatever work is about to begin. Read `.claude/skills/project-memory/templates.md` for all file formats and field definitions before creating phase files.

6. Check if MCP companion server should be offered: if `mcp-server/` directory exists, read `mcp-server/INSTALL.md` and follow its "For the LLM" section to detect platform and offer installation. Set `mcp_install_offered_for_version` in config.yml after offer is made (regardless of user response).

7. **Git identity advisory (non-blocking).** Run `git config user.name` and `git config user.email`. If either is empty or the command fails, print:
   ```
   [ℹ] Git identity not configured — project-memory records will be attributed to "unknown".
       To enable attribution, run:
         git config --global user.name "Your Name"
         git config --global user.email "you@example.com"
   ```
   Installation proceeds normally either way. Never block, never prompt, never escalate. See `conventions.md` → Author Attribution for the soft-fail rule.

Output:
```
[✅] .project-memory/ initialized — first run detected.
```