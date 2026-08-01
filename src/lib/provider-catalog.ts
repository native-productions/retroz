import "server-only";
import { db } from "@/lib/db-client";
import { decryptSecret, tryDecryptSecret } from "@/lib/secret-box";
import {
  parseCapabilities,
  type ProviderCapabilities,
} from "@/lib/provider-capabilities";
import type { ApiProtocol } from "@/generated/prisma/enums";

// The OpenAI-compatible provider catalog: discovering a provider's models,
// and resolving one back into everything a run needs (base URL, decrypted key,
// quirk flags). Nothing here ever hands a decrypted key to a client component.

/** Trim a trailing slash so `${baseUrl}/models` never doubles up. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * Normalise a slug from a `/models` listing into what the chat endpoint wants.
 *
 * Google's listing returns `models/gemini-2.5-flash` while its chat endpoint
 * only accepts `gemini-2.5-flash`; sending the prefixed form 404s. No
 * OpenAI-compatible chat endpoint expects that prefix, so stripping it is safe.
 */
function normalizeModelId(modelId: string): string {
  return modelId.replace(/^models\//, "");
}

/** Best-effort human label from a raw model slug: "openai/gpt-5.4" -> "GPT-5.4". */
function labelFor(modelId: string): string {
  const tail = modelId.split("/").pop() ?? modelId;
  return tail
    .split(/[-_]/)
    .map((part) =>
      /^[a-z]/.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part.toUpperCase(),
    )
    .join(" ");
}

/**
 * A model listing entry can carry vision support in several shapes depending on
 * the gateway (OpenRouter nests it under architecture.input_modalities, others
 * expose a flat modality list). Check every one we have seen rather than
 * guessing from the slug.
 */
function detectVision(raw: Record<string, unknown>): boolean {
  const arch = raw.architecture as Record<string, unknown> | undefined;
  const modalities = [
    arch?.input_modalities,
    arch?.modality,
    raw.input_modalities,
    raw.modalities,
  ];
  for (const value of modalities) {
    if (Array.isArray(value) && value.some((m) => String(m).includes("image"))) {
      return true;
    }
    if (typeof value === "string" && value.includes("image")) return true;
  }
  return false;
}

function detectContextWindow(raw: Record<string, unknown>): number | null {
  for (const key of [
    "context_length",
    "context_window",
    "max_context_tokens",
    // Google's own field name.
    "inputTokenLimit",
  ]) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/** Model families in Google's catalog that cannot hold a text conversation. */
const GOOGLE_NON_CHAT = /embedding|aqa|tts|imagen|veo|native-audio|live|image$/i;

/**
 * Google's listing covers every modality it serves. Keep only models that
 * expose `generateContent` and are not a speech, embedding, or media family —
 * the rest would just be noise in the run-config selectors.
 */
function isGoogleChatModel(
  raw: Record<string, unknown>,
  modelId: string,
): boolean {
  const methods = raw.supportedGenerationMethods;
  if (Array.isArray(methods) && !methods.includes("generateContent")) {
    return false;
  }
  return !GOOGLE_NON_CHAT.test(modelId);
}

/**
 * Google publishes no modality data on its listing, but every current Gemini
 * chat model accepts images. Anything else is left off and can be switched on
 * by hand in Settings.
 */
function isGoogleVisionModel(modelId: string): boolean {
  return /^gemini-/i.test(modelId);
}

export interface FetchModelsResult {
  added: number;
  updated: number;
  total: number;
}

/**
 * Pull `{baseUrl}/models` and upsert the result. Endpoints that do not implement
 * the listing throw with a readable message so the settings page can tell the
 * user to add models by hand instead.
 */
export async function fetchProviderModels(
  providerId: string,
): Promise<FetchModelsResult> {
  const provider = await db.apiProvider.findUnique({
    where: { id: providerId },
  });
  if (!provider) throw new Error("Provider not found.");

  const apiKey = decryptSecret(provider.apiKeyEnc);
  const url = `${normalizeBaseUrl(provider.baseUrl)}/models`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: apiKey
        ? provider.protocol === "GOOGLE"
          ? { "x-goog-api-key": apiKey }
          : { Authorization: `Bearer ${apiKey}` }
        : {},
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach ${url}: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(
      `${url} returned ${response.status}. This endpoint may not list models — add them manually.`,
    );
  }

  const body: unknown = await response.json().catch(() => null);
  // `{ data: [...] }`, `{ models: [...] }` (Google) and a bare array are all
  // in the wild.
  const container = body as { data?: unknown; models?: unknown } | null;
  const rows = Array.isArray(body)
    ? body
    : Array.isArray(container?.data)
      ? (container.data as unknown[])
      : Array.isArray(container?.models)
        ? (container.models as unknown[])
        : null;
  if (!rows) {
    throw new Error(
      `${url} did not return a model list — add models manually instead.`,
    );
  }

  let added = 0;
  let updated = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    const rawId =
      typeof raw.id === "string"
        ? raw.id
        : typeof raw.name === "string"
          ? raw.name
          : null;
    if (!rawId) continue;
    const modelId = normalizeModelId(rawId);

    // Google lists every modality it serves — embeddings, TTS, video. Only the
    // ones that can hold a conversation belong in a run-config selector.
    if (provider.protocol === "GOOGLE" && !isGoogleChatModel(raw, modelId)) {
      continue;
    }

    const existing = await db.apiProviderModel.findUnique({
      where: { providerId_modelId: { providerId, modelId } },
      select: { id: true },
    });

    await db.apiProviderModel.upsert({
      where: { providerId_modelId: { providerId, modelId } },
      create: {
        providerId,
        modelId,
        label:
          typeof raw.displayName === "string" && raw.displayName.trim()
            ? raw.displayName
            : labelFor(modelId),
        supportsVision:
          provider.protocol === "GOOGLE"
            ? isGoogleVisionModel(modelId)
            : detectVision(raw),
        contextWindow: detectContextWindow(raw),
        source: "FETCHED",
      },
      // A manual row keeps its hand-tuned label and vision flag; only the
      // context window is refreshed, since that is pure metadata.
      update: { contextWindow: detectContextWindow(raw) },
    });

    if (existing) updated += 1;
    else added += 1;
  }

  if (added + updated === 0) {
    throw new Error(
      `${url} returned no usable models — add them manually instead.`,
    );
  }

  return { added, updated, total: added + updated };
}

