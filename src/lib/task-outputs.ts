import { db } from "@/lib/db-client";
import { storage } from "@/lib/storage";

/**
 * Hard-delete the stored run output folders (data/tasks/**) for the given
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
        ? storage.deletePrefix(r.outputRelPath).catch(() => {})
        : Promise.resolve(),
    ),
  );
}
