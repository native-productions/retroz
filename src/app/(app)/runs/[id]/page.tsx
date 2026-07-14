import { notFound } from "next/navigation";
import { db } from "@/lib/db-client";
import { PageHeader, PageBody } from "@/components/page-header";
import { RunViewer } from "@/components/run/run-viewer";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await db.taskRun.findUnique({
    where: { id },
    include: {
      task: { include: { workflow: true } },
      events: { orderBy: { seq: "asc" } },
      artifacts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!run) notFound();

  // Non-status/artifact events form the activity log; those two seed viewer state.
  const logEvents = run.events
    .filter((e) => e.type !== "ARTIFACT" && e.type !== "STATUS")
    .map((e) => ({
      seq: e.seq,
      type: e.type as "TEXT" | "TOOL" | "ERROR" | "SYSTEM",
      payload: (e.payload ?? {}) as Record<string, unknown>,
      ts: e.ts.toISOString(),
    }));

  const runFolder = run.outputRelPath?.split("/").pop() ?? run.id;

  return (
    <>
      <PageHeader
        title={run.task.name}
        description={runFolder}
        breadcrumb={[
          { label: "Workflows", href: "/workflows" },
          {
            label: run.task.workflow.name,
            href: `/workflows/${run.task.workflowId}`,
          },
          { label: run.task.name, href: `/tasks/${run.taskId}` },
          { label: "Run" },
        ]}
      />
      <PageBody className="flex flex-col gap-5">
        <RunViewer
          runId={run.id}
          taskId={run.taskId}
          initialStatus={run.status}
          initialEvents={logEvents}
          initialArtifacts={run.artifacts.map((a) => ({
            id: a.id,
            filename: a.filename,
            relPath: a.relPath,
            width: a.width,
            height: a.height,
          }))}
          initialMeta={
            run.tokensOut > 0 || run.tokensIn > 0
              ? {
                  tokensIn: run.tokensIn,
                  tokensOut: run.tokensOut,
                  cacheCreationTokens: run.cacheCreationTokens,
                  cacheReadTokens: run.cacheReadTokens,
                  costUsd: run.costUsd,
                }
              : undefined
          }
        />
      </PageBody>
    </>
  );
}
