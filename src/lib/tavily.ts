import "server-only";
import { db } from "@/lib/db-client";

// Tavily web research. Two endpoints: /search finds sources, /extract pulls the
// full text of the ones worth reading. Both authenticate with a bearer token
// stored in AppSetting, the same way the Pexels key is (see lib/pexels.ts).

const SEARCH_URL = "https://api.tavily.com/search";
const EXTRACT_URL = "https://api.tavily.com/extract";

/** An extracted page is truncated to this many characters before it reaches the
 *  agent — an unbounded article would swamp its context. */
const EXTRACT_CHAR_LIMIT = 12_000;

/** The saved Tavily key, or "" when the integration is not configured. */
export async function getTavilyKey(): Promise<string> {
  const setting = await db.appSetting.findUnique({
    where: { id: "singleton" },
    select: { tavilyApiKey: true },
  });
  return setting?.tavilyApiKey?.trim() ?? "";
}

export async function isTavilyConfigured(): Promise<boolean> {
  return (await getTavilyKey()).length > 0;
}

export interface WebSearchHit {
  title: string;
  url: string;
  /** Tavily's snippet for the page — enough to judge relevance, not to quote. */
  snippet: string;
  score: number;
  publishedDate: string | null;
}

export interface WebExtractDoc {
  url: string;
  content: string;
  truncated: boolean;
}

export interface WebSearchInput {
  query: string;
  depth: "basic" | "advanced";
  maxResults: number;
  topic: "general" | "news";
  timeRange?: "day" | "week" | "month" | "year";
}

interface RawSearchResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

interface RawExtractResult {
  url?: string;
  raw_content?: string;
}

async function post(url: string, body: unknown): Promise<unknown> {
  const key = await getTavilyKey();
  if (!key) throw new Error("TAVILY_NOT_CONFIGURED");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`TAVILY_HTTP_${res.status}`);
  }
  return res.json();
}

/** Search the web. Tavily's own summary is deliberately not requested — the
 *  point of this integration is that our model reads the sources itself. */
export async function searchWeb(input: WebSearchInput): Promise<WebSearchHit[]> {
  const data = (await post(SEARCH_URL, {
    query: input.query,
    search_depth: input.depth,
    max_results: input.maxResults,
    topic: input.topic,
    ...(input.timeRange ? { time_range: input.timeRange } : {}),
    include_answer: false,
    include_raw_content: false,
    include_images: false,
  })) as { results?: RawSearchResult[] };

  return (data.results ?? [])
    .filter((r): r is RawSearchResult & { url: string } => Boolean(r.url))
    .map((r) => ({
      title: r.title?.trim() || "(untitled)",
      url: r.url,
      snippet: (r.content ?? "").replace(/\s+/g, " ").trim(),
      score: typeof r.score === "number" ? r.score : 0,
      publishedDate: r.published_date?.trim() || null,
    }));
}

/** Pull the readable body of up to a handful of pages as markdown. */
export async function extractWeb(
  urls: string[],
  query?: string,
): Promise<{ docs: WebExtractDoc[]; failed: string[] }> {
  const data = (await post(EXTRACT_URL, {
    urls,
    ...(query ? { query } : {}),
    extract_depth: "basic",
    format: "markdown",
  })) as { results?: RawExtractResult[]; failed_results?: unknown[] };

  const docs: WebExtractDoc[] = (data.results ?? [])
    .filter((r): r is RawExtractResult & { url: string } => Boolean(r.url))
    .map((r) => {
      const raw = (r.raw_content ?? "").trim();
      return {
        url: r.url,
        content: raw.slice(0, EXTRACT_CHAR_LIMIT),
        truncated: raw.length > EXTRACT_CHAR_LIMIT,
      };
    });

  const returned = new Set(docs.map((d) => d.url));
  const failed = urls.filter((u) => !returned.has(u));

  return { docs, failed };
}
