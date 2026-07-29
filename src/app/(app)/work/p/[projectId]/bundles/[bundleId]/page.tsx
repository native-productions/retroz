import { notFound } from "next/navigation";
import { WorkProjectBar } from "@/components/work/work-project-bar";
import { WorkBundleEditor } from "@/components/work/work-bundle-editor";
import { getWorkBundle } from "@/lib/work-bundle-queries";
import { listWorkProjects, listWorkflowOptions } from "@/lib/work-queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bundleId: string }>;
}) {
  const { bundleId } = await params;
  const bundle = await getWorkBundle(bundleId);
  return { title: `${bundle?.name ?? "Bundle"} — Retroz` };
}

export default async function WorkBundlePage({
  params,
}: {
  params: Promise<{ projectId: string; bundleId: string }>;
}) {
  const { projectId, bundleId } = await params;

  const [projects, workflows, bundle] = await Promise.all([
    listWorkProjects(),
    listWorkflowOptions(),
    getWorkBundle(bundleId),
  ]);

  if (!bundle || bundle.projectId !== projectId) notFound();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorkProjectBar
        projects={projects}
        activeProjectId={projectId}
        tab="bundles"
        workflows={workflows}
      />
      <WorkBundleEditor key={bundle.id} bundle={bundle} />
    </div>
  );
}
