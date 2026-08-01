"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db-client";
import { encryptSecret, isSecretBoxConfigured } from "@/lib/secret-box";
import {
  providerCapabilitiesSchema,
  parseCapabilities,
} from "@/lib/provider-capabilities";
import {
  fetchProviderModels as fetchModelsFromEndpoint,
  resolveDefaultProviderModelId,
  type FetchModelsResult,
} from "@/lib/provider-catalog";
import {
  providerUpsertSchema,
  providerModelCreateSchema,
  providerModelUpdateSchema,
} from "@/lib/validation";

// CRUD for the OpenAI-compatible providers behind engineMode = PROVIDER.
// The stored API key is write-only from the client's perspective: it goes in
// encrypted and only ever comes back as `hasKey`.

export interface ProviderModelView {
  id: string;
  modelId: string;
  label: string;
  supportsVision: boolean;
  contextWindow: number | null;
  inputPricePerM: number | null;
  outputPricePerM: number | null;
  source: "FETCHED" | "MANUAL";
}

export interface ProviderView {
  id: string;
  name: string;
  protocol: "OPENAI" | "GOOGLE";
  baseUrl: string;
  enabled: boolean;
  hasKey: boolean;
  capabilities: Record<string, unknown>;
  models: ProviderModelView[];
}

export async function listProviders(): Promise<ProviderView[]> {
  const rows = await db.apiProvider.findMany({
    include: { models: { orderBy: { label: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    protocol: p.protocol,
    baseUrl: p.baseUrl,
    enabled: p.enabled,
    hasKey: p.apiKeyEnc.length > 0,
    capabilities: parseCapabilities(p.capabilities) as unknown as Record<
      string,
      unknown
    >,
    models: p.models.map((m) => ({
      id: m.id,
      modelId: m.modelId,
      label: m.label,
      supportsVision: m.supportsVision,
      contextWindow: m.contextWindow,
      inputPricePerM: m.inputPricePerM ? Number(m.inputPricePerM) : null,
      outputPricePerM: m.outputPricePerM ? Number(m.outputPricePerM) : null,
      source: m.source,
    })),
  }));
}

export async function upsertProvider(input: unknown): Promise<{ id: string }> {
  const data = providerUpsertSchema.parse(input);

  if (data.apiKey && !isSecretBoxConfigured()) {
    throw new Error(
      "Set RETROZ_SECRET_KEY (or AUTH_SECRET) in .env before saving an API key.",
    );
  }

  const capabilities = providerCapabilitiesSchema.parse(
    data.capabilities ?? {},
  );

  if (data.id) {
    await db.apiProvider.update({
      where: { id: data.id },
      data: {
        name: data.name,
        protocol: data.protocol,
        baseUrl: data.baseUrl,
        enabled: data.enabled,
        capabilities,
        // An empty key field on edit means "leave the stored one alone".
        ...(data.apiKey ? { apiKeyEnc: encryptSecret(data.apiKey) } : {}),
      },
    });
    revalidatePath("/settings");
    return { id: data.id };
  }

  const created = await db.apiProvider.create({
    data: {
      name: data.name,
      protocol: data.protocol,
      baseUrl: data.baseUrl,
      enabled: data.enabled,
      capabilities,
      apiKeyEnc: data.apiKey ? encryptSecret(data.apiKey) : "",
    },
    select: { id: true },
  });
  revalidatePath("/settings");
  return created;
}

export async function deleteProvider(id: string): Promise<void> {
  await db.apiProvider.delete({ where: { id } });
  // Its models cascade. Only re-point the default if it was one of them —
  // deleting a second provider must not disturb a default set on the first.
  await ensureDefaultProviderModel();
  revalidatePath("/settings");
}

export async function fetchProviderModels(
  providerId: string,
): Promise<FetchModelsResult> {
  const result = await fetchModelsFromEndpoint(providerId);
  // First provider added: pick a default now rather than leaving the setting
  // null and making the user find the picker before anything can run.
  await ensureDefaultProviderModel();
  revalidatePath("/settings");
  return result;
}

export async function addProviderModel(input: unknown): Promise<void> {
  const data = providerModelCreateSchema.parse(input);
  // Same normalisation the fetch path applies — a user pasting a slug straight
  // out of a provider's docs can carry the listing prefix with it.
  data.modelId = data.modelId.replace(/^models\//, "");
  await db.apiProviderModel.upsert({
    where: {
      providerId_modelId: {
        providerId: data.providerId,
        modelId: data.modelId,
      },
    },
    create: {
      providerId: data.providerId,
      modelId: data.modelId,
      label: data.label?.trim() || data.modelId,
      supportsVision: data.supportsVision,
      contextWindow: data.contextWindow,
      inputPricePerM: data.inputPricePerM,
      outputPricePerM: data.outputPricePerM,
      source: "MANUAL",
    },
    update: {
      label: data.label?.trim() || data.modelId,
      supportsVision: data.supportsVision,
      contextWindow: data.contextWindow,
      inputPricePerM: data.inputPricePerM,
      outputPricePerM: data.outputPricePerM,
      source: "MANUAL",
    },
  });
  await ensureDefaultProviderModel();
  revalidatePath("/settings");
}

export async function updateProviderModel(input: unknown): Promise<void> {
  const data = providerModelUpdateSchema.parse(input);
  const { id, ...rest } = data;
  await db.apiProviderModel.update({ where: { id }, data: rest });
  revalidatePath("/settings");
}

export async function deleteProviderModel(id: string): Promise<void> {
  await db.apiProviderModel.delete({ where: { id } });
  await db.appSetting.updateMany({
    where: { id: "singleton", defaultProviderModelId: id },
    data: { defaultProviderModelId: null },
  });
  await ensureDefaultProviderModel();
  revalidatePath("/settings");
}

/**
 * Keep the stored default pointed at a model that exists.
 *
 * Runs already fall back on their own (resolveDefaultProviderModelId), so this
 * is not what makes them work — it is what makes the settings page show the
 * same answer instead of an empty picker.
 */
async function ensureDefaultProviderModel(): Promise<void> {
  const setting = await db.appSetting.findUnique({
    where: { id: "singleton" },
    select: { defaultProviderModelId: true },
  });
  const resolved = await resolveDefaultProviderModelId(
    setting?.defaultProviderModelId ?? null,
  );
  if (!resolved || resolved === setting?.defaultProviderModelId) return;

  await db.appSetting.updateMany({
    where: { id: "singleton" },
    data: { defaultProviderModelId: resolved },
  });
}
