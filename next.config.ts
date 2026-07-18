import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages spawn subprocesses / load native binaries and must never be
  // bundled by webpack/turbopack for the server runtime.
  serverExternalPackages: [
    "@anthropic-ai/claude-agent-sdk",
    "@openai/codex-sdk",
    "@openai/codex",
    "playwright",
    "@prisma/client",
    "@prisma/adapter-pg",
    "sharp",
    "node-cron",
  ],
  // Instrumentation hook boots the cron scheduler + run queue on server start.
  experimental: {
    // allow serving files we write outside .next during dev
  },
};

export default nextConfig;
