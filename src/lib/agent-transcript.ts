import "server-only";
import type { ModelMessage } from "ai";
import { db } from "@/lib/db-client";

/**
 * Conversation state for the OPENAI_COMPAT engine.
 *
 * Claude Code and the Codex CLI hold their own transcripts behind a session id
 * and a thread id; resuming is just handing the id back. A raw model API holds
 * nothing, so a resumable Work session needs the messages stored here, keyed by
 * the session id this app mints.
 */

/** Messages kept when a transcript is trimmed. */
const MAX_MESSAGES = 120;
/**
 * Rough serialized budget. This workload puts entire HTML documents into tool
 * calls, so message count alone is a poor proxy for context size — a handful of
 * render calls can outweigh a hundred short turns.
 */
const MAX_CHARS = 600_000;

export async function loadTranscript(
  sessionId: string,
): Promise<ModelMessage[]> {
  const row = await db.agentTranscript.findUnique({ where: { id: sessionId } });
  if (!row) return [];
  return Array.isArray(row.messages) ? (row.messages as ModelMessage[]) : [];
}

export async function saveTranscript(
  sessionId: string,
  messages: ModelMessage[],
): Promise<void> {
  const trimmed = trimTranscript(messages);
  await db.agentTranscript.upsert({
    where: { id: sessionId },
    create: { id: sessionId, messages: trimmed as object },
    update: { messages: trimmed as object },
  });
}

/**
 * Drop the oldest messages until the transcript fits.
 *
 * Cuts are only made at a `user` message. An assistant tool call and its tool
 * result must stay together — starting a transcript on an orphaned tool result
 * is rejected by every endpoint — and a user message is always a safe boundary
 * because tool exchanges only ever follow one.
 */
export function trimTranscript(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length === 0) return messages;

  // A leading system message is instructions, not history: keep it whatever else goes.
  const hasSystem = messages[0]?.role === "system";
  const system = hasSystem ? [messages[0]] : [];
  let body = hasSystem ? messages.slice(1) : messages;

  const size = (list: ModelMessage[]) => JSON.stringify(list).length;

  while (
    body.length > 2 &&
    (body.length > MAX_MESSAGES || size(body) > MAX_CHARS)
  ) {
    // Find the next user message after the current head and cut there.
    const next = body.findIndex((m, i) => i > 0 && m.role === "user");
    if (next === -1) break;
    body = body.slice(next);
  }

  return [...system, ...body];
}
