import {
  query,
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeRunInput, AgentRunResult } from "@/lib/agent-backend";
import { summarizeToolInput } from "@/lib/run-tools";

const DEFAULT_BASE_TOOLS = ["Read", "Write", "Glob", "Grep", "Bash"];

/** Run one task on the local Claude Code engine (Agent SDK). */
export async function runClaudeAgent(input: ClaudeRunInput): Promise<AgentRunResult> {
  // In-process MCP server wrapping this run's tool set (render or planner).
  const mcpServer = createSdkMcpServer({
    name: "retroz",
    version: "1.0.0",
    tools: input.tools.map((t) =>
      tool(t.name, t.description, t.shape, (args) =>
        t.execute(input.toolContext, args),
      ),
    ),
  });

  const allowedTools = [
    ...(input.baseTools ?? DEFAULT_BASE_TOOLS),
    ...input.tools.map((t) => `mcp__retroz__${t.name}`),
  ];

  // Subscription auth: strip the API key so the CLI uses the local login.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") env[k] = v;
  }
  if (input.stripApiKey) {
    delete env.ANTHROPIC_API_KEY;
  }

  const response = query({
    prompt: input.prompt,
    options: {
      model: input.model,
      cwd: input.cwd,
      additionalDirectories: input.additionalDirectories,
      settingSources: ["user", "project"],
      skills: input.skills,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      allowedTools,
      mcpServers: { retroz: mcpServer },
      includePartialMessages: false,
      env,
    },
  });

  let sessionSaved = false;
  let result: AgentRunResult | null = null;

  for await (const message of response) {
    if (message.type === "system") {
      if (!sessionSaved && message.session_id) {
        sessionSaved = true;
        await input.onSessionId(message.session_id);
      }
      continue;
    }

    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          await input.record("TEXT", { text: block.text });
        } else if (block.type === "tool_use") {
          await input.record("TOOL", {
            name: block.name,
            input: summarizeToolInput(block.name, block.input),
          });
        }
      }
      continue;
    }

    if (message.type === "result") {
      // Both success and error results carry usage — tokens are spent either
      // way, so never drop them on failure.
      const usage = message.usage;
      const ok = message.subtype === "success" && !message.is_error;
      result = {
        ok,
        error: ok
          ? null
          : message.subtype === "success"
            ? "Run reported an error."
            : `Run failed: ${message.subtype}`,
        tokensIn: usage?.input_tokens ?? 0,
        tokensOut: usage?.output_tokens ?? 0,
        cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
        numTurns: message.num_turns ?? 0,
        durationMs: message.duration_ms ?? null,
        durationApiMs: message.duration_api_ms ?? null,
        costUsd: message.total_cost_usd ?? 0,
        modelUsage: (message.modelUsage ?? null) as object | null,
      };
    }
  }

  return (
    result ?? {
      ok: false,
      error: "Run ended without a result message.",
      tokensIn: 0,
      tokensOut: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      numTurns: 0,
      durationMs: null,
      durationApiMs: null,
      costUsd: 0,
      modelUsage: null,
    }
  );
}
