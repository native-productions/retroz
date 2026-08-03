import { db } from "@/lib/db-client";

// The one zone every scheduled surface renders in. It lives on the singleton
// AppSetting row, and this is the only reader — a bundle's publish slot, a cron
// occurrence, and a campaign label must all resolve against the same string or
// the Calendar would show three different days for the same afternoon.

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

/** The app timezone, falling back to the default before settings are seeded. */
export async function getAppTimezone(): Promise<string> {
  const row = await db.appSetting.findUnique({
    where: { id: "singleton" },
    select: { timezone: true },
  });
  return row?.timezone || DEFAULT_TIMEZONE;
}
