import { randomUUID } from "node:crypto";
import {
  streamText,
  isStepCount,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogle } from "@ai-sdk/google";
import { z } from "zod";
import type { OpenAICompatRunInput, AgentRunResult } from "@/lib/agent-backend";
import { summarizeToolInput, type RunToolResult } from "@/lib/run-tools";
import {
  selectBaseTools,
  type BaseToolContext,
  type BaseToolResult,
} from "@/lib/base-tools";
import { loadTranscript, saveTranscript } from "@/lib/agent-transcript";

/**
 * Run one task against a user-configured model endpoint.
 *
 * Two wire protocols are supported. OPENAI covers the compatible family —
 * OpenRouter, a vendor's compatible URL, a local server. GOOGLE is Gemini's
 * native API, which exists as a separate path because Gemini's own
 * OpenAI-compatible endpoint cannot run agent tools: its 3.x models require a
 * `thought_signature` echoed back on every function call, and the OpenAI
 * protocol has nowhere to carry it.
 *
 * Everything above the model object is protocol-agnostic — the tool loop, the
 * filesystem tools (lib/base-tools.ts) and the conversation transcript
 * (lib/agent-transcript.ts) are all this app's own, since no agent SDK is
 * involved on either path.
 */

/**
 * Turn an SDK error into something a user can act on. A failed call surfaces as
 * the bare HTTP reason ("Bad Request"), which says nothing; the endpoint's own
 * response body is where the real complaint is.
 */
function describeError(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  const body = (err as { responseBody?: unknown })?.responseBody;
  if (typeof body === "string" && body.trim()) {
    return `${base} — ${body.slice(0, 800)}`;
  }
  return base;
}

/** Usage stand-in for a request that failed before producing any. */
const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputTokenDetails: {
    noCacheTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
};

/** Tool results are text-only unless they came from base-tools (images). */
type AnyToolResult = RunToolResult | BaseToolResult;

/** Map one of our tool results onto the AI SDK's model-facing output shape. */
function toModelOutput(result: AnyToolResult) {
  const value = result.content.map((part) =>
    part.type === "image"
      ? ({
          type: "file" as const,
          mediaType: part.mediaType,
          data: { type: "data" as const, data: part.data },
        })
      : ({ type: "text" as const, text: part.text }),
  );
  return { type: "content" as const, value };
}

/** Build the language model for this run's protocol. */
function buildModel(input: OpenAICompatRunInput): LanguageModel {
  const { capabilities } = input;

  if (input.protocol === "GOOGLE") {
    // The native Gemini provider carries thought signatures across turns by
    // itself, which is the whole reason this path exists.
    return createGoogle({
      name: input.providerName,
      baseURL: input.baseUrl,
      apiKey: input.apiKey,
    }).chat(input.model);
  }

  return createOpenAICompatible({
    name: input.providerName,
    baseURL: input.baseUrl,
    apiKey: input.apiKey,
    includeUsage: capabilities.includeUsage,
    supportsStructuredOutputs: capabilities.strictSchemas,
    // The last chance to bend the request to an endpoint's dialect. Everything
    // here is a divergence seen in the wild, not a hypothetical.
    transformRequestBody: (body) => {
      if (!capabilities.parallelToolCalls) body.parallel_tool_calls = false;
      if (capabilities.systemRole === "developer" && Array.isArray(body.messages)) {
        body.messages = body.messages.map((m: { role?: string }) =>
          m.role === "system" ? { ...m, role: "developer" } : m,
        );
      }
      return body;
    },
  }).chatModel(input.model);
}

