import Link from "next/link";
import { Workflow, Image as ImageIcon, Clock, Rocket } from "lucide-react";
import { db } from "@/lib/db-client";
import { PageHeader, PageBody, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/ui-button";
import { Card } from "@/components/ui/ui-card";
import { Badge } from "@/components/ui/ui-badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [workflowCount, taskCount, runCount, recentRuns] = await Promise.all([
    db.workflow.count(),
    db.task.count(),
    db.taskRun.count(),
    db.taskRun.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { task: { include: { workflow: true } } },
    }),
  ]);

  const stats = [
    { label: "Workflows", value: workflowCount, icon: Workflow },
    { label: "Tasks", value: taskCount, icon: Rocket },
    { label: "Runs", value: runCount, icon: Clock },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your productivity assistant."
        breadcrumb={[{ label: "Dashboard" }]}
      >
        <Button asChild>
          <Link href="/workflows">
            <Workflow className="size-4" /> New workflow
          </Link>
        </Button>
      </PageHeader>

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wide text-fg-muted">
                    {label}
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold">{value}</p>
                </div>
                <div className="grid size-10 place-items-center rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 text-secondary">
                  <Icon className="size-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold">Recent runs</h2>
          {recentRuns.length === 0 ? (
            <EmptyState
              icon={<ImageIcon className="size-6" />}
              title="No runs yet"
              description="Create a workflow, upload assets, then build a task for Claude to run."
              action={
                <Button asChild variant="secondary">
                  <Link href="/workflows">Start a workflow</Link>
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {recentRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="retro-card retro-press flex items-center justify-between p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{run.task.name}</p>
                    <p className="truncate text-xs text-fg-muted font-mono">
                      {run.task.workflow.name}
                    </p>
                  </div>
                  <Badge
                    tone={
                      run.status === "DONE"
                        ? "primary"
                        : run.status === "FAILED"
                          ? "danger"
                          : run.status === "RUNNING"
                            ? "accent"
                            : "muted"
                    }
                  >
                    {run.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}
