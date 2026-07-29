import { WorkPage } from "@/components/work/work-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Work — Retroz" };

export default async function WorkSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <WorkPage sessionId={sessionId} />;
}
