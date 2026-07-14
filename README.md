# Retroz

**Your productivity assistant.** Creative, retro, classy.

A **local-only** content automation cockpit. It uses your local Claude (via the
Claude Agent SDK) to produce post-ready Instagram images — HTML/CSS overlays
composited over your own photos and exported to PNG. Not AI-generated pictures:
every final image is HTML rendered to PNG with Playwright.

> Phase 1 focuses on Instagram content workflows. Video (video-use / HyperFrames)
> is planned for later — the schema already leaves room.

## How it works

1. **Workflow** — one per channel / content pillar. Holds a global instruction
   and a default model.
2. **Assets** — upload photos into folders and describe each one so Claude knows
   what it's working with.
3. **Task** — points Claude at an asset folder with an instruction.
4. **Run** — Claude reads the photos, writes HTML overlays, and calls the
   `render_html_to_png` tool. Output lands in a clean, timestamped folder:
   `data/tasks/<workflow>/<Task Name | YYYY-MM-DD HH:mm>/*.png`.
5. **Schedule** — run a task automatically (daily / weekly / monthly) via cron.
6. **Skills** — reusable recipes written to `.claude/skills/*/SKILL.md`. Claude
   also loads your global `~/.claude/skills` automatically.

## Stack

- Next.js 16 (App Router) · TypeScript · Tailwind v4 (retro design system)
- Prisma 7 + PostgreSQL
- `@anthropic-ai/claude-agent-sdk` — runs your local Claude
- Playwright — HTML → PNG
- Auth.js v5 (single seeded user) · node-cron · p-queue

## Claude access

Set in **Settings**:

- **Subscription** (default) — uses your logged-in local Claude Code. No API key,
  no per-token billing. Make sure you're logged in (`claude` in a terminal).
- **API key** — set `ANTHROPIC_API_KEY` in `.env` and switch the mode.

## Setup

```bash
bun install                     # installs deps, generates Prisma client
bunx playwright install chromium
cp .env.example .env            # fill DATABASE_URL + AUTH_SECRET
bunx prisma migrate dev         # create schema
bunx prisma db seed             # seed user + settings + starter skill
bun run dev
```

Open http://localhost:3000 and log in with the seeded credentials
(`SEED_USER_EMAIL` / `SEED_USER_PASSWORD` from `.env`).

## Scripts

| Command | What |
| --- | --- |
| `bun run dev` | Dev server (boots the cron scheduler) |
| `bun run build` / `bun run start` | Production build / serve |
| `bun run db:migrate` | Prisma migrate dev |
| `bun run db:seed` | Seed user + settings + starter skill |
| `bun run db:studio` | Prisma Studio |

## Conventions

- Files are kebab-case and domain-prefixed: `claude-runner.ts`, `workflow-form.tsx`,
  `png-compositor.ts`.
- Local data (`data/`) and the generated Prisma client (`src/generated/`) are
  git-ignored.

## Notes

- The app spawns Claude and Playwright, so all agent/render routes run on the
  Node.js runtime (never edge).
- Runs execute one-at-a-time via a serial queue.
- Rendered PNGs are 2× (retina) of the requested logical size.
