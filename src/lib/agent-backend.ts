import type { ApiProtocol, RunEventType } from "@/generated/prisma/enums";
import type { ToolDef } from "@/lib/run-tools";
import type { ProviderCapabilities } from "@/lib/provider-capabilities";

// Contract between the run executor and the engine backends. Backends stream
// TEXT/TOOL events through `record` while running and return one uniform
// result; the executor owns all TaskRun status/bookkeeping writes.

export type RecordEvent = (type: RunEventType, payload: unknown) => Promise<void>;

export interface AgentRunInput {
  prompt: string;
  model: string;
  cwd: string;
  additionalDirectories: string[];
  /** The MCP tool set exposed to this run (render tools or planner tools). */
  tools: ToolDef<unknown>[];
  /** The run's tool context, handed verbatim to each tool's execute. */
  toolContext: unknown;
  /** Built-in tools to allow (Read/Write/Glob/Grep/Bash). */
  baseTools?: string[];
  /**
   * Continue an earlier engine session (Claude session id / Codex thread id)
   * instead of starting cold. Used by Work, where every turn of a conversation
   * has to see the previous ones.
   */
  resumeSessionId?: string | null;
  /** Aborts the agent run when the user stops it. */
  abortController: AbortController;
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

export interface OpenAICompatRunInput extends AgentRunInput {
  /** Display name of the configured provider, for the SDK's provider id. */
  providerName: string;
  /** Wire protocol: the OpenAI-compatible family, or Gemini's native API. */
  protocol: ApiProtocol;
  baseUrl: string;
  apiKey: string;
  /** Per-endpoint quirk flags — see lib/provider-capabilities.ts. */
  capabilities: ProviderCapabilities;
  /**
   * Gates the view_image tool. Unlike the other two backends, this one must be
   * told: a text-only model offered an image tool burns a turn on a call whose
   * result it cannot read.
   */
  supportsVision: boolean;
  /** USD per million tokens, when the model row carries rates. */
  inputPricePerM: number | null;
  outputPricePerM: number | null;
  /**
   * Required here, unlike the SDK backends: with no built-ins of its own this
   * backend has to be told which of lib/base-tools.ts to register.
   */
  baseTools: string[];
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
