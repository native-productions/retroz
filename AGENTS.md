<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Retroz — Agent Guide

Product name **Retroz**, tagline "Your productivity assistant". Design language is
always **creative, retro, classy** (see `DESIGN.md`). Logos live in `public/logos/`
(`retroz.png` wordmark + full favicon/app-icon set).

Local-only app that drives the user's local Claude to produce Instagram content:
HTML/CSS overlays composited over uploaded photos, exported to PNG (via Playwright).
**Not** AI-generated imagery — every final image is HTML rendered to PNG.

See `PRODUCT.md` for what it does and `DESIGN.md` for the visual system.

## Golden rules

- **Package manager is `bun`.** Always `bun` / `bunx` — never npm/yarn/pnpm.
- **Dev runs on port 3020** (`next dev -p 3020`).
- Match existing patterns. Files are kebab-case and **domain-prefixed**
  (`claude-runner.ts`, `workflow-form.tsx`, `png-compositor.ts`,
  `font-card.tsx`). Components are `my-component.tsx`, never `MyComponent.tsx`.
- Shipped code, comments, and copy stay professional (no slang).

## Stack

- Next.js 16 (App Router, Turbopack) · TypeScript · React 19
- Tailwind v4 (CSS-first `@theme`, no `tailwind.config`) — see `DESIGN.md`
- Prisma 7 + PostgreSQL (rust-free `prisma-client` generator)
- `@anthropic-ai/claude-agent-sdk` — spawns the local Claude
- `@openai/codex-sdk` — spawns the local Codex CLI (alternative engine)
- Playwright (chromium) — HTML → PNG
- Auth.js v5 (single seeded user) · node-cron · p-queue · fontkit · sharp

## Run it

```bash
bun install
bunx playwright install chromium
bunx prisma migrate dev
bunx prisma db seed
bun run dev            # http://localhost:3020
```

Postgres is a local docker container; `DATABASE_URL` lives in `.env`. Login uses
the seeded `SEED_USER_EMAIL` / `SEED_USER_PASSWORD`.

## Architecture map

```
src/
  app/
    (app)/            authed pages — dashboard, workflows, assets, tasks,
                      runs, fonts, skills, settings
    login/            unauthenticated login
    api/              route handlers (Node runtime only):
                        assets/upload, fonts/upload, fonts/catalog,
                        tasks/[id]/run, runs/[id]/stream (SSE), media,
                        mcp/[token] (HTTP MCP for Codex), auth/[...nextauth]
  lib/
    db-client.ts        Prisma singleton (pg driver adapter)
    auth.ts / auth-config.ts   Auth.js (split: edge-safe config vs full)
    run-executor.ts     THE engine orchestrator — resolves provider/model/fonts,
                        builds the prompt, dispatches to a backend, owns all
                        TaskRun bookkeeping
    agent-backend.ts    backend contract (inputs, events, uniform result)
    claude-backend.ts   Claude Agent SDK backend (query(), in-process MCP)
    codex-backend.ts    Codex CLI backend (codex-sdk thread, HTTP MCP)
    run-tools.ts        shared retroz tool defs (render/list/search) + per-run
                        token registry for the HTTP MCP route
    png-compositor.ts   Playwright HTML→PNG (renders via file:// temp html)
    prompt-builder.ts   assembles the run prompt (instruction + assets + fonts)
    run-queue.ts        p-queue, concurrency 1 (never 2 agent spawns at once)
    run-bus.ts          in-process pub/sub for live SSE
    cron-scheduler.ts   node-cron jobs, booted from instrumentation.ts
    google-fonts.ts     download a font's woff2 (latin subset) from css2 API
    google-fonts-catalog.ts   keyless catalog search (metadata/fonts endpoint)
    font-css.ts         build @font-face (file:// woff2) for the renderer
    paths.ts / media.ts / models.ts / validation.ts / cn.ts
    actions/            server actions (CRUD): workflow/asset/task/schedule/
                        skill/font/settings-actions.ts
  components/           ui/* (retro kit) + workflow/ asset/ task/ run/
                        schedule/ skill/ font/ feature components
  instrumentation.ts    boots the scheduler on server start
  proxy.ts              auth gate (Next 16 renamed middleware → proxy)
  generated/prisma/     generated client (gitignored)
data/                   assets + task outputs + fonts (gitignored)
.claude/skills/         project skills the Skills manager writes
```

## How a run works (the core)

