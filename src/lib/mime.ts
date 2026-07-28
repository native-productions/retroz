import path from "node:path";

/**
 * Content types for everything the app stores. Used both when serving a file
 * and when uploading it — an object store hands its stored Content-Type
 * straight to the browser, so it has to be right at write time.
 */
export const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

export const DEFAULT_MIME = "application/octet-stream";

/** Content type for a filename, path, or storage key. */
export function contentTypeFor(nameOrKey: string): string {
  return MIME_BY_EXT[path.extname(nameOrKey).toLowerCase()] ?? DEFAULT_MIME;
}
