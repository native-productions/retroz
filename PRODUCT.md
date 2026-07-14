# Retroz — Product

**Retroz** — "Your productivity assistant." A local content automation tool with a
creative, retro, classy design language.

## Vision

A **local-only** cockpit that turns the user's local Claude into a content
production assistant. Phase 1: manage Instagram content (education, business, and
other social channels). It runs on `localhost`, is never published, and may later
become a Tauri/desktop app.

The core bet: Claude can produce finished, on-brand, post-ready images by writing
**HTML/CSS overlays over the user's own photos** and exporting them to PNG — not by
generating pictures with an image model. This keeps output controllable,
on-brand, and reproducible.

## Who it's for

A single operator (the owner) running content for several accounts/pillars from
one machine. Single-user, single-tenant, offline-friendly after fonts download.

## Core concepts

- **Workflow** — one channel or content pillar. Holds a global instruction
  (brand voice, layout rules, mood) and a default model. Fonts can be assigned to it.
- **Asset** — a real photo, uploaded into an **Asset Folder** and given a
  description so Claude knows what each image is.
- **Font Bank** — global fonts (Google Fonts search/download, direct URL, or
  upload). Assignable per workflow; tagged with **mood** so the AI picks fonts
  that fit. **Pairings** = curated heading+body combos.
- **Task** — points Claude at one asset folder with an instruction. Optionally
  bound to a schedule.
- **Run** — one execution of a task. Produces a clean, timestamped output folder
  of PNGs and a live activity log.
- **Schedule** — run a task automatically (daily / weekly / monthly) via cron.
- **Skill** — a reusable content recipe written to `.claude/skills/*/SKILL.md`;
  Claude also loads the user's global `~/.claude/skills`.

## The production mechanism

Claude reads the source photos, composes a self-contained HTML document (photo as
background + typographic/brand overlay), and calls the `render_html_to_png` tool.
The app injects the available fonts' `@font-face`, renders the HTML headlessly, and
saves a PNG into:

```
data/tasks/<workflow>/<Task Name | YYYY-MM-DD HH:mm>/NN-name.png
```

Output is retina (2×). The user posts the images manually (no direct IG publishing
in phase 1).

## Primary user flow

1. Create a **Workflow**; write its global instruction and pick a default model.
2. (Optional) Assign **Fonts** to the workflow and tag their mood; build pairings.
3. Create an **Asset Folder**, upload photos, describe each.
4. Create a **Task**: choose the asset folder, write the instruction, pick a model.
5. **Run now** → watch the live run viewer stream Claude's activity; PNGs fill the
   gallery as they render.
6. (Optional) Add a **Schedule** so the task runs automatically.
7. Add **Skills** for reusable recipes the AI can lean on.

## Model & Claude access (Settings)

- **Subscription** (default): uses the user's logged-in local Claude Code. No API
  key, no per-token billing. The runner strips `ANTHROPIC_API_KEY` so the CLI login
  is used.
- **API key**: set `ANTHROPIC_API_KEY` and switch the mode.
- Model resolves task → workflow → app default (`opus` / `sonnet` / `haiku`).

## Status

**Shipped (Phase 1):** auth, workflows + global instruction, asset folders +
upload + descriptions, the Claude engine (runner, `render_html_to_png` MCP tool,
serial queue, live SSE run viewer), tasks + manual runs, cron scheduling, skills
manager, Font Bank (Google search/download, URL, upload, mood tags, pairings,
per-workflow assignment), retro design system. All verified end-to-end.

## Roadmap / not yet

- **Video** workflows (video-use / HyperFrames) — the schema leaves room
  (`Workflow.platform`); UI later.
- **Direct publishing** to Instagram / other platforms — currently produce files,
  post manually.
- **Richer scheduling** — multiple tasks per schedule, per-day-of-week control.
- **Desktop** — package as Tauri (paths are already project-relative for this).

## Non-goals

- Multi-user / hosted SaaS. This is a personal, local tool.
- AI-generated imagery. Content images are always HTML→PNG over real assets.
