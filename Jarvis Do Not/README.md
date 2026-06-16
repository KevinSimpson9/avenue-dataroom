# Jarvis — DO NOT MERGE WITH THE AVENUE DATA ROOM

This folder holds the **entire Jarvis system**, parked here for safekeeping only.
It is **not** part of the investor data room and must never be wired into it.

> Why the name: keeping Jarvis bolted into `avenue-dataroom` (its `api/`,
> `vercel.json`, password and domain) would break the data room's deploy. So
> everything Jarvis lives in this isolated folder and is excluded from the data
> room's Vercel build via `.vercelignore`. It deploys nothing on its own here.

## What's inside

```
Jarvis Do Not/
├── CLAUDE.md              # The Jarvis constitution (master system prompt)
├── jarvis/                # The "brain" — state Jarvis reads/writes
│   ├── config.json        # Owner, entities, rails, rhythm, outcome metric
│   ├── cards/             # Proposed work (card-0001 … )
│   ├── briefings/         # Decision-grade morning briefs
│   └── state/             # Snapshots, pipelines, analyst notes
├── .claude/agents/        # The 13 seats (4 structural + 9 domain)
└── command-center/        # The web dashboard (Next-less, Vercel serverless)
    ├── api/               # _jarvis.js, jarvis.js, jarvis-unlock.js
    └── public/            # jarvis.html (dark dashboard)
```

## When it gets its own repo

Move this folder's contents to the root of a new repo (e.g. `jarvis-command-center`):

- `CLAUDE.md`, `jarvis/`, `.claude/agents/` go at the repo root.
- `command-center/api/` and `command-center/public/` become the repo's `api/`
  and `public/` (or keep nested and adjust `vercel.json` paths).
- The command-center function reads `jarvis/**`; in the standalone repo, keep
  `jarvis/` at the repo root and re-add `"functions": { "api/jarvis.js":
  { "includeFiles": "jarvis/**" } }` to that repo's `vercel.json`.
- Set its own env: `JARVIS_PASSWORD`, `SESSION_SECRET`, and optionally `GH_TOKEN`
  (+ `GH_OWNER`/`GH_REPO`/`GH_BRANCH`) to enable one-tap approve write-back.

Then this folder can be deleted from `avenue-dataroom` entirely.
