import { db } from "@/lib/db-client";
import {
  BundleZipError,
  buildBundleZip,
  bundleZipResponse,
} from "@/lib/bundle-zip";

export const runtime = "nodejs";

/**
 * The shared bundle as a zip, for the phone that scanned the QR code. On iOS
 * this lands in Files rather than Photos — saving straight to the camera roll
 * is what the per-slide long-press on the share page is for.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return new Response("Not found", { status: 404 });

  const bundle = await db.workBundle.findUnique({
    where: { shareToken: token },
    select: { id: true },
  });
  if (!bundle) return new Response("Not found", { status: 404 });

  try {
    return bundleZipResponse(await buildBundleZip(bundle.id));
  } catch (cause) {
    if (cause instanceof BundleZipError) {
      return new Response(cause.message, { status: cause.status });
    }
    throw cause;
  }
}
