import path from "node:path";
import sharp from "sharp";
import { slugify } from "@/lib/paths";
import { storage } from "@/lib/storage";

/** Image mime types accepted by every asset intake path (upload + Pexels). */
export const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export interface StoredImage {
  filename: string;
  /** Project-relative path (portable toward a future Tauri build). */
  relPath: string;
  size: number;
  width: number | null;
  height: number | null;
}

/**
 * Write an image buffer into a project-relative directory under a collision-free
 * filename, then probe its dimensions with sharp. Shared by the upload route and
 * the Pexels import so both create identical asset records.
 */
export async function storeImage(
  relDir: string,
  input: { buf: Buffer; mimeType: string; name: string },
): Promise<StoredImage> {
  await storage.ensurePrefix(relDir);

  const ext =
    path.extname(input.name) || `.${input.mimeType.split("/")[1] ?? "jpg"}`;
  const base =
    slugify(path.basename(input.name, path.extname(input.name))) || "photo";

  let filename = `${base}${ext}`;
  let i = 1;
  while (await storage.exists(path.join(relDir, filename))) {
    filename = `${base}-${i++}${ext}`;
  }
  await storage.put(path.join(relDir, filename), input.buf, {
    contentType: input.mimeType,
  });

  let width: number | null = null;
  let height: number | null = null;
  try {
    const meta = await sharp(input.buf).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    // non-fatal (e.g. some SVGs)
  }

  return {
    filename,
    relPath: path.join(relDir, filename),
    size: input.buf.byteLength,
    width,
    height,
  };
}
