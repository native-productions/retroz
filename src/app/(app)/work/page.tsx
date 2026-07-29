import { redirect } from "next/navigation";
import { WorkPage } from "@/components/work/work-page";
import { newestWorkSessionId } from "@/lib/work-queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Work — Retroz" };

/**
 * Work is a full-height, three-column playground rather than a scrolling page,
 * so it skips PageHeader and hands the whole viewport to the workspace. With a
 * session on record it opens the most recent one.
 */
export default async function WorkIndexPage() {
  const newest = await newestWorkSessionId();
  if (newest) redirect(`/work/${newest}`);
  return <WorkPage />;
}
