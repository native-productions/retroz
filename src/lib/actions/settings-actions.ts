"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db-client";
import { settingsUpdateSchema } from "@/lib/validation";

export async function getSettings() {
  return db.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function updateSettings(input: unknown) {
  const data = settingsUpdateSchema.parse(input);
  await db.appSetting.update({
    where: { id: "singleton" },
    data: {
      engineMode: data.engineMode,
      defaultModel: data.defaultModel,
      claudeAuthMode: data.claudeAuthMode,
      codexModel: data.codexModel,
      codexReasoningEffort: data.codexReasoningEffort,
      defaultProviderModelId: data.defaultProviderModelId,
      pexelsApiKey: data.pexelsApiKey,
      tavilyApiKey: data.tavilyApiKey,
      timezone: data.timezone,
    },
  });
  revalidatePath("/settings");
  // Every scheduled label is formatted in this zone, so the Calendar is stale
  // the moment it changes.
  revalidatePath("/calendar");
}
