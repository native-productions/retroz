const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface CatalogEntry {
  family: string;
  category: string; // Google label, e.g. "Sans Serif"
  popularity: number;
  trending: number;
}

interface CatalogCache {
  fetchedAt: number;
  entries: CatalogEntry[];
}

const globalForCatalog = globalThis as unknown as {
  gfCatalog?: CatalogCache;
};

const TTL_MS = 24 * 60 * 60 * 1000;

/** Fetch (and cache) the full keyless Google Fonts catalog. */
export async function getCatalog(now: number): Promise<CatalogEntry[]> {
  const cached = globalForCatalog.gfCatalog;
  if (cached && now - cached.fetchedAt < TTL_MS) return cached.entries;

  const res = await fetch("https://fonts.google.com/metadata/fonts", {
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!res.ok) throw new Error(`Catalog fetch failed (${res.status}).`);
  const text = (await res.text()).replace(/^\)\]\}'\s*/, "");
  const json = JSON.parse(text) as {
    familyMetadataList?: {
      family: string;
      category: string;
      popularity?: number;
      trending?: number;
    }[];
  };
  const entries: CatalogEntry[] = (json.familyMetadataList ?? []).map((f) => ({
    family: f.family,
    category: f.category,
    popularity: f.popularity ?? 99999,
    trending: f.trending ?? 99999,
  }));
  globalForCatalog.gfCatalog = { fetchedAt: now, entries };
  return entries;
}

export interface CatalogSearch {
  q?: string;
  category?: string; // our enum-ish value or "ALL"
  sort?: "popular" | "trending" | "name";
  limit?: number;
}

const CATEGORY_MAP: Record<string, string> = {
  SANS: "Sans Serif",
  SERIF: "Serif",
  DISPLAY: "Display",
  HANDWRITING: "Handwriting",
  MONOSPACE: "Monospace",
};

export async function searchCatalog(
  opts: CatalogSearch,
  now: number,
): Promise<CatalogEntry[]> {
  const all = await getCatalog(now);
  const q = (opts.q ?? "").trim().toLowerCase();
  const cat = opts.category && opts.category !== "ALL" ? opts.category : null;
  const catLabel = cat ? CATEGORY_MAP[cat] : null;

  let out = all.filter((e) => {
    if (q && !e.family.toLowerCase().includes(q)) return false;
    if (catLabel && e.category !== catLabel) return false;
    return true;
  });

  const sort = opts.sort ?? "popular";
  out = out.sort((a, b) => {
    if (sort === "name") return a.family.localeCompare(b.family);
    if (sort === "trending") return a.trending - b.trending;
    return a.popularity - b.popularity;
  });

  return out.slice(0, opts.limit ?? 60);
}
