import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

// Guards for URLs that come from the user's message or from the model. The stock
// importer can rely on a host allowlist (see ALLOWED_STOCK_HOSTS in lib/stock.ts)
// because those URLs always come from a known CDN. A browsing tool has no such
// luxury: any host is legitimate, so the check has to be "is this address
// public?" rather than "is this host on the list?".

/** Bare http(s) URLs in a block of prose. Trailing punctuation is not part of a URL. */
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

/** How many links one message may point the agent at. */
const MAX_URLS = 10;

/**
 * Pull the links out of a user message. Deduplicated, capped, and stripped of
 * the punctuation that usually follows a URL in a sentence.
 */
export function extractUrls(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(URL_PATTERN)) {
    const cleaned = match[0].replace(/[.,;:!?)\]}]+$/, "");
    try {
      const url = new URL(cleaned);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      found.add(url.href);
    } catch {
      // Not a parseable URL — ignore it.
    }
    if (found.size >= MAX_URLS) break;
  }
  return [...found];
}

/** The dev/prod port this app is served on; never browsable from inside a run. */
function ownPort(): string {
  return process.env.PORT ?? "3020";
}

function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);

  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 127 || a === 0) return true; // loopback, "this host"
    if (a === 10) return true; // 10/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe80")) return true; // link-local
    // IPv4-mapped (::ffff:127.0.0.1) — judge it by the embedded address.
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }

  return true; // unparseable — refuse rather than guess
}

/**
 * Reject anything that is not a public http(s) address.
 *
 * Resolves the hostname first: a public-looking name can point at 127.0.0.1 or
 * at a cloud metadata endpoint, and the model chooses the URL. Callers must run
 * this again on every request the page makes, because a redirect can land
 * somewhere this pre-flight check never saw.
 *
 * Throws with an agent-readable message; never returns a boolean, so a missing
 * `await` cannot silently pass.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`"${raw}" is not a valid URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Only http and https URLs can be opened (got "${url.protocol}").`,
    );
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host.toLowerCase().endsWith(".localhost")) {
    throw new Error(`${url.hostname} is a local address and cannot be opened.`);
  }

  // Literal IP in the URL — no lookup needed, and none should be trusted.
  const addresses = net.isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true })).map((entry) => entry.address);

  if (addresses.length === 0) {
    throw new Error(`${url.hostname} did not resolve to any address.`);
  }
  // Every address has to be public: a name with one public and one private
  // record would otherwise be a way in.
  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error(
        `${url.hostname} resolves to a private address (${address}) and cannot be opened.`,
      );
    }
  }

  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port === ownPort()) {
    throw new Error(`Port ${port} is this application and cannot be opened.`);
  }

  return url;
}
