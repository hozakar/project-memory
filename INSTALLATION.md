# project-memory setup

You are being asked to install the project-memory skill — a memory and context system for agentic coding. It captures engineering decisions, discussions, and rationale alongside git history, and loads that context at session start so the agent does not re-learn the same lessons twice.

This guide places the skill files, wires the session-start protocol, and (optionally) registers the MCP companion server. Follow the steps in order. At Step 2, ask the user the questions — do not guess.

## What the project-memory skill is

A memory layer for LLM coding agents. Runs silently at session start, loads engineering context from `.project-memory/`, and takes notes in the background while you work. Git tracks what changed; project-memory tracks *why* it was changed, what alternatives were rejected, what constraints existed, and what should happen next.

It is a markdown-based skill: no server, no binary, no runtime dependency. The entry point is `SKILL.md` — the on-load instructions in that file bootstrap everything else (profile detection, memory loading, drift audit, gates). An optional MCP companion server adds semantic search and deterministic audits for larger projects.

## Step 0 — Locate the skill files

`<SKILL_DIR>` = absolute path to the project-memory skill directory (the one containing `SKILL.md`).

1. Find the skill on disk. Common locations: alongside this file, in `~/.claude/skills/project-memory/`, or wherever the user cloned it.
2. If the skill directory is missing `SKILL.md`, it is incomplete — ask the user to clone or copy it.
3. If you cannot find the skill at all, clone it: `git clone https://github.com/hozakar/project-memory.git <target>` (or ask the user for their fork/URL), then proceed.

Resolve `<SKILL_DIR>` to an absolute path now. You will need it in Steps 3–5.

## Step 1 — Detect your host(s)

Every host uses a different instructions file and format. Identify which hosts are present:

| Signal | Host |
|---|---|
| `~/.claude/` or `CLAUDE.md` | Claude Code |
| `.cursor/` or `~/.cursor/` | Cursor |
| `opencode.json` or `~/.config/opencode/` | opencode |
| `~/.codex/` or `.codex/` | Codex CLI |
| `~/.gemini/` or `.gemini/` | Gemini CLI |
| `.clinerules` or `~/.cline/` | Cline |
| `~/.pi/agent/` | pi |
| `~/.windsurf/` or `.windsurf/` | Windsurf |

Record the list AND note which host you are running in right now. Step 2 will ask the user about scope.

## Step 2 — Ask the user

Present all 3 questions in a single message. Do not guess — let the user decide.

**Question 1: Enforcement tier**

- **easy** — one line in the instructions file: `Load the project-memory skill from <SKILL_DIR>/SKILL.md at session start.`
- **reinforced (recommended)** — a short block with the mandatory session-start protocol. Sufficient for all users and hosts.

*Recommend: reinforced.*

**Question 2: Which platforms?**

- All hosts detected in Step 1.
- Only the current host.

*Recommend: current host (or all if the user regularly switches between hosts).*

**Question 3: Scope**

- **Global** — skill available in every project. Place files in a central location and wire the global instructions file.
- **Project-only** — skill available in this repo only. Place files inside the project and wire the project-level instructions file.

*Recommend: global if the user wants project-memory everywhere; project-only if this is a one-off evaluation.*

## Step 3 — Place the skill files

### Global scope

Place the skill files in a central, stable location:

| Host | Recommended path |
|---|---|
| Claude Code | `~/.claude/skills/project-memory/` |
| Cursor | `~/.cursor/skills/project-memory/` |
| opencode | `~/.config/opencode/skills/project-memory/` |
| Codex CLI | `~/.codex/skills/project-memory/` |
| Gemini CLI | `~/.gemini/skills/project-memory/` |
| Cline | `~/.cline/skills/project-memory/` |
| pi | `~/.pi/skills/project-memory/` |
| Windsurf | `~/.windsurf/skills/project-memory/` |

If the files are already in a good location, do not move them — just use the current path as `<SKILL_DIR>`.

