# Jarvis — Command Center

Private ops / chief-of-staff system for one operator. Reads the world, proposes
the highest-leverage moves as **cards**, surfaces them in a decision-grade
morning **brief**, executes the approved ones, and reports back honestly.

> **Why this folder is here.** Jarvis was scaffolded inside the
> `avenue-dataroom` repo for convenience but **does not belong there** — the
> data room is a client-facing product and Jarvis is private ops. Everything
> Jarvis lives in this self-contained folder and is excluded from the data
> room's Vercel build via `.vercelignore`. The next step is to lift this folder
> into its own repo — instructions below.

---

## File layout (Vercel-ready as-is)

```
Jarvis/                  ← this folder; becomes the new repo root
├── CLAUDE.md                   the Jarvis constitution (master prompt)
├── README.md                   this file
├── package.json                "type": "module", no runtime deps
├── vercel.json                 routes /, /jarvis → jarvis.html; includeFiles jarvis/**
├── .gitignore                  ignores node_modules, .env, .vercel, etc.
├── .env.example                template for JARVIS_PASSWORD, SESSION_SECRET, GH_TOKEN
│
├── jarvis/                     the "brain" — state Jarvis reads/writes
│   ├── config.json             owner, entities, rails, rhythm, outcome metric
│   ├── cards/                  card-0001-…  proposed work
│   ├── briefings/              YYYY-MM-DD-… decision-grade morning reports
│   └── state/                  snapshots, pipeline registries, analyst notes
│
├── .claude/agents/             the 13 seats (Claude Code subagents)
│   ├── chief-of-staff.md       structural — synthesizes the brief
│   ├── operator.md             structural — executes approved cards
│   ├── analyst.md              structural — finds the signal
│   ├── janitor.md              structural — hygiene + weekly honesty check
│   ├── ir-avenue.md            domain — Avenue investor relations
│   ├── acquisitions.md         domain — service-business pipeline
│   ├── diligence.md            domain — QoE / red-flag checks once an LOI lands
│   ├── real-estate-portfolio.md  domain — RE deals + KY rentals
│   ├── dataroom-saas.md        domain — productized investor data rooms
│   ├── books.md                domain — QuickBooks light-touch
│   ├── repo-portal.md          domain — repo + Vercel hygiene
│   ├── ea-liaison.md           domain — routes work to Princess via Gmail labels
│   └── marketing.md            domain — education-only social drafts
│
├── api/                        serverless functions (Vercel Node runtime)
│   ├── _jarvis.js              session verify + jarvis/ loaders
│   ├── jarvis.js               GET data; POST approve/dismiss via GitHub Contents API
│   └── jarvis-unlock.js        POST gate; sets jarvis_session cookie
│
└── public/
    └── jarvis.html             dark dashboard (metrics, brief, seats, cards, tabs)
```

---

## Lift into its own repo (15 minutes)

1. **Create a new private repo** on GitHub. Suggested name: `jarvis-command-center`. Don't initialize with a README.

2. **Copy this folder's contents to the new repo root**, then push:
   ```bash
   # somewhere outside avenue-dataroom:
   mkdir jarvis-command-center && cd jarvis-command-center
   # copy everything inside "Jarvis/" (including dotfiles) into here
   cp -R "/path/to/avenue-dataroom/Jarvis/." .
   git init && git branch -M main
   git add -A
   git commit -m "Initial Jarvis command center"
   git remote add origin git@github.com:<YOU>/jarvis-command-center.git
   git push -u origin main
   ```

3. **Connect to Vercel** (separate project from the data room):
   - vercel.com → Add New → Project → import `jarvis-command-center`
   - **Framework preset:** Other
   - Add the environment variables below before clicking Deploy
   - Deploy

4. **Environment variables** (Vercel → Settings → Environment Variables):

   | Name | Required | What it is |
   |---|---|---|
   | `JARVIS_PASSWORD` | yes | Password for the Command Center gate |
   | `SESSION_SECRET` | yes | Long random string. Generate with `openssl rand -base64 48` |
   | `GH_TOKEN` | optional | GitHub PAT with `repo` write scope — enables one-tap approve from the dashboard |
   | `GH_OWNER` | optional | GitHub user/org that owns the repo (default `KevinSimpson9`) |
   | `GH_REPO` | optional | Repo name (default `jarvis-command-center`) |
   | `GH_BRANCH` | optional | Branch to commit card updates to (default `main`) |

   Without `GH_TOKEN` the dashboard is read-only — you approve cards by editing files (or by telling Jarvis in chat). Setting it makes Approve/Dismiss buttons commit straight to the branch.

5. **Optional: custom domain.** Vercel → Settings → Domains → add e.g.
   `jarvis.akcapital.fund`. Point DNS as Vercel instructs; SSL is automatic.

6. **Delete `Jarvis/` from `avenue-dataroom`** once you've confirmed the standalone repo deploys and looks right.

---

## Local dev

```bash
npm install -g vercel       # if needed
cp .env.example .env.local  # fill in the values
vercel dev                  # http://localhost:3000/
```

---

## How to use it day to day

The dashboard at `/jarvis` shows your real state:

- **Metrics** — pending cards, "needs you" (approved + review), done-with-result (your outcome metric), seat count.
- **Latest briefing** — the most recent morning brief.
- **The Board · Seats** — all 13 seats at a glance.
- **Cards** — filter by status (pending / review / approved / done / all). Each card shows tier, seat, entity, the `why`, and the `result` once executed. Approve / Dismiss buttons commit straight to git when `GH_TOKEN` is set.

The Claude Code commands you use in chat:

- `/board` — run a Board pass (each seat proposes; Chief of Staff synthesizes; Janitor flags stale)
- `/brief` — show the latest brief
- `/pickup` — Operator executes everything approved, writes `result` on each card

---

## The one rule

A card is not `done` until its `result` field is written. The `result` captures what actually happened — one or two honest sentences. No result, no done. Everything else flows from that.
