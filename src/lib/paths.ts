import path from "node:path";
import fs from "node:fs/promises";

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

export async function ensureDir(absPath: string): Promise<void> {
  await fs.mkdir(absPath, { recursive: true });
}

/** kebab-case a name for use in slugs / folder names. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";
}

/**
 * Make a string safe to use as a single path segment: strips filesystem- and
 * file://-URL-hostile characters (raw task titles otherwise carry "?", "|", ":"
 * which break the renderer's file:// loading and are cross-platform unsafe).
 * Readable non-ASCII (·, —) is kept.
 */
export function safeSegment(input: string): string {
  return (
    input
      .replace(/[/\\<>"]/g, "")
      .replace(/[?%*#]/g, "")
      .replace(/\|/g, "-")
      .replace(/:/g, ".")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "run"
  );
}

/** Timestamp folder label: "YYYY-MM-DD HH:mm" (local). */
export function runFolderStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
