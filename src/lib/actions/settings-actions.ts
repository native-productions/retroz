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
      defaultModel: data.defaultModel,
      claudeAuthMode: data.claudeAuthMode,
      codexModel: data.codexModel,
      codexReasoningEffort: data.codexReasoningEffort,
    },
  });
  revalidatePath("/settings");
}
