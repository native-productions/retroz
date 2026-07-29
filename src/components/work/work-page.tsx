import { WorkWorkspace } from "@/components/work/work-workspace";
import { listWorkBundles } from "@/lib/work-bundle-queries";
import {
  getWorkSessionDetail,
  listWorkProjects,
  listWorkSessions,
  listWorkflowOptions,
} from "@/lib/work-queries";

/**
 * Server half of the Work page: loads the rail, the open session, and the
 * workflows a new project can hang off, then hands them to the client shell.
 * Shared by `/work` and `/work/[sessionId]` so both routes stay one-liners.
 */
export async function WorkPage({ sessionId }: { sessionId?: string }) {
  const [projects, sessions, workflows] = await Promise.all([
    listWorkProjects(),
    listWorkSessions(),
    listWorkflowOptions(),
  ]);

  const detail = sessionId ? await getWorkSessionDetail(sessionId) : null;

  // The canvas can collect a render straight into a bundle, so the open
  // session's project brings its bundles along.
  const projectId = detail?.projectId ?? projects[0]?.id ?? null;
  const bundles = projectId ? await listWorkBundles(projectId) : [];

  return (
    <WorkWorkspace
      projects={projects}
      sessions={sessions}
      workflows={workflows}
      bundles={bundles}
      detail={detail}
    />
  );
}
