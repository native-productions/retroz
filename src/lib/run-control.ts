// Per-run AbortControllers so a stop action can cancel an in-flight agent run.
// Survives HMR via a global, like the run queue and tool-context registry.

const globalForRunControl = globalThis as unknown as {
  runControllers?: Map<string, AbortController>;
};

function controllers(): Map<string, AbortController> {
  if (!globalForRunControl.runControllers) {
    globalForRunControl.runControllers = new Map();
  }
  return globalForRunControl.runControllers;
}

export function registerRunController(
  taskRunId: string,
  controller: AbortController,
): void {
  controllers().set(taskRunId, controller);
}

export function getRunController(taskRunId: string): AbortController | undefined {
  return controllers().get(taskRunId);
}

export function releaseRunController(taskRunId: string): void {
  controllers().delete(taskRunId);
}
