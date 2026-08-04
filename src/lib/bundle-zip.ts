import { zipSync } from "fflate";
import { db } from "@/lib/db-client";
import { slugify } from "@/lib/paths";
import { storage } from "@/lib/storage";

/**
 * A bundle zipped in carousel order, named `01-hook.png`, `02-…` and so on.
 * Instagram's picker sorts by filename, so the numeric prefix is what makes the
 * upload land in the right order without any dragging on the phone.
 *
 * Shared by the authenticated download route and the token-scoped share route,
 * which must produce byte-identical archives.
 */
export interface BundleZip {
  /** Backed by a real ArrayBuffer, so it can be a Response body as-is. */
  bytes: Uint8Array<ArrayBuffer>;
  filename: string;
  /** Slides whose file could not be read — reported, never fatal on its own. */
  missing: string[];
}

export class BundleZipError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function buildBundleZip(bundleId: string): Promise<BundleZip> {
  const bundle = await db.workBundle.findUnique({
    where: { id: bundleId },
    select: {
      name: true,
      items: {
        orderBy: { order: "asc" },
        select: { artifact: { select: { filename: true, relPath: true } } },
      },
    },
  });
  if (!bundle) throw new BundleZipError("Not found", 404);
  if (bundle.items.length === 0) {
    throw new BundleZipError("This bundle has no slides yet", 409);
  }

  const pad = String(bundle.items.length).length;
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];

  for (const [i, item] of bundle.items.entries()) {
    const prefix = String(i + 1).padStart(Math.max(2, pad), "0");
    try {
      const buffer = await storage.get(item.artifact.relPath);
      files[`${prefix}-${item.artifact.filename}`] = new Uint8Array(buffer);
    } catch {
      missing.push(item.artifact.filename);
    }
  }

  if (Object.keys(files).length === 0) {
    throw new BundleZipError("None of this bundle's files could be read", 404);
  }

  // Level 0: PNGs are already compressed, so this is a container, not a squeeze.
  return {
    bytes: new Uint8Array(zipSync(files, { level: 0 })),
    filename: `${slugify(bundle.name) || "bundle"}.zip`,
    missing,
  };
}

/** The zip as an HTTP response, with the headers both routes agree on. */
export function bundleZipResponse(zip: BundleZip): Response {
  return new Response(zip.bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.filename}"`,
      "Cache-Control": "no-store",
      ...(zip.missing.length > 0
        ? { "X-Retroz-Missing": String(zip.missing.length) }
        : {}),
    },
  });
}
