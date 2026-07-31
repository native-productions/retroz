import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { getBrowser } from "@/lib/browser-pool";
import {
  RENDER_RESET_CSS,
  auditRenderedPage,
  type RenderIssue,
} from "@/lib/render-guard";

export interface RenderResult {
  absPath: string;
  filename: string;
  width: number;
  height: number;
  /** The PNG bytes, so the caller can persist them to the blob store. */
  buffer: Buffer;
  /** Everything the layout audit found wrong. Empty means a clean render. */
  issues: RenderIssue[];
}

/**
 * Render an HTML overlay to a PNG. The HTML may reference local photos via
 * absolute file:// URLs or data URIs. Screenshots a fixed viewport so output
 * dimensions are deterministic (good for Instagram formats).
 */
function injectHeadStyle(html: string, css: string): string {
  const style = `<style>\n${css}\n</style>`;
  if (/<head[^>]*>/i.test(html))
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${style}`);
  if (/<html[^>]*>/i.test(html))
    return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${style}</head>`);
  return `${style}\n${html}`;
}

export async function renderHtmlToPng(opts: {
  html: string;
  outDir: string;
  filename: string;
  width: number;
  height: number;
  fontFaceCss?: string;
}): Promise<RenderResult> {
  const { outDir, width, height } = opts;
  // The reset goes in unconditionally — a project with no registered fonts still
  // needs animation stripped and the body margin cleared.
  const html = injectHeadStyle(
    opts.html,
    `${RENDER_RESET_CSS}\n${opts.fontFaceCss ?? ""}`,
  );
  const filename = opts.filename.endsWith(".png")
    ? opts.filename
    : `${opts.filename}.png`;
  const absPath = path.join(outDir, filename);
  // Keep the temp HTML in a clean OS temp dir — the output folder name can carry
  // "?", "|", ":" etc. (from task titles) which break file:// URL loading. The
  // HTML references photos/fonts via absolute file:// URLs, so its own location
  // doesn't matter for asset resolution.
  const tmpHtml = path.join(os.tmpdir(), `retroz-render-${randomUUID()}.html`);

  await fs.mkdir(outDir, { recursive: true });
  // Load via file:// so local font/photo file:// URLs resolve with an origin.
  await fs.writeFile(tmpHtml, html, "utf8");

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  let buffer: Buffer;
  let issues: RenderIssue[] = [];
  // A background-image that fails to load leaves no DOM trace, so the network
  // layer is the only place to catch it. Registered before goto to catch every
  // request the page makes.
  const failedUrls: string[] = [];
  page.on("requestfailed", (req) => {
    if (failedUrls.length < 8) failedUrls.push(req.url());
  });
  try {
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "networkidle" });
    await page.evaluate(() =>
      "fonts" in document ? (document as Document).fonts.ready : null,
    );
    // Audited before the screenshot so the measurements describe exactly the
    // layout that gets captured.
    issues = await auditRenderedPage(page, width, height, failedUrls);
    buffer = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  } finally {
    await context.close();
    await fs.rm(tmpHtml, { force: true });
  }

  // Also land it in the output directory so the agent can inspect what it just
  // produced; the caller is responsible for persisting the bytes to storage.
  await fs.writeFile(absPath, buffer);

  return { absPath, filename, width, height, buffer, issues };
}
