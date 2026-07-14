// Token/cost aggregation over TaskRun rows. On-read only — no denormalized
// rollups (local, low-volume; keeps writes simple and the numbers always
// correct). Reused by the run/task/workflow/schedule views and, later, the
// dashboard.
import { db } from "@/lib/db-client";
import type { Prisma, RunStatus } from "@/generated/prisma/client";

export interface UsageTotals {
  runs: number;
  tokensIn: number;
  tokensOut: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** input + output + cache (creation + read) — the full token footprint. */
  totalTokens: number;
  costUsd: number;
}

export interface UsageFilter {
  /** Restrict to specific run statuses (default: all). */
  status?: RunStatus | RunStatus[];
}

async function sumUsage(
  where: Prisma.TaskRunWhereInput,
  filter?: UsageFilter,
): Promise<UsageTotals> {
  const statusWhere = filter?.status
    ? { status: { in: Array.isArray(filter.status) ? filter.status : [filter.status] } }
    : {};
  const agg = await db.taskRun.aggregate({
    where: { ...where, ...statusWhere },
    _count: { _all: true },
    _sum: {
      tokensIn: true,
      tokensOut: true,
      cacheCreationTokens: true,
      cacheReadTokens: true,
      costUsd: true,
    },
  });
  const tokensIn = agg._sum.tokensIn ?? 0;
  const tokensOut = agg._sum.tokensOut ?? 0;
  const cacheCreationTokens = agg._sum.cacheCreationTokens ?? 0;
  const cacheReadTokens = agg._sum.cacheReadTokens ?? 0;
  return {
    runs: agg._count._all,
    tokensIn,
    tokensOut,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens: tokensIn + tokensOut + cacheCreationTokens + cacheReadTokens,
    costUsd: agg._sum.costUsd ?? 0,
  };
}

/** Totals for a single run. */
export function runUsage(runId: string, filter?: UsageFilter) {
  return sumUsage({ id: runId }, filter);
}

/** Totals across every run of a task. */
export function taskUsage(taskId: string, filter?: UsageFilter) {
  return sumUsage({ taskId }, filter);
}

/** Totals across every run of every task in a workflow. */
export function workflowUsage(workflowId: string, filter?: UsageFilter) {
  return sumUsage({ task: { workflowId } }, filter);
}

/** Totals across every run fired by a schedule. */
export function scheduleUsage(scheduleId: string, filter?: UsageFilter) {
  return sumUsage({ scheduleId }, filter);
}