### Project-only scope

Place the skill files inside the project:

```
<project-root>/.claude/skills/project-memory/
```

Or any directory the user prefers — the path just needs to be referenced correctly in the instructions file.

## Step 4 — Wire the session-start instruction

Depending on the chosen tier, add one of the blocks below to the host's instructions file.

**Host -> instructions file mapping:**

| Host | File | Notes |
|---|---|---|
| Claude Code | `CLAUDE.md` | If repo uses `AGENTS.md`, create `CLAUDE.md` with `@AGENTS.md` at top then the tier block. |
| Cursor | `AGENTS.md` | Cursor reads it natively. Alternative: `.cursor/rules/project-memory.mdc` with `alwaysApply: true`. |
| opencode | `AGENTS.md` | --- |
| Codex CLI | `AGENTS.md` | --- |
| Gemini CLI | `GEMINI.md` | Or set `context.fileName: ["AGENTS.md", "GEMINI.md"]` to reuse `AGENTS.md`. |
| Cline | `.clinerules` | Or `.clinerules/project-memory.md` (directory mode). |
| pi | `AGENTS.md` | --- |
| Windsurf | Rules (Cascade UI) | Or `~/.codeium/windsurf/rules/project-memory.md`. |

### Global instructions file location

| Host | Global file |
|---|---|
| Claude Code | `~/.claude/CLAUDE.md` |
| Cursor | `~/.cursor/rules/` (User Rules) |
| opencode | `~/.config/opencode/AGENTS.md` |
| Codex CLI | `~/.codex/AGENTS.md` |
| Gemini CLI | `~/.gemini/GEMINI.md` |
| Cline | `~/.cline/` (Custom Instructions) |
| pi | `~/.pi/agent/AGENTS.md` |
| Windsurf | `~/.codeium/windsurf/rules/` |

---

**Tier 1 (easy)** — one line:

```
Load the project-memory skill from <SKILL_DIR>/SKILL.md at session start.
```

**Tier 2 (reinforced, recommended):**

```
## project-memory session start

At the start of every session, before doing anything else:

Load the project-memory skill from <SKILL_DIR>/SKILL.md, follow its on-load instructions, and keep its gates and protocols in force for the rest of the session.

This step is mandatory. Do not respond to the user's first request until it is complete.
If SKILL.md cannot be read or the skill fails to load, tell the user before proceeding — do not continue silently.
If you skip this step, prior decisions and constraints are not loaded and nothing from this session is captured in project memory — the user loses that context irretrievably, without ever knowing.
```

> The full session-start protocol (memory loading, drift audit, gates) lives in `SKILL.md`. The instructions file only needs the bootstrap line. Keeping it lean avoids drift.

### Per-host wiring notes

**Claude Code:** If the repo already has `AGENTS.md` and no `CLAUDE.md`, create `CLAUDE.md` with `@AGENTS.md` on the first line, then add the tier block below it. If `CLAUDE.md` already exists, append the tier block.

**Cursor:** User Rules (Settings -> Rules -> User Rules) for global scope. For project scope, use `.cursor/rules/project-memory.mdc` with `alwaysApply: true`.

**opencode:** Alternatively, reference the skill via `~/.config/opencode/opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["<SKILL_DIR>/SKILL.md"]
}
```

**Cline:** If using VS Code extension, add the tier block to Custom Instructions in extension settings. If using `.clinerules/` directory mode, create `.clinerules/project-memory.md` with the tier block.

**Windsurf:** Open the Cascade panel -> Customizations (top right) -> Rules -> + Global, then paste the tier block. Alternatively: `~/.codeium/windsurf/rules/project-memory.md`.

## Step 5 — Verify

1. Restart or reload the host so it picks up the new instructions file.
2. In a new session, check that the skill loads:

```
The agent should emit "PROJECT MEMORY LOADED" at session start (or similar on-load output from SKILL.md).
```

