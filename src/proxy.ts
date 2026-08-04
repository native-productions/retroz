import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth-config";

const { auth } = NextAuth(authConfig);

// Next.js 16 "proxy" convention (formerly middleware).
export default auth;

// api/mcp is excluded: the Codex CLI calls it with a per-run token as auth.
// s/ and api/share are excluded for the same reason: a phone opening a bundle
// share link has no session, and the unguessable token in the path is the auth.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|media|api/mcp|s/|api/share/|.*\\.png$).*)",
  ],
};
