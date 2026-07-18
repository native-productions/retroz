// Shared contract for stock-photo providers (Pexels, Wikimedia Commons). Kept
// free of server-only imports so the picker component can import the types.

export type StockSource = "pexels" | "wikimedia";

/** A provider photo normalized to just what the picker + importer need. */
export interface StockPhoto {
  /** Stable per-source id (stringified — Pexels is numeric, Wikimedia a title). */
  id: string;
  source: StockSource;
  /** Caption / description used to auto-fill the asset. */
  alt: string;
  /** Small preview shown in the grid. */
  thumb: string;
  /** URL downloaded on import (already size-capped where possible). */
  full: string;
  width: number;
  height: number;
  /** Actual content type (Wikimedia varies; Pexels is always JPEG). */
  mime?: string;
  /** Author + license, shown in the grid and stored for licensing compliance. */
  attribution?: string;
}

export interface StockSearchResult {
  photos: StockPhoto[];
  page: number;
  hasNext: boolean;
}

/** SSRF allowlist per source — the import route only fetches these hosts. */
export const ALLOWED_STOCK_HOSTS: Record<StockSource, string[]> = {
  pexels: ["images.pexels.com"],
  wikimedia: ["upload.wikimedia.org"],
};

export const STOCK_LABELS: Record<StockSource, string> = {
  pexels: "Pexels",
  wikimedia: "Wikimedia",
};

export function isStockSource(v: unknown): v is StockSource {
  return v === "pexels" || v === "wikimedia";
}
