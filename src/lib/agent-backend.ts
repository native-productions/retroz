import type { RunEventType } from "@/generated/prisma/enums";
import type { RunToolContext } from "@/lib/run-tools";

// Contract between the run executor and the engine backends. Backends stream
// TEXT/TOOL events through `record` while running and return one uniform
// result; the executor owns all TaskRun status/bookkeeping writes.

export type RecordEvent = (type: RunEventType, payload: unknown) => Promise<void>;

export interface AgentRunInput {
  prompt: string;
  model: string;
  cwd: string;
  additionalDirectories: string[];
  toolContext: RunToolContext;
  record: RecordEvent;
  /** Persist the engine session id (Claude session / Codex thread) once known. */
  onSessionId: (sessionId: string) => Promise<void>;
}

export interface ClaudeRunInput extends AgentRunInput {
  skills: string[] | "all";
  /** SUBSCRIPTION auth: strip ANTHROPIC_API_KEY so the CLI uses local login. */
  stripApiKey: boolean;
}

export interface CodexRunInput extends AgentRunInput {
  reasoningEffort: string;
  /** HTTP MCP endpoint exposing this run's retroz tools. */
  mcpServerUrl: string;
}

export interface AgentRunResult {
  ok: boolean;
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  numTurns: number;
  durationMs: number | null;
  durationApiMs: number | null;
  costUsd: number;
  modelUsage: object | null;
}
