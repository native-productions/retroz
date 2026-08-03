import "server-only";
import { db } from "@/lib/db-client";
import { MODEL_GROUPS, DEFAULT_MODELS, type ModelOption } from "@/lib/models";
import {
  listProviderModelGroups,
  resolveDefaultProviderModelId,
} from "@/lib/provider-catalog";
import type { EngineMode } from "@/generated/prisma/enums";

/**
 * The model choices the app is currently offering.
 *
 * LOCAL and PROVIDER are exclusive: whichever mode is active, only its models
 * appear in every selector. Overrides pointing at the other side are left in the
 * database untouched — `resolveProviderModel` skips them at run time — so
 * switching back restores them.
 */
export interface ModelCatalog {
  engineMode: EngineMode;
  groups: { label: string; options: ModelOption[] }[];
  /**
   * The value a selector should show when nothing has been chosen. Empty only
   * when PROVIDER mode has no model configured at all.
   */
  defaultModel: string;
  /** Model value → display label, for rendering a stored override. */
  labels: Record<string, string>;
}

export async function getModelCatalog(): Promise<ModelCatalog> {
  const setting = await db.appSetting.findUnique({
    where: { id: "singleton" },
    select: {
      engineMode: true,
      defaultModel: true,
      defaultProviderModelId: true,
    },
  });
  const engineMode: EngineMode = setting?.engineMode ?? "LOCAL";

  const groups =
    engineMode === "PROVIDER" ? await listProviderModelGroups() : MODEL_GROUPS;

  // PROVIDER mode shares its fallback with the executors, so the model shown in
  // a picker is always the model a run would actually use.
  const defaultModel =
    engineMode === "PROVIDER"
      ? await resolveDefaultProviderModelId(
          setting?.defaultProviderModelId ?? null,
        )
      : (setting?.defaultModel ?? DEFAULT_MODELS.CLAUDE);

  const labels: Record<string, string> = {};
  // Both sides go into the label map regardless of mode: a task can still be
  // carrying an override from the inactive side and it should render as its
  // name, not a raw cuid.
  for (const group of [...MODEL_GROUPS, ...(await listProviderModelGroups())]) {
    for (const option of group.options) labels[option.value] = option.label;
  }

  return { engineMode, groups, defaultModel, labels };
}
