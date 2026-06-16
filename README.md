# Hi, I'm Project Memory Skill

If you do agentic coding — writing code with an AI assistant — I can make your
work a lot easier. The idea is simple: you work as you always do, I take notes
in the background.

Git already tracks what changed, where, when, and what the diff looks like.
What it can't tell you is *why* it was changed, what alternatives were rejected,
what constraints existed, what tensions are unresolved, what approaches have
proven harmful, and what should happen next. That's what I'm here for.

I watch quietly and only step in when it really matters. The rest of the time
I'm taking notes in the background: the discussions we had about how to approach
a problem, the decisions you made and why, what you built and when.

When you need something — *"What did we decide about the auth layer last month?"*,
*"Why are we doing persistence this way?"* — just ask. I'll find it.

And if you're about to do something that conflicts with a previous decision, I'll
give you a heads-up. If you still want to go ahead, no problem — we can change
our minds. I just want to make sure it's a conscious choice, not an accident.

---

## Remembering your preferences

You can also tell me how you like to work:

> *"From now on, always create a dedicated branch before I start coding."*
> *"Remind me to write tests before touching any existing feature."*

I'll follow these automatically, every session, without reminders. And your
preferences stay personal — they're scoped to you and won't affect the rest of
the team.

---

## Installation

Copy my skill files into a directory in your project. A path like
`.claude/skills/project-memory/` works well.

> You'll notice a `.project-memory/` folder in my repository — that's my own
> memory from being built with myself. Don't copy it over; your project will
> get its own fresh one the first time we work together.

Then tell your agent:

> *"Run Project Memory Skill first thing every session."*

Don't forget to tell them where I live — without a path, they won't know
where to look.

Want me available across all your projects instead of just one? Here's a
guide for setting that up on every major platform: → [INSTALLATION.md](INSTALLATION.md)

---

**MCP Server**

I work better with my companion MCP Server — faster, cheaper, smarter recall.
If you want it, just tell me:

> *"Install the MCP Server."*

I'll take care of it. If you'd rather do it yourself: → [mcp-server/INSTALL.md](mcp-server/INSTALL.md)

---

## Talking to me

No commands to learn. Just ask naturally:

- *"What did we decide about X?"*
- *"Why are we doing it this way?"*
- *"Did we ever consider Y?"*
- *"What have we been working on lately?"*

---

## Profiles

Not every project needs the same level of ceremony. When we first work together
on a new project, I'll ask you to choose one:

- **full** — everything on: full phase documentation (5 files), decision cross-reference,
  14-category drift audit, topic-shift detection, and 5 summary files. For long-lived
  or multi-contributor projects where architectural reasoning matters most.

- **lite** — reduced ceremony: one required phase file (`phase.yml`), lighter gates,
  no topic-shift detection, 2 summary files (`roadmap.md` and `current-state.md`).
  For most mid-sized solo or small-team work.

- **minimal** — a `.project-memory/` directory with just `config.yml` and a single
  `MEMORY.md` inside. No phase ceremony — just running sections for roadmap, decisions,
  and a work log. For short or throwaway projects where git history alone is almost enough.

You can switch at any time — just tell me: *"Switch project-memory to lite."*
Past artifacts are preserved; only future behavior changes.

**MCP companion server and profiles**

The MCP companion server is optional in all profiles, but how much you'll miss
it varies quite a bit:

- **minimal** — MCP gives you some uplift, but honestly you'll be fine without it.
  A single markdown file doesn't need a vector index.

- **lite** — I strongly suggest it. Without MCP, you'll feel the difference — semantic
  search and single-call audits are where lite earns its efficiency over full.

- **full** — I could technically work without it. But don't say I didn't warn you.
  Running full without MCP is a bit like running a local LLM on a 10-year-old
  laptop: it'll do something, eventually.

---

## ADR support (optional)

Want a structured, human-readable record of architectural decisions — in standard
MADR format, compatible with ADR tooling? I can set that up.

Each time we make an architectural decision, I'll create an ADR file for you.
After that, it's yours — edit it, annotate it, share it with your team. I won't
touch it again.

No rush, you don't have to decide upfront. Just ask whenever you're ready:

> *"Enable ADR support for this project."*

---

## Under the hood

Curious how I actually work — phases, audit categories, decision cross-reference,
MCP schema? → [UNDER_THE_HOOD.md](UNDER_THE_HOOD.md)