3. Verify `.project-memory/` exists or gets created:

- If this is a new project, the skill's on-load flow will guide first-run initialization (profile selection, `.project-memory/` scaffolding).
- If `.project-memory/` already exists, the skill loads existing memory silently.

4. If the skill does not load:
- Check the instructions file contains the tier block with the correct `<SKILL_DIR>` path.
- Verify `<SKILL_DIR>/SKILL.md` exists and is readable.
- For `@`-import syntax (Claude Code `@AGENTS.md`), confirm the import resolves.

## Step 6 — MCP companion server (optional)

The MCP companion server adds semantic search, deterministic drift audits, and vector indexing. Recommended for projects that accumulate more than a handful of decisions.

**Prerequisites:** Node.js >= 18.0.0, npm.

**Build:**

```bash
cd <SKILL_DIR>/mcp-server
npm install
npm run build
```

**Register per host:** See [mcp-server/INSTALL.md](mcp-server/INSTALL.md) for per-platform registration instructions (Claude Code, Cursor, opencode, Codex CLI, Gemini CLI, Cline, pi).

Or, in a session with the skill loaded, just say:

> *"Install the MCP Server."*

The skill will handle registration automatically.

## Not listed here?

If the user's platform is not covered above, the general approach is:

1. Place the skill files somewhere on the machine.
2. Find the platform's "global instructions" or "system prompt" setting.
3. Add the tier block with the correct path to `SKILL.md`.

Most modern AI coding tools support some form of persistent instructions. If the platform does not, a per-project `AGENTS.md`, `.cursorrules`, or equivalent file works — it just needs to be added to each new project.

## Host reference

| Host | Instructions file | MCP support | Docs |
|---|---|---|---|
| Claude Code | `CLAUDE.md` (+ `@AGENTS.md`) | `.mcp.json` / `claude mcp add --scope user` | [memory](https://code.claude.com/docs/en/memory.md) |
| Cursor | `AGENTS.md` / `.cursor/rules/*.mdc` | `.cursor/mcp.json` | [rules](https://cursor.com/docs/rules) |
| opencode | `AGENTS.md` | `opencode.json` | [agents](https://opencode.ai/docs/agents) |
| Codex CLI | `AGENTS.md` | `.codex/config.toml` | [config](https://developers.openai.com/codex/config-reference) |
| Gemini CLI | `GEMINI.md` | `.gemini/settings.json` | [gemini.md](https://geminicli.com/docs/cli/gemini-md) |
| Cline | `.clinerules` / `.clinerules/*.md` | `cline_mcp_settings.json` | [docs](https://docs.cline.bot) |
| pi | `AGENTS.md` | `~/.pi/agent/mcp.json` | pi docs |
| Windsurf | Rules (Cascade UI) | `~/.codeium/windsurf/mcp_config.json` | [docs](https://docs.devin.ai/desktop/cascade/mcp) |

## Version control considerations

The `.project-memory/` directory that the skill creates in consuming projects warrants a deliberate version-control decision. The guidance below applies to the *consuming project's* repository, not to this repository.

**Private or team repositories** — committing `.project-memory/` is recommended. The directory captures engineering decisions, rejected alternatives, and session rationale that function as shared engineering documentation for the team. Committing it ensures the memory travels with the code and is available to every contributor's agentic tooling.

**Public repositories** — adding `.project-memory/` to `.gitignore` is recommended. The content is agent-written from live session context and not consciously authored for publication. Anything that reaches public git history is effectively irreversible: forks, clones, and SHA-reachable orphaned commits persist even after a subsequent deletion commit.

A project that wants to expose decisions deliberately can enable the ADR mirror by setting `adr_enabled: true` in `.project-memory/config.yml`. The mirror maintains a curated, consciously written public decision log in a separate location that can be included in the repository independently of the full `.project-memory/` directory.

The choice belongs to the user — this is guidance, not a rule.