/** Everything the OPENAI_COMPAT backend needs to run one model. */
export interface ResolvedApiModel {
  providerName: string;
  protocol: ApiProtocol;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  label: string;
  supportsVision: boolean;
  capabilities: ProviderCapabilities;
  inputPricePerM: number | null;
  outputPricePerM: number | null;
}

/**
 * Resolve an ApiProviderModel id into a runnable config. Returns null when the
 * row is gone, its provider is disabled, or the stored key cannot be decrypted
 * (a rotated RETROZ_SECRET_KEY) — every one of those is "this run cannot start",
 * which the executor reports as a failed run rather than a crash.
 */
export async function resolveApiModel(
  modelRowId: string,
): Promise<ResolvedApiModel | null> {
  const row = await db.apiProviderModel.findUnique({
    where: { id: modelRowId },
    include: { provider: true },
  });
  if (!row || !row.provider.enabled) return null;

  const apiKey = tryDecryptSecret(row.provider.apiKeyEnc);
  if (apiKey === null) return null;

  return {
    providerName: row.provider.name,
    protocol: row.provider.protocol,
    baseUrl: normalizeBaseUrl(row.provider.baseUrl),
    apiKey,
    modelId: row.modelId,
    label: row.label,
    supportsVision: row.supportsVision,
    capabilities: parseCapabilities(row.provider.capabilities),
    inputPricePerM: row.inputPricePerM ? Number(row.inputPricePerM) : null,
    outputPricePerM: row.outputPricePerM ? Number(row.outputPricePerM) : null,
  };
}

/** Model rows for the run-config selectors, grouped by provider. */
export async function listProviderModelGroups(): Promise<
  { label: string; options: { value: string; label: string; hint: string }[] }[]
> {
  const providers = await db.apiProvider.findMany({
    where: { enabled: true },
    include: { models: { orderBy: { label: "asc" } } },
    orderBy: { name: "asc" },
  });
  return providers
    .filter((p) => p.models.length > 0)
    .map((p) => ({
      label: p.name,
      options: p.models.map((m) => ({
        value: m.id,
        label: m.label,
        hint: m.modelId,
      })),
    }));
}
