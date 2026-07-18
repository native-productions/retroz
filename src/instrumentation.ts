// Next.js runs this once when the server process boots (Node runtime only).
// Used to start the cron scheduler + run queue. Guarded so it never runs on
// the edge runtime or during build.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootScheduler } = await import("@/lib/cron-scheduler");
  await bootScheduler();
  const { bootCampaignTicker } = await import("@/lib/campaign-ticker");
  bootCampaignTicker();
}
