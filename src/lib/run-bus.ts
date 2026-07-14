import { EventEmitter } from "node:events";

// In-process pub/sub so the SSE route can stream live run events. Persisted
// RunEvent rows are the source of truth for replay; this is the live tap.
export interface RunBusEvent {
  seq: number;
  type: "TEXT" | "TOOL" | "ERROR" | "SYSTEM" | "ARTIFACT" | "STATUS";
  payload: unknown;
  ts: string;
}

const globalForBus = globalThis as unknown as { runBus?: EventEmitter };

function bus(): EventEmitter {
  if (!globalForBus.runBus) {
    globalForBus.runBus = new EventEmitter();
    globalForBus.runBus.setMaxListeners(0);
  }
  return globalForBus.runBus;
}

export function emitRunEvent(runId: string, event: RunBusEvent): void {
  bus().emit(runId, event);
}

export function subscribeRun(
  runId: string,
  handler: (event: RunBusEvent) => void,
): () => void {
  bus().on(runId, handler);
  return () => bus().off(runId, handler);
}
