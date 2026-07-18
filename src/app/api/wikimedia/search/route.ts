import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchWikimedia } from "@/lib/wikimedia";

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
    const result = await searchWikimedia(query, page);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Wikimedia search failed. Try again." },
      { status: 502 },
    );
  }
}
