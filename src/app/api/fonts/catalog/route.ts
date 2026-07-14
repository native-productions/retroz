import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchCatalog } from "@/lib/google-fonts-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sortParam = url.searchParams.get("sort");
  const sort =
    sortParam === "trending" || sortParam === "name" ? sortParam : "popular";

  try {
    const entries = await searchCatalog(
      {
        q: url.searchParams.get("q") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        sort,
        limit: 60,
      },
      Date.now(),
    );
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ error: "Catalog unavailable" }, { status: 502 });
  }
}
