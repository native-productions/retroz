import PQueue from "p-queue";
import { executeRun } from "@/lib/run-executor";

// Serial queue — never run two agent spawns at once. Survives HMR via global.
const globalForQueue = globalThis as unknown as { runQueue?: PQueue };

function queue(): PQueue {
  if (!globalForQueue.runQueue) {
    globalForQueue.runQueue = new PQueue({ concurrency: 1 });
  }
  return globalForQueue.runQueue;
}

/** Enqueue a QUEUED TaskRun for execution. Non-blocking. */
export function enqueueRun(taskRunId: string): void {
  void queue().add(() => executeRun(taskRunId));
}

/**
 * Run an arbitrary Claude-spawning job on the same serial queue and await its
 * result. Used by asset captioning so a caption never spawns a second Claude
 * alongside a running task.
 */
export function runOnClaudeQueue<T>(fn: () => Promise<T>): Promise<T> {
  return queue().add(fn) as Promise<T>;
}

export function queueSize(): number {
  return queue().size + queue().pending;
}
