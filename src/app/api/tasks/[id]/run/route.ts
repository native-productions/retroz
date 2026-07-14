import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db-client";
import { enqueueRun } from "@/lib/run-queue";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const task = await db.task.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const run = await db.taskRun.create({
    data: { taskId: id, status: "QUEUED", trigger: "manual" },
  });
  enqueueRun(run.id);
  return NextResponse.json({ runId: run.id });
}
