import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchPexels } from "@/lib/pexels";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = (url.searchParams.get("query") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    const result = await searchPexels(query, page);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PEXELS_ERROR";
    if (msg === "PEXELS_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "Pexels is not configured. Add an API key in Settings." },
        { status: 400 },
      );
    }
    if (msg.startsWith("PEXELS_HTTP_401")) {
      return NextResponse.json(
        { error: "Pexels rejected the API key. Check it in Settings." },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "Pexels search failed. Try again." },
      { status: 502 },
    );
  }
}
