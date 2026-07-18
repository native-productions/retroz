import "server-only";
import type { StockPhoto, StockSearchResult } from "@/lib/stock";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const THUMB_WIDTH = 400; // grid preview
const FULL_WIDTH = 1280; // downloaded on import (avoids multi-MB originals)

// Wikimedia's API policy requires a descriptive User-Agent identifying the app.
const USER_AGENT = "Retroz/1.0 (local content assistant)";

/** Strip HTML tags + collapse whitespace from Commons extmetadata values. */
function stripHtml(html?: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Turn a "File:Some Name.jpg" title into a readable caption fallback. */
function titleToCaption(title: string): string {
  return title
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/** Build the size-capped download URL from a thumb URL by swapping the width
 *  segment (…/400px-Name.jpg → …/1280px-Name.jpg). Falls back to the original. */
function scaledFullUrl(thumburl: string | undefined, original: string): string {
  if (!thumburl) return original;
  const swapped = thumburl.replace(
    new RegExp(`/${THUMB_WIDTH}px-`),
    `/${FULL_WIDTH}px-`,
  );
  return swapped;
}

interface RawImageInfo {
  url: string;
  width: number;
  height: number;
  mime: string;
  thumburl?: string;
  extmetadata?: Record<string, { value?: string } | undefined>;
}

interface RawPage {
  pageid: number;
  title: string;
  imageinfo?: RawImageInfo[];
}

/**
 * Search Wikimedia Commons for freely-licensed photos. No API key required.
 * Biases to bitmap files (photos, not SVG/diagrams) and captures author +
 * license for attribution.
 */
export async function searchWikimedia(
  query: string,
  page = 1,
  perPage = 24,
): Promise<StockSearchResult> {
  const url = new URL(COMMONS_API);
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6", // File:
    gsrlimit: String(perPage),
    gsroffset: String((page - 1) * perPage),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(THUMB_WIDTH),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`WIKIMEDIA_HTTP_${res.status}`);

  const data = (await res.json()) as {
    query?: { pages?: Record<string, RawPage> };
    continue?: { gsroffset?: number };
  };

  const pages = data.query?.pages ? Object.values(data.query.pages) : [];
  const photos: StockPhoto[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;

    const meta = ii.extmetadata ?? {};
    const caption =
      stripHtml(meta.ImageDescription?.value) || titleToCaption(p.title);
    const author = stripHtml(meta.Artist?.value);
    const license = stripHtml(meta.LicenseShortName?.value);
    const attribution = [author, license, "via Wikimedia Commons"]
      .filter(Boolean)
      .join(" · ");

    photos.push({
      id: String(p.pageid),
      source: "wikimedia",
      alt: caption,
      thumb: ii.thumburl ?? ii.url,
      full: scaledFullUrl(ii.thumburl, ii.url),
      width: ii.width,
      height: ii.height,
      mime: ii.mime,
      attribution,
    });
  }

  return {
    page,
    hasNext: typeof data.continue?.gsroffset === "number",
    photos,
  };
}
