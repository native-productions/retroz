import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth-config";

const { auth } = NextAuth(authConfig);

// Next.js 16 "proxy" convention (formerly middleware).
export default auth;

// api/mcp is excluded: the Codex CLI calls it with a per-run token as auth.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|media|api/mcp|.*\\.png$).*)"],
};
