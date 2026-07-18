import "server-only";
import { db } from "@/lib/db-client";
import type { StockPhoto, StockSearchResult } from "@/lib/stock";

const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";

/** The saved Pexels key, or "" when the integration is not configured. */
export async function getPexelsKey(): Promise<string> {
  const setting = await db.appSetting.findUnique({
    where: { id: "singleton" },
    select: { pexelsApiKey: true },
  });
  return setting?.pexelsApiKey?.trim() ?? "";
}

export async function isPexelsConfigured(): Promise<boolean> {
  return (await getPexelsKey()).length > 0;
}

interface RawPexelsPhoto {
  id: number;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    tiny: string;
  };
}

/** Query the Pexels search API with the saved key. Throws on a missing key or a
 *  non-2xx response so the route can translate it to a status code. */
export async function searchPexels(
  query: string,
  page = 1,
  perPage = 24,
): Promise<StockSearchResult> {
  const key = await getPexelsKey();
  if (!key) throw new Error("PEXELS_NOT_CONFIGURED");

  const url = new URL(PEXELS_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) {
    throw new Error(`PEXELS_HTTP_${res.status}`);
  }
  const data = (await res.json()) as {
    photos: RawPexelsPhoto[];
    page: number;
    total_results: number;
    next_page?: string;
  };

  const photos: StockPhoto[] = data.photos.map((p) => ({
    id: String(p.id),
    source: "pexels",
    alt: p.alt || "",
    thumb: p.src.medium,
    full: p.src.large2x,
    width: p.width,
    height: p.height,
    mime: "image/jpeg",
    attribution: `Photo by ${p.photographer} on Pexels`,
  }));

  return { page: data.page, hasNext: Boolean(data.next_page), photos };
}
