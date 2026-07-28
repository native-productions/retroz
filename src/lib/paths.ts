import path from "node:path";

/** Absolute project root. */
export const PROJECT_ROOT = process.cwd();

/** Configurable data root (assets + task outputs). */
export const DATA_ROOT = path.resolve(
  PROJECT_ROOT,
  process.env.DATA_ROOT ?? "./data",
);

/** Resolve a stored relative path to an absolute path under the project root. */
export function toAbsolute(relPath: string): string {
  return path.resolve(PROJECT_ROOT, relPath);
}

/** Turn an absolute path back into a project-relative path (for storage). */
export function toRelative(absPath: string): string {
  return path.relative(PROJECT_ROOT, absPath);
}

/**
 * Longest name portion kept in a run folder slug, before the timestamp. Task
 * names carry a lot of prefix ("Software Development · D3 S1 · …"), so this is
 * generous — with the timestamp it stays well inside the 255-byte path segment
 * limit and nowhere near S3's 1024-byte key limit.
 */
const RUN_SLUG_NAME_MAX = 110;

/**
 * kebab-case a name for use in slugs / folder names. Accents are folded to
 * their base letter ("Café" → "cafe") so words survive intact; everything else
 * outside [a-z0-9], including typographic punctuation (·, —), collapses to a
 * single dash.
 */
export function slugify(input: string, maxLength = 64): string {
  return (
    input
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength)
      // Slicing can land mid-word and leave a dangling separator.
      .replace(/-+$/, "") || "item"
  );
}

/**
 * Folder name for one run's outputs: "<task-name>-<YYYY-MM-DD>-<HHmm>", local
 * time. Fully slug-style — lowercase, dash-separated, no spaces or punctuation
 * — so output paths stay easy to scan, quote, and use in a URL. The timestamp
 * keeps runs of the same task ordered and distinct.
 */
export function runFolderSlug(name: string, d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${slugify(name, RUN_SLUG_NAME_MAX)}-${stamp}`;
}
