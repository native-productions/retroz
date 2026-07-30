import type {
  WorkMessage,
  WorkPlanStep,
  WorkStepStatus,
} from "@/lib/work-types";

/**
 * Pure mappers from run events to Work view models. Shared by the server (which
 * replays persisted RunEvent rows) and the client (which receives the same
 * shapes live over SSE), so history and the live turn always render alike.
 */

export interface WorkEvent {
  seq: number;
  type: "TEXT" | "TOOL" | "ERROR" | "SYSTEM" | "ARTIFACT" | "STATUS";
  payload: unknown;
  ts: string;
}

/** `mcp__retroz__render_html_to_png` reads better as `render_html_to_png`. */
export function toolLabel(name: string): string {
  return name.replace(/^mcp__[^_]+__/, "");
}

export function timeLabel(ts: string): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** One-line summary of a tool call for the conversation's tool rows. */
export function describeTool(name: string, input: unknown): string {
  const i = asRecord(input);
  const label = toolLabel(name);

  if (label === "render_html_to_png") {
    const size = i.width && i.height ? ` — ${i.width}×${i.height}` : "";
    return `${i.filename ?? "image.png"}${size}`;
  }
  if (label === "search_assets") return String(i.query ?? "");
  if (label === "list_assets") return "all source photos";
  if (label === "web_search") return String(i.query ?? "");
  // summarizeToolInput rewrites the URLs to hostnames before they are persisted.
  if (label === "web_extract") {
    const sources = Array.isArray(i.sources) ? i.sources : [];
    return sources.length > 0 ? sources.join(", ") : "web sources";
  }
  if (label === "TodoWrite") {
    const todos = Array.isArray(i.todos) ? i.todos : [];
    return `${todos.length} step${todos.length === 1 ? "" : "s"}`;
  }
  if (typeof i.command === "string") return i.command;
  if (typeof i.file_path === "string") return i.file_path;
  if (typeof i.pattern === "string") return i.pattern;

  const compact = JSON.stringify(input ?? {});
  return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}

/**
 * Map one run event onto a conversation row. Returns null for events the
 * conversation does not show (artifacts go to the canvas, status drives the
 * header, system messages are engine noise).
 */
export function eventToMessage(
  runId: string,
  event: WorkEvent,
  opts: { live?: boolean } = {},
): WorkMessage | null {
  const id = `${runId}-${event.seq}`;
  const at = timeLabel(event.ts);
  const payload = asRecord(event.payload);

  if (event.type === "TEXT") {
    const text = String(payload.text ?? "").trim();
    if (!text) return null;
    return { id, role: "assistant", timeLabel: at, text };
  }

  if (event.type === "TOOL") {
    const name = String(payload.name ?? "tool");
    return {
      id,
      role: "tool",
      timeLabel: at,
      tool: toolLabel(name),
      detail: describeTool(name, payload.input),
      // Tool events are recorded at call time; only the newest one in a live
      // run is still in flight.
      status: opts.live ? "running" : "done",
    };
  }

  if (event.type === "ERROR") {
    return {
      id,
      role: "tool",
      timeLabel: at,
      tool: "error",
      detail: String(payload.message ?? "Run failed."),
      status: "error",
    };
  }

  return null;
}

/** Replay a run's events into conversation rows, in order. */
export function eventsToMessages(
  runId: string,
  events: WorkEvent[],
): WorkMessage[] {
  const rows: WorkMessage[] = [];
  for (const event of events) {
    const row = eventToMessage(runId, event);
    if (row) rows.push(row);
  }
  return rows;
}

const TODO_STATUS: Record<string, WorkStepStatus> = {
  completed: "done",
  in_progress: "running",
  pending: "pending",
};

/**
 * The plan panel reads the agent's own todo list. Both engines are normalised
 * into a `TodoWrite` tool event carrying `todos`, so the latest one wins.
 */
export function planFromEvents(events: WorkEvent[]): WorkPlanStep[] {
  let latest: unknown[] | null = null;
  let erroredAfterTodos = false;

  for (const event of events) {
    const payload = asRecord(event.payload);
    if (
      event.type === "TOOL" &&
      toolLabel(String(payload.name ?? "")) === "TodoWrite"
    ) {
      const todos = asRecord(payload.input).todos;
      if (Array.isArray(todos)) {
        latest = todos;
        erroredAfterTodos = false;
      }
      continue;
    }
    if (event.type === "ERROR" && latest) erroredAfterTodos = true;
  }

  if (!latest) return [];

  return latest.map((raw, i) => {
    const todo = asRecord(raw);
    const status = TODO_STATUS[String(todo.status ?? "pending")] ?? "pending";
    return {
      id: `todo-${i}`,
      label: String(todo.content ?? todo.activeForm ?? `Step ${i + 1}`),
      detail:
        typeof todo.activeForm === "string" && status === "running"
          ? todo.activeForm
          : undefined,
      // An error after the last todo update stalls whatever was in flight.
      status: erroredAfterTodos && status === "running" ? "blocked" : status,
    };
  });
}
