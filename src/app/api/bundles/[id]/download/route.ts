import { auth } from "@/lib/auth";
import {
  BundleZipError,
  buildBundleZip,
  bundleZipResponse,
} from "@/lib/bundle-zip";

export const runtime = "nodejs";

/**
 * Download a bundle as a zip of its slides in carousel order. The archive
 * itself is built in `bundle-zip.ts`, shared with the phone share route.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  try {
    return bundleZipResponse(await buildBundleZip(id));
  } catch (cause) {
    if (cause instanceof BundleZipError) {
      return new Response(cause.message, { status: cause.status });
    }
    throw cause;
  }
}
