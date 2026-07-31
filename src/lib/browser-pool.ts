import { chromium, type Browser } from "playwright";

/**
 * One chromium process, shared by everything that needs a page: the HTML→PNG
 * compositor and the web-capture tool. Lazily launched and reused across runs —
 * a browser launch costs hundreds of milliseconds, and a run may need dozens of
 * pages.
 *
 * Held on `globalThis` so a dev-server hot reload does not leak a process.
 * Callers must always open their own `newContext()` and close it, so nothing is
 * shared between a render and a browse beyond the process itself.
 */
const globalForBrowser = globalThis as unknown as { pwBrowser?: Browser };

export async function getBrowser(): Promise<Browser> {
  if (globalForBrowser.pwBrowser && globalForBrowser.pwBrowser.isConnected()) {
    return globalForBrowser.pwBrowser;
  }
  const browser = await chromium.launch({ headless: true });
  globalForBrowser.pwBrowser = browser;
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (globalForBrowser.pwBrowser) {
    await globalForBrowser.pwBrowser.close();
    globalForBrowser.pwBrowser = undefined;
  }
}
