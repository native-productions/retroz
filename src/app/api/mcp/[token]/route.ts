import { z } from "zod";
import { getToolEntry } from "@/lib/run-tools";

// Streamable-HTTP MCP endpoint serving the retroz tools to the Codex CLI,
// which runs out-of-process and cannot use the in-process SDK server.
// Stateless: every request carries the per-run token minted by the executor;
// the token is the auth (unguessable, live only while its run is active), so
// this path is excluded from the session gate in proxy.ts.

export const runtime = "nodejs";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: number | string, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: number | string, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const entry = getToolEntry(token);
  if (!entry) return new Response("Unknown run", { status: 404 });
  const { ctx, tools } = entry;

  const msg = (await req.json()) as JsonRpcMessage;

  // Notifications (no id) need no response body.
  if (msg.id === undefined || msg.id === null) {
    return new Response(null, { status: 202 });
  }

  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id, {
        protocolVersion: (msg.params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "retroz", version: "1.0.0" },
      });

    case "ping":
      return rpcResult(msg.id, {});

    case "tools/list":
      return rpcResult(msg.id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: z.toJSONSchema(z.object(t.shape)),
        })),
      });

    case "tools/call": {
      const name = msg.params?.name as string | undefined;
      const def = tools.find((t) => t.name === name);
      if (!def) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      const parsed = z.object(def.shape).safeParse(msg.params?.arguments ?? {});
      if (!parsed.success) {
        return rpcError(msg.id, -32602, `Invalid arguments: ${parsed.error.message}`);
      }
      return rpcResult(msg.id, await def.execute(ctx, parsed.data));
    }

    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// No server-initiated stream; clients polling GET get a clean 405 per spec.
export function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}
