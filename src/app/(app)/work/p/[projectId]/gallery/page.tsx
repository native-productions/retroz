import { notFound } from "next/navigation";
import { db } from "@/lib/db-client";
import { WorkProjectBar } from "@/components/work/work-project-bar";
import { WorkGallery } from "@/components/work/work-gallery";
import { listProjectRenders } from "@/lib/work-bundle-queries";
import { listWorkProjects, listWorkflowOptions } from "@/lib/work-queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gallery — Retroz" };

/**
 * Every render in a project, in one place. Project-scoped rather than
 * session-scoped, so it sits under the Work chrome bar and drops the session
 * rail — a contact sheet wants the width.
 */
export default async function WorkGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ add?: string }>;
}) {
  const [{ projectId }, { add }] = await Promise.all([params, searchParams]);

  const [projects, workflows, renders] = await Promise.all([
    listWorkProjects(),
    listWorkflowOptions(),
    listProjectRenders(projectId),
  ]);

  if (!projects.some((p) => p.id === projectId)) notFound();

  // Add-mode: the picker is filling a bundle that already exists.
  const target = add
    ? await db.workBundle.findFirst({
        where: { id: add, projectId },
        select: { id: true, name: true },
      })
    : null;

  // Only the sessions that actually produced something belong in the filter.
  const sessions = [
    ...new Map(
      renders.map((r) => [r.sessionId, { id: r.sessionId, title: r.sessionTitle }]),
    ).values(),
  ].filter((s) => s.id);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkProjectBar
        projects={projects}
        activeProjectId={projectId}
        tab="gallery"
        workflows={workflows}
      />
      <WorkGallery
        projectId={projectId}
        renders={renders}
        sessions={sessions}
        target={target}
      />
    </div>
  );
}
