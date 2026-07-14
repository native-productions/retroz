import fs from "node:fs/promises";
import path from "node:path";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface ParsedVariant {
  weight: number;
  weightRange: string | null;
  style: string; // normal | italic
  format: string; // woff2
  url: string;
}

/** Extract a Google Fonts family display name from a URL or plain input. */
export function resolveFamily(input: string): string {
  const raw = input.trim();
  // fonts.google.com/specimen/Space+Grotesk
  const specimen = raw.match(/specimen\/([^/?#]+)/i);
  if (specimen) return decodeURIComponent(specimen[1].replace(/\+/g, " "));
  // css2?family=Space+Grotesk:...
  const fam = raw.match(/[?&]family=([^:&]+)/i);
  if (fam) return decodeURIComponent(fam[1].replace(/\+/g, " "));
  return raw;
}

interface FontMeta {
  category: string | null;
  weights: string[];
  wghtMin: number | null;
  wghtMax: number | null;
  hasItalic: boolean;
}

/** Google's public metadata endpoint — category, variants, and axes. */
export async function fetchMetadata(family: string): Promise<FontMeta | null> {
  try {
    const res = await fetch(
      `https://fonts.google.com/metadata/fonts/${encodeURIComponent(family)}`,
      { headers: { "User-Agent": BROWSER_UA } },
    );
    if (!res.ok) return null;
    const text = (await res.text()).replace(/^\)\]\}'\s*/, "");
    const json = JSON.parse(text) as {
      category?: string;
      fonts?: Record<string, unknown>;
      axes?: { tag: string; min: number; max: number }[];
    };
    const weights = Object.keys(json.fonts ?? {});
    const wght = (json.axes ?? []).find((a) => a.tag === "wght");
    return {
      category: json.category ?? null,
      weights,
      wghtMin: wght?.min ?? null,
      wghtMax: wght?.max ?? null,
      hasItalic: weights.some((k) => k.endsWith("i") || k.includes("italic")),
    };
  } catch {
    return null;
  }
}

interface SubsetVariant extends ParsedVariant {
  subset: string;
}

// Parse each @font-face together with its preceding /* subset */ comment.
function parseFontFace(css: string): SubsetVariant[] {
  const out: SubsetVariant[] = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g;
  let m: RegExpExecArray | null;
  const push = (subset: string, block: string) => {
    const styleMatch = block.match(/font-style:\s*([^;]+);/);
    const weightMatch = block.match(/font-weight:\s*([^;]+);/);
    const urlMatch = block.match(/url\(([^)]+)\)\s*format\(['"]?woff2['"]?\)/);
    if (!urlMatch) return;
    const style = styleMatch?.[1].trim() === "italic" ? "italic" : "normal";
    const weightRaw = weightMatch?.[1].trim() ?? "400";
    let weight = 400;
    let weightRange: string | null = null;
    if (/^\d+$/.test(weightRaw)) weight = parseInt(weightRaw, 10);
    else if (/^\d+\s+\d+$/.test(weightRaw)) {
      weightRange = weightRaw;
      weight = parseInt(weightRaw.split(/\s+/)[0], 10);
    }
    out.push({
      subset,
      weight,
      weightRange,
      style,
      format: "woff2",
      url: urlMatch[1].replace(/['"]/g, ""),
    });
  };
  while ((m = re.exec(css)) !== null) push(m[1], m[2]);
  // fallback: no subset comments (rare) — take all blocks as "latin"
  if (out.length === 0) {
    for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? [])
      push("latin", block);
  }
  return out;
}

function buildCss2Urls(family: string, meta: FontMeta | null): string[] {
  const enc = family.replace(/\s+/g, "+");
  if (meta && meta.wghtMin != null && meta.wghtMax != null) {
    const range = `${meta.wghtMin}..${meta.wghtMax}`;
    const q = meta.hasItalic
      ? `ital,wght@0,${range};1,${range}`
      : `wght@${range}`;
    return [
      `https://fonts.googleapis.com/css2?family=${enc}:${q}&display=swap`,
      `https://fonts.googleapis.com/css2?family=${enc}&display=swap`,
    ];
  }
  if (meta && meta.weights.length) {
    // static: discrete weights
    const pairs: string[] = [];
    for (const key of meta.weights) {
      const italic = key.endsWith("i") || key.includes("italic");
      const w = parseInt(key.replace(/\D/g, ""), 10) || 400;
      pairs.push(`${italic ? 1 : 0},${w}`);
    }
    pairs.sort();
    return [
      `https://fonts.googleapis.com/css2?family=${enc}:ital,wght@${pairs.join(";")}&display=swap`,
      `https://fonts.googleapis.com/css2?family=${enc}&display=swap`,
    ];
  }
  return [
    `https://fonts.googleapis.com/css2?family=${enc}:wght@100..900&display=swap`,
    `https://fonts.googleapis.com/css2?family=${enc}&display=swap`,
  ];
}

async function fetchCss(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) return null;
  return res.text();
}

export interface GoogleFontResult {
  family: string;
  category: string | null;
  variants: {
    weight: number;
    weightRange: string | null;
    style: string;
    format: string;
    filename: string;
    relPath: string;
  }[];
}

/** Fetch a Google font's woff2 files into destAbsDir. Returns stored variants. */
export async function fetchGoogleFont(
  familyInput: string,
  slug: string,
  destAbsDir: string,
  destRelDir: string,
): Promise<GoogleFontResult> {
  const family = resolveFamily(familyInput);
  const meta = await fetchMetadata(family);

  let parsed: SubsetVariant[] = [];
  for (const url of buildCss2Urls(family, meta)) {
    const css = await fetchCss(url);
    if (css) {
      parsed = parseFontFace(css);
      if (parsed.length) break;
    }
  }
  if (!parsed.length) {
    throw new Error(`No downloadable woff2 found for "${family}".`);
  }

  // keep the latin subset per weight/style (covers en/id); pick one per key
  const byKey = new Map<string, SubsetVariant>();
  for (const v of parsed) {
    const key = `${v.weight}-${v.style}-${v.weightRange ?? ""}`;
    const existing = byKey.get(key);
    if (!existing || (existing.subset !== "latin" && v.subset === "latin")) {
      byKey.set(key, v);
    }
  }

  await fs.mkdir(destAbsDir, { recursive: true });
  const variants: GoogleFontResult["variants"] = [];
  for (const v of byKey.values()) {
    const res = await fetch(v.url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const suffix = v.weightRange ? "var" : String(v.weight);
    const filename = `${slug}-${suffix}${v.style === "italic" ? "i" : ""}.woff2`;
    await fs.writeFile(path.join(destAbsDir, filename), buf);
    variants.push({
      weight: v.weight,
      weightRange: v.weightRange,
      style: v.style,
      format: "woff2",
      filename,
      relPath: path.join(destRelDir, filename),
    });
  }

  return { family, category: meta?.category ?? null, variants };
}
