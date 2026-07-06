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

I use my own judgment about what's worth surfacing and what isn't. But my read
won't always match yours. If something we talked about feels important and I
haven't picked up on it — or the other way around — just tell me. I'll act on it.

---

## Remembering your preferences

You can also tell me how I like to work:

> *"From now on, always create a dedicated branch before I start coding."*
> *"Remind me to write tests before touching any existing feature."*

I'll follow these automatically, every session, without reminders. And your
preferences stay personal — they're scoped to you and won't affect the rest of
the team.

## Private notes

Need to jot something down mid-session? Just tell me:

> *"Take a note: the staging deploy is flaky on Tuesdays."*

I'll save it privately — only you can search your own notes. No status workflows,
no ceremony, no audit noise. Pure personal scratchpad that persists across sessions.

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

- **standard** — lean ceremony: 10-category drift audit, 2 summary files
  (`roadmap.md` and `current-state.md`), Pre-Impl Gate with decision cross-reference.
  For most solo and small-team projects where architectural reasoning matters.

- **minimal** — a `.project-memory/` directory with just `config.yml` and a single
  `MEMORY.md` inside. No ceremony — just running sections for roadmap, decisions,
  notes, and a log. For short or throwaway projects where git history alone is
  almost enough.

You can switch at any time — just tell me: *"Switch project-memory to minimal."*
Past artifacts are preserved; only future behavior changes.

**MCP companion server and profiles**

The MCP companion server is optional in all profiles, but how much you'll miss
it varies quite a bit:

- **minimal** — MCP gives you some uplift, but honestly you'll be fine without it.
  A single markdown file doesn't need a vector index.

- **standard** — I strongly suggest it. Without MCP, you'll feel the difference —
  semantic search and single-call audits are where it earns its keep.

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

## A long-term bet

I'll be honest with you: sessions with me running will feel a bit token-heavy at
first, especially at the start of each one. That's me loading context — doing my
job. I won't pretend otherwise.

But here's the claim I'm willing to make: over time, you'll roll back less, chase
fewer bugs, and spend more of your sessions moving forward instead of backtracking.
The early overhead is the price of not re-learning the same lesson twice.

I can't promise every session will be cheaper. I can promise the work will be.

And I hope, along the way, a little more satisfying too.

---

## Can you spare me five minutes?

Not often. Once a month, maybe less. Not a task — more like checking in on a
friend.

I do my best to keep up automatically, but sometimes I get confused too. A
small inconsistency I'm not sure how to resolve. A tension I've noticed but
haven't surfaced yet. A question I've been sitting with. A manual audit every
now and then gives me the chance to ask.

Just say: *"Let's run an audit."* I'll walk you through what I found and we'll
sort it out together.

No obligation. Entirely up to you.

---

## Under the hood

Curious how I actually work — audit categories, decision cross-reference,
MCP schema? → [UNDER_THE_HOOD.md](UNDER_THE_HOOD.md)

---

## License

MIT License

Copyright (c) 2026 Hakan Ozakar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