1. User hits **Run now** → `taskRun` row (QUEUED) → `enqueueRun` (serial queue).
2. `executeRun` (`run-executor.ts`): makes the output folder
   `data/tasks/<workflow>/<Task Name | YYYY-MM-DD HH:mm>/`, resolves the engine
   provider (`AppSetting.provider`: CLAUDE or CODEX) and the model
   (run → task → workflow → settings default, filtered to the active provider's
   catalog by `resolveModel`), resolves fonts (workflow-assigned, else whole
   enabled bank), builds `@font-face` CSS + the prompt, then dispatches to the
   provider backend.
3. **Claude backend** (`claude-backend.ts`): runs `query()` with `cwd` = output
   folder, `additionalDirectories` = asset folder, `settingSources:
   ["user","project"]` (loads `~/.claude` + project skills), `permissionMode:
   "bypassPermissions"`, and an in-process MCP server named **`retroz`** wrapping
   the shared tools in `run-tools.ts` (tool names are prefixed `mcp__retroz__*` —
   the `allowedTools` list must match this exact prefix or Claude can't call the
   renderer).
   **Codex backend** (`codex-backend.ts`): starts a codex-sdk thread
   (`workspace-write` sandbox, `approvalPolicy: "never"`, auth from `~/.codex`)
   and serves the same retroz tools over the token-scoped HTTP MCP route
   `api/mcp/[token]` (excluded from the auth gate; the unguessable per-run token
   is the auth and dies with the run).
4. The agent reads photos, writes HTML overlays, calls `render_html_to_png`. The
   compositor injects the font faces, renders via a `file://` temp page (so
   local fonts + photos load), screenshots to PNG (2× / retina).
5. Every backend event → persisted `RunEvent` + emitted on the bus → the run
   viewer streams it live (SSE). Artifacts recorded as `RunArtifact`. The
   backend returns one uniform result; `run-executor.ts` writes the final
   status/usage to `TaskRun`.

## Conventions

- **Confirmations & alerts use a modal — never native `window.confirm` /
  `alert` / `prompt`.** Use the `useConfirm()` hook (`components/confirm-provider.tsx`)
  which returns a promise, or `ActionButton`'s `confirm` prop (string or
  `{ title, description, confirmLabel, tone }`). The `ConfirmProvider` is mounted
  in the root layout. Any surface that shows a message/prompt does it through a
  Radix dialog (`ui-dialog`), never the browser primitives.
- **Delete buttons never live in the page header.** Put them where the object is
  managed: on its **card** in the list, and/or in a **"Danger zone" row at the
  bottom** of its detail page (next to Save on editors). Style `variant="danger"`
  (or a ghost trash icon on compact cards), always behind a confirm modal.
- **Mutations = server actions** (`lib/actions/*`). **Route handlers** only for
  file upload, run trigger, SSE stream, media serving, catalog search.
- Any route/module that touches the SDK, Playwright, Prisma, or the filesystem is
  **Node runtime** (`export const runtime = "nodejs"`) — never edge.
- Stored file paths are **project-relative** (portable toward a future Tauri build).
- Auth split: `auth-config.ts` is edge-safe (used by `proxy.ts`); `auth.ts` adds
  the Credentials provider (bcrypt + Prisma) for the API route.

## Gotchas (bite you if ignored)

- **Prisma 7**: no `url` in the `datasource` block — it's in `prisma.config.ts`.
  The rust-free client needs a driver adapter (`@prisma/adapter-pg`). Import the
  client from `@/generated/prisma/client`.
- **Regenerate after schema changes**: `bunx prisma migrate dev` then **restart
  `bun run dev`** — a running dev server caches the old client and will throw on
  new enum values / models.
- **fontkit** has no default export → `import { create } from "fontkit"`
  (a default import compiles under tsx but breaks the Turbopack build).
- **Next 16**: middleware file is `src/proxy.ts` (default-export the auth fn), not
  `middleware.ts`.
- Google Fonts download keeps the **latin** unicode-range subset (covers en/id).
- Rendered PNGs are **2× the requested logical size** (deviceScaleFactor 2).

## Verify a change

Prefer driving the real flow, not just types. For a runtime change: restart dev,
log in, create/point a task, **Run now**, and confirm PNGs land in the timestamped
output folder + the run viewer streams. `bunx tsc --noEmit` and `bun run build`
must both pass.

## Knowledge graph (graphify)

This project has a knowledge graph at `graphify-out/` with god nodes, community
structure, and cross-file relationships.

- For codebase questions, first run `graphify query "<question>"` when
  `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for
  relationships and `graphify explain "<concept>"` for focused concepts. These
  return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw
  grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of
  raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when
  query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current
  (AST-only, no API cost).
