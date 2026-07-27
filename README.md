# Project Memory Skill

> **From the author:** Ever caught yourself scratching your head?
> - Why did we build this authentication system this way? If I change it like this, what would it cost across the codebase?
>
> Or,
> - Damn, the change I made broke 5 of my modules — I wish I hadn't forgotten why I needed to protect this socket structure before changing it...
>
> I'm a developer who works on long-running projects. There's not one of us who hasn't run into situations like the above. Is there anyone who can instantly recall how a decision made a year ago affects today's implementation?
>
> I built this project to solve exactly this problem for myself. It takes notes in the background while I work, captures the decisions I make, and warns me when needed — when I'm designing a new feature, changing code, doing a bugfix, and so on.
>
> The core focus of this tool is that problem. A few additional features orbit around it that might help me with the same problem. That's all... A simple idea, a simple implementation.
>
> I hope you find it useful too.

A memory and context skill for agentic coding — coding with an AI assistant. The skill runs silently at session start, loads engineering context, and takes notes in the background while you work.

Git already tracks what changed, where, when, and what the diff looks like. What it can't tell you is *why* it was changed, what alternatives were rejected, what constraints existed, what tensions are unresolved, what approaches have proven harmful, and what should happen next. That is what this skill is for.

The skill watches quietly and only steps in when it really matters. The rest of the time it takes notes in the background: the discussions you had about how to approach a problem, the decisions you made and why, what you built and when.

When you need something — *"What did we decide about the auth layer last month?"*, *"Why are we doing persistence this way?"* — just ask. The skill will find it.

And if you are about to do something that conflicts with a previous decision, the skill will give you a heads-up. If you still want to go ahead, no problem — you can change your mind. The point is to make sure it is a conscious choice, not an accident.

The skill uses its own judgment about what is worth surfacing and what is not. But its read will not always match yours. If something you talked about feels important and the skill has not picked up on it — or the other way around — just say so. It will act on it.

Here is how the memory loop works:

```mermaid
flowchart LR
    A["Coding Session"] --> B["Capture Decisions<br/>& Discussions"]
    B --> C["Write to<br/>.project-memory/"]
    C --> D["Load at Start<br/>of Next Session"]
    D --> E["Pre-Implementation Gate:<br/>Cross-reference Decisions"]
    E --> F["Inform Future Work"]
    F --> A
```

---

## Remembering your preferences

You can also tell the skill how you like to work:

> *"From now on, always create a dedicated branch before I start coding."*
> *"Remind me to write tests before touching any existing feature."*

The skill will follow these automatically, every session, without reminders. Your preferences stay personal — they are scoped to you and will not affect the rest of the team.

## Private notes

Need to jot something down mid-session? Just say so:

> *"Take a note: the staging deploy is flaky on Tuesdays."*

The skill will save it privately — only you can search your own notes. No status workflows, no ceremony, no audit noise. Pure personal scratchpad that persists across sessions.

---

## Installation

Copy the skill files into a directory in your project (`.claude/skills/project-memory/` works well).

> The skill creates a `.project-memory/` directory in your project on first use. Do not copy it from another project.

Then tell your agent: *"Run Project Memory Skill first thing every session."*

The skill handles its turn-boundary protocol automatically — it checks for commits after each turn and updates summaries accordingly. No extra configuration needed. Just tell it where the skill lives.

For cross-project setup: → [INSTALLATION.md](INSTALLATION.md)

---

**MCP Server**

The skill works better with its companion MCP Server — faster, cheaper, smarter recall.
If you want it, just say so:

> *"Install the MCP Server."*

The skill will take care of it. If you would rather do it yourself: → [mcp-server/INSTALL.md](mcp-server/INSTALL.md)

One concrete thing the MCP Server changes: **drift audits stop costing you tokens
and time.** Without it (in the `standard` profile), each session's audit runs by
having the agent issue Glob/Read calls, reason over each finding, and write fixes
token-by-token — the rules are deterministic, but every pass draws on the LLM.
With the MCP Server installed, the audit is *deterministic, instant, and runs in a
background worker* — the skill calls `run_audit`, gets an immediate ack, and moves
on. The server runs the entire pipeline (`run_audit → apply_audit_fixes → re-run
until clean`) silently, applying all fixes with zero further involvement from the
agent. No tokens spent on audit, no LLM judgment, no latency added to your session.

---

## Usage

No commands to learn. Just ask naturally:

- *"What did we decide about X?"*
- *"Why are we doing it this way?"*
- *"Did we ever consider Y?"*
- *"What have we been working on lately?"*

---

## Profiles

Not every project needs the same level of ceremony. When you first work with the skill
on a new project, it will ask you to choose one:

- **standard** — lean ceremony: drift audit (see standard/audit-fs.md for categories), 2 summary files
  (`roadmap.md` and `current-state.md`), Pre-Impl Gate with decision cross-reference.
  For projects where architectural reasoning matters.

- **minimal** — a `.project-memory/` directory with just `config.yml` and a single
  `MEMORY.md` inside. No ceremony — just running sections for roadmap, decisions,
  notes, and a log. For short or throwaway projects where git history alone is
  almost enough.

You can switch at any time — just say: *"Switch project-memory to minimal."*
Past artifacts are preserved; only future behavior changes.

**MCP companion server and profiles**

MCP companion server and profiles — see the [Installation](#installation) section above for the MCP companion server details.

---

## ADR support (optional)

Want ADR records in standard MADR format? The skill can set that up. Each time you make an architectural decision, it creates an ADR file that is yours to edit and share — the skill will not touch it again.

Just ask whenever you are ready:

> *"Enable ADR support for this project."*

---

## Cost model

Sessions with the skill will feel token-heavy at first — context loading at session start. That is the skill doing its job.

Over time, you will roll back less, chase fewer bugs. The early overhead is the price of not re-learning the same lesson twice.

The skill cannot promise every session will be cheaper. It can promise the work will be.

---

## Manual audit

Not often — once a month, maybe less.

The skill does its best automatically, but sometimes it gets confused. A manual audit every now and then gives it a chance to ask about unresolved tensions.

Just say: *"Let's run an audit."* The skill will walk you through what it found and you will sort it out together.

No obligation, but nice to have in order to keep everything in check.

---

## Under the hood

Curious how it actually works — audit categories, decision cross-reference,
MCP schema? → [UNDER_THE_HOOD.md](UNDER_THE_HOOD.md)

---

## License

MIT.