import fs from "node:fs/promises";
import { db } from "@/lib/db-client";
import { toAbsolute } from "@/lib/paths";

/**
 * Hard-delete the on-disk run output folders (data/tasks/**) for the given
 * tasks. Call this BEFORE deleting the task rows — the cascade wipes the TaskRun
 * records whose outputRelPath we read here.
 */
export async function removeTaskOutputs(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  const runs = await db.taskRun.findMany({
    where: { taskId: { in: taskIds }, outputRelPath: { not: null } },
    select: { outputRelPath: true },
  });
  await Promise.all(
    runs.map((r) =>
      r.outputRelPath
        ? fs
            .rm(toAbsolute(r.outputRelPath), { recursive: true, force: true })
            .catch(() => {})
        : Promise.resolve(),
    ),
  );
}
