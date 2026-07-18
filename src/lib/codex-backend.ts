import { Codex } from "@openai/codex-sdk";
import type {
  ModelReasoningEffort,
  ThreadItem,
  Usage,
} from "@openai/codex-sdk";
import type {
  CodexRunInput,
  AgentRunResult,
  RecordEvent,
} from "@/lib/agent-backend";
import { summarizeToolInput } from "@/lib/run-tools";

/**
 * Run one task on the local Codex CLI engine (bundled by @openai/codex-sdk,
 * authenticated via ~/.codex). The retroz tools are reached over the per-run
 * HTTP MCP endpoint because Codex runs as a separate process.
 */
export async function runCodexAgent(input: CodexRunInput): Promise<AgentRunResult> {
  const codex = new Codex({
    config: {
      mcp_servers: { retroz: { url: input.mcpServerUrl } },
    },
  });

  const thread = codex.startThread({
    model: input.model,
    modelReasoningEffort: input.reasoningEffort as ModelReasoningEffort,
    workingDirectory: input.cwd,
    additionalDirectories: input.additionalDirectories,
    // Codex cancels MCP tool calls under a restricted sandbox, which would kill
    // the renderer. Full access matches the Claude path (bypassPermissions).
    sandboxMode: "danger-full-access",
    approvalPolicy: "never",
    skipGitRepoCheck: true,
  });

  const startedAt = Date.now();
  const usage: Usage = {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
  };
  let numTurns = 0;
  let error: string | null = null;

  const { events } = await thread.runStreamed(input.prompt);
  for await (const event of events) {
    switch (event.type) {
      case "thread.started":
        await input.onSessionId(event.thread_id);
        break;
      case "item.completed":
        await recordItem(input.record, event.item);
        break;
      case "turn.completed":
        numTurns += 1;
        usage.input_tokens += event.usage.input_tokens;
        usage.cached_input_tokens += event.usage.cached_input_tokens;
        usage.output_tokens += event.usage.output_tokens;
        usage.reasoning_output_tokens += event.usage.reasoning_output_tokens;
        break;
      case "turn.failed":
        error = event.error.message;
        break;
      case "error":
        error = event.message;
        break;
    }
  }

  return {
    ok: !error,
    error,
    tokensIn: usage.input_tokens,
    tokensOut: usage.output_tokens,
    cacheCreationTokens: 0,
    cacheReadTokens: usage.cached_input_tokens,
    numTurns,
    durationMs: Date.now() - startedAt,
    durationApiMs: null,
    // Codex reports no cost; usage detail is kept for the run viewer.
    costUsd: 0,
    modelUsage: { [input.model]: usage },
  };
}

/** Map completed Codex thread items onto the app's run-event stream. */
async function recordItem(record: RecordEvent, item: ThreadItem): Promise<void> {
  switch (item.type) {
    case "agent_message":
      if (item.text.trim()) await record("TEXT", { text: item.text });
      break;
    case "command_execution":
      await record("TOOL", {
        name: "Bash",
        input: { command: item.command, exitCode: item.exit_code ?? null },
      });
      break;
    case "mcp_tool_call": {
      // Same display name the Claude backend produces for MCP tools.
      const name = `mcp__${item.server}__${item.tool}`;
      await record("TOOL", {
        name,
        input: summarizeToolInput(name, item.arguments),
      });
      break;
    }
    case "file_change":
      await record("TOOL", {
        name: "Write",
        input: { changes: item.changes.map((c) => `${c.kind} ${c.path}`) },
      });
      break;
    case "web_search":
      await record("TOOL", { name: "WebSearch", input: { query: item.query } });
      break;
    case "error":
      await record("ERROR", { message: item.message });
      break;
    // reasoning + todo_list are progress noise — not part of the run log.
  }
}