export async function runApiAgent(
  input: OpenAICompatRunInput,
): Promise<AgentRunResult> {
  const startedAt = Date.now();

  const { capabilities } = input;
  const model = buildModel(input);

  // --- tools: the run's retroz tools plus the built-ins this run is allowed ---
  const baseCtx: BaseToolContext = {
    cwd: input.cwd,
    allowedDirs: [input.cwd, ...input.additionalDirectories],
  };

  const tools: ToolSet = {};

  for (const def of input.tools) {
    tools[def.name] = tool({
      description: def.description,
      inputSchema: z.object(def.shape),
      execute: async (args: unknown) => def.execute(input.toolContext, args),
      toModelOutput: ({ output }) => toModelOutput(output as AnyToolResult),
    });
  }

  for (const def of selectBaseTools(input.baseTools, {
    vision: input.supportsVision,
  })) {
    tools[def.name] = tool({
      description: def.description,
      inputSchema: z.object(def.shape),
      execute: async (args: unknown) =>
        def.execute(baseCtx, args as never),
      toModelOutput: ({ output }) => toModelOutput(output as AnyToolResult),
    });
  }

  // --- conversation: resume the stored transcript, or start one ---
  const sessionId = input.resumeSessionId ?? randomUUID();
  const messages: ModelMessage[] = input.resumeSessionId
    ? await loadTranscript(input.resumeSessionId)
    : [];
  // A resume id with no stored messages means the transcript was pruned or the
  // database was reset. Continuing with an empty history silently drops the
  // conversation, so treat it the way the executors treat a dead engine session
  // and let the caller fall back to a cold run.
  if (input.resumeSessionId && messages.length === 0) {
    throw new Error("Stored transcript for this session is no longer available.");
  }
  messages.push({ role: "user", content: input.prompt });

  await input.onSessionId(sessionId);

  let error: string | null = null;
  // Text arrives as deltas keyed by block id; the other backends record whole
  // blocks, so buffer until the block ends and emit one TEXT event.
  const textBlocks = new Map<string, string>();

  const result = streamText({
    model,
    messages,
    tools,
    stopWhen: isStepCount(capabilities.maxSteps),
    abortSignal: input.abortController.signal,
    onError: ({ error: err }) => {
      error = describeError(err);
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        textBlocks.set(part.id, (textBlocks.get(part.id) ?? "") + part.text);
        break;
      case "text-end": {
        const text = textBlocks.get(part.id)?.trim();
        textBlocks.delete(part.id);
        if (text) await input.record("TEXT", { text });
        break;
      }
      case "tool-call":
        await input.record("TOOL", {
          name: part.toolName,
          input: summarizeToolInput(part.toolName, part.input),
        });
        break;
      case "tool-error":
        // The SDK feeds the failure back as a tool result, so the model gets a
        // chance to fix a malformed call rather than the run dying on it.
        await input.record("ERROR", {
          message: `Tool ${part.toolName} failed: ${
            part.error instanceof Error ? part.error.message : String(part.error)
          }`,
        });
        break;
      case "error":
        error = describeError(part.error);
        await input.record("ERROR", { message: error });
        break;
      case "abort":
        error = "Run aborted.";
        break;
    }
  }

  // Flush any block the stream ended without closing.
  for (const text of textBlocks.values()) {
    if (text.trim()) await input.record("TEXT", { text: text.trim() });
  }

  // When the request itself failed the stream produced nothing, and awaiting
  // these throws a second, less useful error ("No output generated") that would
  // bury the real one already recorded above. Fall back to empty results and
  // report what actually went wrong.
  const settle = <T>(value: PromiseLike<T>, fallback: T): Promise<T> =>
    Promise.resolve(value).then(
      (v) => v,
      () => fallback,
    );

  const [responseMessages, usage, steps, finishReason] = await Promise.all([
    settle(result.responseMessages, []),
    settle(result.totalUsage, EMPTY_USAGE),
    settle(result.steps, []),
    settle(result.finishReason, "error" as const),
  ]);

  messages.push(...responseMessages);
  // Persist even on failure: a Work session that errored mid-turn should still
  // remember what happened when the user retries.
  await saveTranscript(sessionId, messages).catch(() => {});

  if (!error && finishReason === "error") {
    error = "The model ended the run with an error.";
  }

  const tokensIn = usage.inputTokens ?? 0;
  const tokensOut = usage.outputTokens ?? 0;
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheCreationTokens = usage.inputTokenDetails?.cacheWriteTokens ?? 0;

  return {
    ok: !error,
    error,
    tokensIn,
    tokensOut,
    cacheCreationTokens,
    cacheReadTokens,
    numTurns: steps.length,
    durationMs: Date.now() - startedAt,
    durationApiMs: null,
    // Most compat endpoints report no price, so this stays 0 unless the model
    // row carries per-million rates.
    costUsd:
      input.inputPricePerM !== null && input.outputPricePerM !== null
        ? (tokensIn / 1_000_000) * input.inputPricePerM +
          (tokensOut / 1_000_000) * input.outputPricePerM
        : 0,
    modelUsage: { [input.model]: { tokensIn, tokensOut, cacheReadTokens } },
  };
}
