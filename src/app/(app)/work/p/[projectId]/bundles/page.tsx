import { notFound } from "next/navigation";
import { WorkProjectBar } from "@/components/work/work-project-bar";
import { WorkBundleGrid } from "@/components/work/work-bundle-grid";
import { listWorkBundles } from "@/lib/work-bundle-queries";
import { listWorkProjects, listWorkflowOptions } from "@/lib/work-queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bundles — Retroz" };

export default async function WorkBundlesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [projects, workflows, bundles] = await Promise.all([
    listWorkProjects(),
    listWorkflowOptions(),
    listWorkBundles(projectId),
  ]);

  if (!projects.some((p) => p.id === projectId)) notFound();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkProjectBar
        projects={projects}
        activeProjectId={projectId}
        tab="bundles"
        workflows={workflows}
      />
      <WorkBundleGrid projectId={projectId} bundles={bundles} />
    </div>
  );
}
