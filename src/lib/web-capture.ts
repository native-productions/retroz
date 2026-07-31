import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import type { Page } from "playwright";
import { getBrowser } from "@/lib/browser-pool";
import { slugify } from "@/lib/paths";
import { assertPublicUrl } from "@/lib/url-guard";

// Open a real page in the shared chromium, read what it says, and optionally
// photograph it. Everything written here is run-local: the caller passes a
// scratch directory that is never uploaded.

/** How long a page gets to reach DOMContentLoaded before it is abandoned. */
const NAV_TIMEOUT_MS = 20_000;

/** Extra settle time for client-rendered pages once the DOM exists. */
const SETTLE_MS = 2_000;

/** Default text budget, in the same spirit as tavily.ts's EXTRACT_CHAR_LIMIT. */
export const DEFAULT_MAX_CHARS = 6_000;

export interface CaptureOptions {
  url: string;
  /** Directory the screenshot is written to. Must already exist. */
  outDir: string;
  maxChars?: number;
  screenshot?: boolean;
  fullPage?: boolean;
  /** CSS selector to photograph instead of the viewport. */
  selector?: string;
}

export interface CaptureResult {
  /** The URL actually landed on, after redirects. */
  finalUrl: string;
  title: string;
  text: string;
  truncated: boolean;
  /** Null when no screenshot was asked for, or the element was not found. */
  shot: { absPath: string; width: number; height: number } | null;
  /** Non-fatal notes worth passing back to the agent. */
  notes: string[];
}

/**
 * Strip the page down to its readable content. This function is serialized and
 * runs inside the page, so it can only use browser globals and must not close
 * over anything from this module.
 */
function extractText(): string {
  // innerText on the live document, not on a clone: a detached node has no
  // layout, so innerText is empty there and the textContent fallback hands back
  // the markup's raw whitespace instead of readable lines. It also must not
  // mutate anything — the screenshot is taken after this runs.
  //
  // innerText already skips script, style and anything not rendered, which is
  // most of what a hand-rolled stripper would remove.
  const textOf = (el: HTMLElement | null) =>
    el ? el.innerText || el.textContent || "" : "";

  const main = document.querySelector<HTMLElement>("main, [role=main]");
  // The biggest <article> beats <main> when it carries a real share of the text.
  // On a repository page that picks the README over the file listing; on a news
  // index the whole listing is usually one <article>, so the two agree anyway.
  // The floor is what stops a page of tiny <article> cards from collapsing to
  // whichever card happens to be longest.
  let biggest: HTMLElement | null = null;
  for (const el of document.querySelectorAll<HTMLElement>("article")) {
    if (!biggest || textOf(el).length > textOf(biggest).length) biggest = el;
  }

  const mainText = textOf(main);
  const root =
    biggest && textOf(biggest).length >= Math.max(mainText.length * 0.2, 400)
      ? biggest
      : (main ?? document.body);

  // An app shell renders hundreds of empty wrappers and repeats its nav labels;
  // both are pure cost against the caller's character budget.
  const lines: string[] = [];
  for (const line of textOf(root).split("\n")) {
    const trimmed = line.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    if (trimmed === lines[lines.length - 1]) continue;
    lines.push(trimmed);
  }
  return lines.join("\n");
}

export async function capturePage(opts: CaptureOptions): Promise<CaptureResult> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const target = await assertPublicUrl(opts.url);
  const notes: string[] = [];

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    acceptDownloads: false,
  });

  try {
    // The pre-flight check above only saw the first URL. A redirect — or any
    // subresource — can still aim at a private address, so every request is
    // re-checked here. This is the guard that actually holds.
    //
    // Verdicts are cached per origin: a media-heavy page issues hundreds of
    // requests to a handful of hosts, and re-resolving each one would put a DNS
    // round trip in front of every image.
    const verdicts = new Map<string, boolean>();
    await context.route("**/*", async (route, request) => {
      let origin: string;
      try {
        origin = new URL(request.url()).origin;
      } catch {
        await route.abort("blockedbyclient");
        return;
      }
      let allowed = verdicts.get(origin);
      if (allowed === undefined) {
        allowed = await assertPublicUrl(request.url()).then(
          () => true,
          () => false,
        );
        verdicts.set(origin, allowed);
      }
      if (allowed) await route.continue();
      else await route.abort("blockedbyclient");
    });

    const page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    const response = await page.goto(target.href, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    if (response && !response.ok()) {
      notes.push(`The server answered HTTP ${response.status()}.`);
    }
    // Client-rendered pages have an empty DOM at domcontentloaded, so wait for
    // the subresources and then give the app a moment to paint. networkidle is
    // not an option — analytics and ad scripts keep those pages busy forever,
    // and a page that never loads should still be readable, hence the swallow.
    await page.waitForLoadState("load", { timeout: SETTLE_MS }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);

    const title = (await page.title()).trim();
    const raw = await page.evaluate(extractText);
    const truncated = raw.length > maxChars;
    const text = truncated ? raw.slice(0, maxChars) : raw;

    if (!text) {
      notes.push(
        "The page returned no readable text — it may require JavaScript, a login, or it blocked the request.",
      );
    }

    let shot: CaptureResult["shot"] = null;
    if (opts.screenshot !== false) {
      shot = await takeShot(page, opts, notes);
    }

    return { finalUrl: page.url(), title, text, truncated, shot, notes };
  } finally {
    await context.close();
  }
}

async function takeShot(
  page: Page,
  opts: CaptureOptions,
  notes: string[],
): Promise<CaptureResult["shot"]> {
  const target = new URL(page.url());
  const base = slugify(`${target.hostname}${target.pathname}`, 48);
  const absPath = await uniquePath(opts.outDir, base);

  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };

  if (opts.selector) {
    const element = page.locator(opts.selector).first();
    if ((await element.count()) === 0) {
      notes.push(
        `No element matched "${opts.selector}" — captured the viewport instead.`,
      );
    } else {
      const box = await element.boundingBox();
      await element.screenshot({ path: absPath });
      return {
        absPath,
        width: Math.round(box?.width ?? viewport.width),
        height: Math.round(box?.height ?? viewport.height),
      };
    }
  }

  await page.screenshot({ path: absPath, fullPage: opts.fullPage === true });
  // A full-page shot is as tall as the document; only the viewport case has a
  // height we know up front.
  if (opts.fullPage === true) {
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    return { absPath, width: viewport.width, height: Math.round(height) };
  }
  return { absPath, width: viewport.width, height: viewport.height };
}

/** Two captures of the same page in one run must not overwrite each other. */
async function uniquePath(dir: string, base: string): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    const name = i === 0 ? `${base}.png` : `${base}-${i + 1}.png`;
    const candidate = path.join(dir, name);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  return path.join(dir, `${base}-${Date.now()}.png`);
}
