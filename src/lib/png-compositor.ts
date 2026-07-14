import path from "node:path";
import fs from "node:fs/promises";
import { chromium, type Browser } from "playwright";

// Reuse one browser across renders in a run (and across runs). Lazily launched.
const globalForBrowser = globalThis as unknown as { pwBrowser?: Browser };

async function getBrowser(): Promise<Browser> {
  if (globalForBrowser.pwBrowser && globalForBrowser.pwBrowser.isConnected()) {
    return globalForBrowser.pwBrowser;
  }
  const browser = await chromium.launch({ headless: true });
  globalForBrowser.pwBrowser = browser;
  return browser;
}

export interface RenderResult {
  absPath: string;
  filename: string;
  width: number;
  height: number;
}

/**
 * Render an HTML overlay to a PNG. The HTML may reference local photos via
 * absolute file:// URLs or data URIs. Screenshots a fixed viewport so output
 * dimensions are deterministic (good for Instagram formats).
 */
function injectHeadStyle(html: string, css: string): string {
  if (!css.trim()) return html;
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
  const html = injectHeadStyle(opts.html, opts.fontFaceCss ?? "");
  const filename = opts.filename.endsWith(".png")
    ? opts.filename
    : `${opts.filename}.png`;
  const absPath = path.join(outDir, filename);
  const base = filename.replace(/\.png$/i, "");
  const tmpHtml = path.join(outDir, `.render-${base}.html`);

  await fs.mkdir(outDir, { recursive: true });
  // Load via file:// so local font/photo file:// URLs resolve with an origin.
  await fs.writeFile(tmpHtml, html, "utf8");

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle" });
    await page.evaluate(() =>
      "fonts" in document ? (document as Document).fonts.ready : null,
    );
    await page.screenshot({
      path: absPath,
      clip: { x: 0, y: 0, width, height },
    });
  } finally {
    await context.close();
    await fs.rm(tmpHtml, { force: true });
  }

  return { absPath, filename, width, height };
}

export async function closeBrowser(): Promise<void> {
  if (globalForBrowser.pwBrowser) {
    await globalForBrowser.pwBrowser.close();
    globalForBrowser.pwBrowser = undefined;
  }
}
