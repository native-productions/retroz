# Retroz — Design System

Brand: **Retroz**, "Your productivity assistant". Design language: **creative,
retro, classy** — always. Logo (`public/logos/retroz.png`) is a retro script
wordmark on a green disc with pink + purple rings over a halftone dot field; the
palette below is drawn from it.

Retro · creative · modern. Chunky bordered surfaces with hard offset shadows,
mono/display type, and a green–purple–pink palette on a warm base. Dark by
default, light supported. Source of truth: `src/app/globals.css` (Tailwind v4
`@theme`). Do not hardcode hex values in components — use the tokens below.

## Palette

Brand ramps (raw):

| Green (primary) | Purple (structure) | Pink (accent) |
| --- | --- | --- |
| `--green-300 #6ff7a8` | `--purple-300 #c4b0ff` | `--pink-300 #ffb0d8` |
| `--green-400 #35e07f` | `--purple-400 #a385ff` | `--pink-400 #ff6fb3` |
| `--green-500 #14c866` | `--purple-500 #7c53ff` | `--pink-500 #ff2e93` |
| `--green-600 #0ba152` | `--purple-600 #6438e6` | `--pink-600 #e00a75` |

Roles: **green = primary / CTA**, **purple = structure / secondary**,
**pink = accent / highlights**.

Semantic tokens (theme-swapped — always use these, e.g. `bg-surface`,
`text-fg-muted`, `border-border`):

`--bg` `--bg-grid` `--surface` `--surface-2` `--border` `--border-soft`
`--fg` `--fg-muted` `--primary` / `--primary-fg` `--secondary` / `--secondary-fg`
`--accent` / `--accent-fg` `--ring` `--danger`

- **Light** = warm cream (`--bg #f7f2e9`, ink `--fg #1d1524`).
- **Dark** (default) = purple-tinted near-black (`--bg #0d0a14`, `--fg #f3ecff`).

Themes are class-based (`.dark` on `<html>`) via `next-themes`. Every color must
resolve in both — never hardcode a hex that only works in one theme.

## Typography

- **Display** — Space Grotesk (`--font-display`, `.font-display`). Headings, titles.
- **Body** — Geist Sans (`--font-sans`). Default text.
- **Mono** — JetBrains Mono (`--font-mono`). Labels, metadata, tags, terminal/log,
  retro accents. Labels are uppercase + tracked.

Loaded via `next/font` in `src/app/layout.tsx`.

## Retro signatures

- **Chunky borders**: `2px solid var(--border)`, small radius `--radius-retro (6px)`.
- **Hard offset shadows** (not blur): `.shadow-hard` (4px), `-sm` (2px), `-lg` (6px).
- **Press interaction** `.retro-press`: nudges up + grows shadow on hover, presses
  into the shadow on active. Use on clickable cards and buttons.
- **`.retro-card`** = surface + 2px border + radius + hard shadow (the base panel).
- **`.scanlines`** — CRT line overlay for hero surfaces (login, empty heroes).
- **Grid background** — faint grid on `body` (`--bg-grid`), 28px cells.
- **Selection / scrollbar** are themed (pink selection, purple scrollbar thumb).

## Component kit (`src/components/ui/ui-*.tsx`)

Radix-backed, retro-styled primitives — reuse these, don't re-roll:

- `ui-button` — variants `primary | secondary | accent | surface | outline | ghost
  | danger`; sizes `sm | md | lg | icon`. Uses `retro-press` + hard shadow.
- `ui-card` — `Card` + `CardHeader/Title/Description/Content/Footer`.
- `ui-input` — `Input`, `Textarea` (mono).
- `ui-badge` — tones `primary | secondary | accent | surface | muted | danger`.
- `ui-label` — `Label` (mono uppercase) + `Field` (label + control + hint).
- `ui-dialog`, `ui-tabs`, `ui-select`, `ui-switch`.

Shared layout: `components/page-header.tsx` → `PageHeader`, `PageBody`, `EmptyState`.
Merge classes with `cn()` from `@/lib/cn`.

## Do / don't

- **Do** compose from `ui-*` + tokens; put mono uppercase on labels/metadata; give
  clickable surfaces `retro-press`; keep generous spacing.
- **Don't** hardcode hex, use blurry soft shadows, use large pill radii on panels,
  or introduce a new font family without adding it to `layout.tsx` + `@theme`.

## Note on generated content vs app UI

This design system is the **app's** look. The **content images** Claude produces
(the PNGs) follow the workflow instruction + Font Bank — a separate visual world.
Don't conflate the two: app chrome uses these tokens; content styling is authored
per workflow.
