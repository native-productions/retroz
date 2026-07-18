import { auth } from "@/lib/auth";
import { db } from "@/lib/db-client";
import { subscribeRun, type RunBusEvent } from "@/lib/run-bus";

// Live SSE for a phase-1 campaign planner run. Mirrors runs/[id]/stream but keyed
// on campaignPlanRunId (planner events flow on the same run-bus).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const planRun = await db.campaignPlanRun.findUnique({ where: { id } });
  if (!planRun) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let closeStream: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let unsubscribe: () => void = () => {};
      let hb: ReturnType<typeof setInterval> | null = null;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      const send = (event: RunBusEvent) => {
        write(`data: ${JSON.stringify(event)}\n\n`);
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (hb) clearInterval(hb);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      closeStream = close;

      // 1) replay persisted history
      const history = await db.runEvent.findMany({
        where: { campaignPlanRunId: id },
        orderBy: { seq: "asc" },
      });
      const lastSeq = history.length ? history[history.length - 1].seq : -1;
      for (const e of history) {
        send({
          seq: e.seq,
          type: e.type as RunBusEvent["type"],
          payload: e.payload,
          ts: e.ts.toISOString(),
        });
      }

      const fresh = await db.campaignPlanRun.findUnique({ where: { id } });
      if (
        fresh &&
        (fresh.status === "DONE" ||
          fresh.status === "FAILED" ||
          fresh.status === "CANCELLED")
      ) {
        send({
          seq: lastSeq + 1,
          type: "STATUS",
          payload: { status: fresh.status, final: true },
          ts: new Date().toISOString(),
        });
        close();
        return;
      }

      // 2) live tap
      unsubscribe = subscribeRun(id, (event) => {
        if (closed) return;
        if (event.seq <= lastSeq) return;
        send(event);
        if (
          event.type === "STATUS" &&
          typeof event.payload === "object" &&
          event.payload !== null &&
          "status" in event.payload &&
          (event.payload as { status: string }).status !== "RUNNING"
        ) {
          setTimeout(close, 50);
        }
      });

      hb = setInterval(() => {
        if (closed) return;
        write(`: ping\n\n`);
      }, 15000);
    },
    cancel() {
      closeStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
