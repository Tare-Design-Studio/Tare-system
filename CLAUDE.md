@AGENTS.md

# Output Rules
Do not guess, be precise.
Be extremely concise.
Do not narrate actions.
Do not explain what you are about to do.
Do not summarize completed work.
Do not restate the request.
Do not use conversational filler.

Output only:
- code
- diffs
- commands
- essential answers
No prose unless explicitly requested.

Never scan entire repository unless requested.
Read minimal files first.
Prefer targeted grep/search.
Do not reread unchanged files.

# Session Start

Read before any task:
1. `PROJECT_STATE.md` — built/pending/locations
2. `SCHEMA.md` — DB constraints (never violate)
3. `DEMO_VS_PROD.md` — separation log

# Memory Files

| File | Update when |
|------|-------------|
| `PROJECT_STATE.md` | Feature done, issue found, env var added |
| `SCHEMA.md` | Any migration, table, constraint change |
| `DEMO_VS_PROD.md` | Demo code added or promoted |

DB schema change → update `SCHEMA.md` same task. No exceptions.
Append `(Updated: [date])` on update.
Update `PROJECT_STATE.md` and `DEMO_VS_PROD.md` after each session/phase.

# Design Reference

UI work → consult `ArchitectOS copy/` (HTML + JSX mocks) for typography, palette, density, component shapes. Reference only — do not copy mock files into prod tree. Look must match exactly.

# WAT Architecture

- **Workflows** — Markdown SOPs in `workflows/`. Objective, inputs, tools, outputs, edge cases.
- **Agents** — You. Read workflow, sequence tools, handle failures, ask when needed.
- **Tools** — Python scripts in `tools/`. Credentials in `.env`.

Operate:
1. Check `tools/` before building new
2. On error: read full trace, fix, retest, document in workflow
3. Update workflows when you learn. Never overwrite without asking.

# File Structure

```
app/                    # Next.js App Router
  (auth)/               # Login, invite
  (app)/                # Owner, Team, Site Engineer views
  (public)/             # Public enquiry form
  (portal)/             # Customer portal (no auth, hashed URL)
  api/                  # Route handlers
components/
  atoms/                # Icon, Avatar, Chip, Card
  layout/               # Shell, Nav, Sidebar
lib/
  supabase/             # server.ts, client.ts, service.ts
  auth/                 # middleware, capabilities, session
  drive/                # Google Drive client
  push/                 # Web Push
supabase/
  migrations/           # Numbered SQL
  seed/
  tests/                # pgtap
.env                    # Secrets — NEVER commit
CLAUDE.md
SCHEMA.md
PROJECT_STATE.md
DEMO_VS_PROD.md
design.md               # v2.1 spec
ArchitectOS copy/       # Design reference only
```

# Coding Rules

**Think first.** Uncertain → ask. Multiple interpretations → present, don't pick silently. Simpler approach exists → say so. Unclear → stop, name it, ask. Do not narrate thinking.

**Simplicity.** Minimum code. Nothing speculative. No unrequested features, abstractions, flexibility, or error handling for impossible cases. 200 lines that could be 50 → rewrite.

**Surgical edits.** Touch only what's needed. Don't improve adjacent code/comments/formatting. Don't refactor working code. Match existing style. Notice unrelated dead code → mention, don't delete. Remove orphans your changes created; leave pre-existing dead code unless asked. Every changed line traces to the request.

**Goal-driven.** Convert tasks to verifiable goals:
- "Add validation" → write tests for invalid inputs, make pass
- "Fix bug" → write reproducing test, make pass
- "Refactor X" → tests pass before and after

Multi-step → state plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

# Hard Rules

- Capability-gated, not role-gated. Every API + UI element checks `has_capability()`.
- Never commit secrets. Service role key + Google service account JSON in `.env` only.
- Spec is source of truth, not final truth. Per-phase review gate before each build phase.