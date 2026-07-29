import path from "node:path";
import { db } from "@/lib/db-client";
import { slugify } from "@/lib/paths";
import { storage } from "@/lib/storage";

/**
 * A Work project's image library, created on first use.
 *
 * Plain function rather than a server action so both callers work: the Assets
 * tab (through the action wrapper, which also revalidates) and the run executor,
 * which runs on the queue outside any request and would blow up on
 * `revalidatePath`.
 */
export async function ensureProjectAssetFolderRow(
  projectId: string,
): Promise<{ id: string; relPath: string }> {
  const project = await db.workProject.findUniqueOrThrow({
    where: { id: projectId },
    include: { assetFolder: true, workflow: true },
  });
  if (project.assetFolder) {
    return { id: project.assetFolder.id, relPath: project.assetFolder.relPath };
  }

  const slug = `project-${slugify(project.slug)}`;
  const relPath = path.join("data", "assets", project.workflow.slug, slug);
  await storage.ensurePrefix(relPath);

  // Re-attach rather than recreate: the folder can outlive the pointer (the
  // relation is SetNull), and `workflowId + slug` is unique, so a plain create
  // would throw instead of recovering.
  const folder = await db.assetFolder.upsert({
    where: { workflowId_slug: { workflowId: project.workflowId, slug } },
    update: {},
    create: {
      workflowId: project.workflowId,
      name: `${project.name} · library`,
      slug,
      relPath,
      notes: "Images this project's agent can reach on every turn.",
    },
  });
  await db.workProject.update({
    where: { id: projectId },
    // Keep updatedAt where it was: the executor reads it as "the brief moved",
    // and attaching a folder is not an edit to the brief.
    data: { assetFolderId: folder.id, updatedAt: project.updatedAt },
  });

  return { id: folder.id, relPath: folder.relPath };
}
