# Changelog

All notable changes to Retroz are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is below `1.0.0`, the database schema and internal APIs may
change between minor releases; each release notes the migrations it requires.

## [0.1.0] — 2026-08-03

First tagged release. Retroz is a local-only cockpit that drives your own local
Claude (or Codex, or an OpenAI-compatible endpoint) to produce Instagram content:
HTML/CSS overlays composited over your photos and exported to PNG. No image model
is involved — every final image is HTML rendered by a headless browser.

### Added

**Engines**

- Claude backend via `@anthropic-ai/claude-agent-sdk`, using your logged-in local
  Claude Code by default (subscription mode strips `ANTHROPIC_API_KEY`), with an
  in-process MCP server exposing the render tools.
- Codex backend via `@openai/codex-sdk`, served the same tools over a
  token-scoped HTTP MCP route that expires with the run.
- User-configured API providers: any OpenAI-compatible endpoint plus Gemini's
  native API, running through an in-house agent loop with its own tool set.
  Per-endpoint capability flags absorb the disagreements between "OpenAI-
  compatible" implementations. API keys are encrypted at rest with AES-256-GCM.
- Model discovery per provider, with resolution falling through run → task →
  workflow → app default.

**Content production**

- Workflows: one channel or content pillar, holding a global instruction and a
  default model.
- Asset folders: photo upload with per-image descriptions, stored locally or on
  Cloudflare R2.
- Tasks and runs: manual "Run now", a serial queue that never spawns two agents
  at once, and a live run viewer streaming agent activity over SSE.
- `render_html_to_png` via Playwright, rendering through a `file://` page so
  local fonts and photos resolve. Output is retina (2×).
- Bundles: ordered sets of renders with an optional publish date — the unit a
  carousel is posted as.
- Work sessions: brief, canvas, gallery, caption generation with hashtags, and
  quick-add to a bundle.
- Campaigns: multi-slot content plans with their own timezone.

**Scheduling**

- Cron schedules (daily / weekly / monthly) booted from server instrumentation.
- Calendar: a month view merging four scheduled systems — bundle publish dates,
  upcoming cron occurrences, campaign slots, and completed runs. Bundles are
  dragged between days to reschedule. The dashboard carries a two-week strip of
  the same data.
- All scheduled instants are wall-clock times in a configurable app timezone,
  resolved DST-safely.

**Typography**

- Font Bank: Google Fonts catalog search (keyless), download by URL, or direct
  upload. Downloads keep the latin subset.
- Mood tags, curated heading/body pairings, and per-workflow font assignment, so
  the agent picks type that fits the brief.

**Other**

- Skills manager writing reusable content recipes to `.claude/skills/*/SKILL.md`;
  the agent also loads your global `~/.claude/skills`.
- Humanizer skill vendored for caption editing.
- Auth.js v5 with a single seeded user.
- Retro design system: a custom UI kit on Tailwind v4 CSS-first theming.
- Research helpers: Tavily search and Wikimedia Commons image lookup.

### Requirements

- Bun, a local PostgreSQL instance, and Chromium for Playwright.
- At least one engine available: a logged-in Claude Code, a logged-in Codex CLI,
  or an API endpoint configured in Settings.

### Install

```bash
bun install
bunx playwright install chromium
bunx prisma migrate deploy
bunx prisma db seed
bun run dev            # http://localhost:3020
```

`DATABASE_URL` goes in `.env`; log in with the seeded `SEED_USER_EMAIL` /
`SEED_USER_PASSWORD`.

[0.1.0]: https://github.com/native-productions/retroz/releases/tag/v0.1.0
