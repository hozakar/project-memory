# Installation Guide

This guide explains how to make me available **globally** — across all your
projects — on the most popular AI coding platforms.

For per-project installation (one project only), see [README.md](README.md).

---

## How global installation works

Every platform has a way to give your AI assistant persistent instructions that
apply to every session. Global installation means:

1. **Put my files somewhere central** — a single location on your machine
2. **Tell your agent where I am** — one line in your global instructions file

From that point on, I'm available in every project without copying anything.

---

## Claude Code

**Recommended skill location:** `~/.claude/skills/project-memory/`

```bash
git clone <repo-url> ~/.claude/skills/project-memory
```

Then add this to your global `~/.claude/CLAUDE.md` (create it if it doesn't exist):

```markdown
At the start of every session, load the project-memory skill from
~/.claude/skills/project-memory/SKILL.md and follow its on-load instructions.
```

**That's it.** Every new Claude Code session in any project will load me
automatically.

> **Enterprise-wide installation:**
> - macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`
> - Linux: `/etc/claude-code/CLAUDE.md`
> - Windows: `C:\ProgramData\ClaudeCode\CLAUDE.md`

---

## Gemini CLI

**Recommended skill location:** `~/.gemini/skills/project-memory/`

```bash
git clone <repo-url> ~/.gemini/skills/project-memory
```

Add this to your global `~/.gemini/GEMINI.md` (create it if it doesn't exist):

```markdown
At the start of every session, read ~/.gemini/skills/project-memory/SKILL.md
and follow its on-load instructions.
```

Gemini CLI discovers `GEMINI.md` files hierarchically — the `~/.gemini/GEMINI.md`
file applies to all projects.

---

## Cursor

**Recommended skill location:** `~/.cursor/skills/project-memory/`

```bash
git clone <repo-url> ~/.cursor/skills/project-memory
```

Open **Cursor Settings** → **Rules** → **User Rules** and add:

```
At the start of every session, read the file at
~/.cursor/skills/project-memory/SKILL.md and follow its on-load instructions.
```

User Rules in Cursor are global — they apply to every project you open.

> **Alternative (project-level):** Create `.cursor/rules/project-memory.mdc`
> in your project with the same directive. Version-controlled and team-shared.

---

## Windsurf

**Recommended skill location:** `~/.windsurf/skills/project-memory/`

```bash
git clone <repo-url> ~/.windsurf/skills/project-memory
```

In Windsurf, open the **Cascade** panel → **Customizations** icon (top right) →
**Rules** → **+ Global**, then add:

```
At the start of every session, read the file at
~/.windsurf/skills/project-memory/SKILL.md and follow its on-load instructions.
```

Global rules in Windsurf apply across all workspaces.

> **Manual config path (if Cascade UI is unavailable):** `~/.codeium/windsurf/mcp_config.json`

> **Enterprise/system-wide installation:**
> - macOS: `/Library/Application Support/Windsurf/rules/project-memory.md`
> - Linux/WSL: `/etc/windsurf/rules/project-memory.md`
> - Windows: `C:\ProgramData\Windsurf\rules\project-memory.md`

---

## OpenCode

**Recommended skill location:** `~/.config/opencode/skills/project-memory/`

```bash
git clone <repo-url> ~/.config/opencode/skills/project-memory
```

Add to `~/.config/opencode/AGENTS.md` (create it if it doesn't exist):

```markdown
At the start of every session, read
~/.config/opencode/skills/project-memory/SKILL.md and follow its on-load
instructions.
```

Alternatively, reference the skill via `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["~/.config/opencode/skills/project-memory/SKILL.md"]
}
```

---

## Cline

**Recommended skill location:** `~/.cline/skills/project-memory/`

```bash
git clone <repo-url> ~/.cline/skills/project-memory
```

In VS Code, open the Cline extension settings → **Custom Instructions** and add:

```
At the start of every session, read the file at
~/.cline/skills/project-memory/SKILL.md and follow its on-load instructions.
```

Cline's global configuration directory is `~/.cline/` — custom instructions
defined there apply to all sessions.

---

## MCP Companion Server

The MCP Server works the same regardless of which platform you're on.
See [mcp-server/INSTALL.md](mcp-server/INSTALL.md) for setup instructions.

Or just tell me:

> *"Install the MCP Server."*

I'll handle it.

---

## Not listed here?

If your platform isn't covered above, the general approach is:

1. Put my files somewhere on your machine
2. Find your platform's "global instructions" or "system prompt" setting
3. Add: *"At the start of every session, read `<path>/SKILL.md` and follow
   its on-load instructions."*

Most modern AI coding tools support some form of persistent global instructions.
If yours doesn't, a per-project `AGENTS.md`, `.cursorrules`, or equivalent
file works just as well — it just needs to be added to each new project.
