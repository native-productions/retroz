import { z } from "zod";
import { ASPECT_RATIOS } from "@/lib/aspect-ratios";
import {
  SKILL_CONTENT_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
} from "@/lib/skill-limits";

const ASPECT_RATIO_IDS = ASPECT_RATIOS.map((r) => r.id) as [string, ...string[]];

const researchModeEnum = z.enum(["OFF", "AUTO", "ON"]);

/** True when the runtime recognises the string as an IANA zone. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * A wall-clock publish slot, kept as separate date and time strings all the way
 * to the server: only the server knows `AppSetting.timezone`, so it is the only
 * place that can turn them into a correct instant.
 */
const publishFields = {
  publishDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable()
    .optional(),
  publishTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm")
    .optional(),
};

export const workflowCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  description: z.string().max(300).optional(),
  platform: z.string().min(1).default("instagram"),
});

export const workflowUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  globalInstruction: z.string().max(8000).optional(),
  defaultModel: z.string().nullable().optional(),
  researchMode: researchModeEnum.optional(),
});

export const folderCreateSchema = z.object({
  workflowId: z.string().min(1),
  name: z.string().min(1).max(80),
  notes: z.string().max(500).optional(),
});

export const assetDescriptionSchema = z.object({
  id: z.string().min(1),
  description: z.string().max(1000),
});

export const assetTagsSchema = z.object({
  id: z.string().min(1),
  tags: z.array(z.string().min(1).max(40)).max(24),
});

// A caption previewed by the assistant, then confirmed (saved) by the user.
export const assetCaptionSaveSchema = z.object({
  id: z.string().min(1),
  description: z.string().max(1000),
  tags: z.array(z.string().min(1).max(40)).max(24),
});

export const assetCaptionGenerateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(60),
});

export const assetRenameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
});

export const folderRenameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  notes: z.string().max(1000).optional(),
});

export const taskCreateSchema = z.object({
  workflowId: z.string().min(1),
  name: z.string().min(1).max(80),
  instruction: z.string().max(8000).optional(),
  assetFolderId: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  id: z.string().min(1),
});

export const scheduleCreateSchema = z.object({
  workflowId: z.string().min(1),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  timezone: z.string().default("Asia/Jakarta"),
  taskId: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Campaign Planning
// ---------------------------------------------------------------------------

export const campaignCreateSchema = z.object({
  workflowId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(120),
  brief: z.string().max(20000).optional(),
  format: z.enum(["SINGLE", "CAROUSEL"]).default("SINGLE"),
  model: z.string().nullable().optional(),
});

export const campaignUpdateSchema = z.object({
  id: z.string().min(1),
  researchMode: researchModeEnum,
});

export const campaignItemUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160).optional(),
  angle: z.string().max(300).nullable().optional(),
  instruction: z.string().max(8000).optional(),
  caption: z.string().max(2200).nullable().optional(),
});

export const campaignItemAddSchema = z.object({
  campaignId: z.string().min(1),
  dayIndex: z.coerce.number().int().min(1).max(7),
  slotIndex: z.coerce.number().int().min(0).max(5),
  title: z.string().min(1).max(160),
  instruction: z.string().max(8000).optional(),
});

export const campaignAssignAssetsSchema = z.object({
  itemId: z.string().min(1),
  assetIds: z.array(z.string().min(1)).max(20),
});

export const campaignApproveSchema = z.object({
  campaignId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  durationDays: z.coerce.number().int().min(1).max(7),
  slotsPerDay: z.coerce.number().int().min(1).max(6),
  slotTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm")).min(1).max(6),
  timezone: z.string().default("Asia/Jakarta"),
});

// ---------------------------------------------------------------------------
// Work playground
// ---------------------------------------------------------------------------

export const workProjectCreateSchema = z.object({
  workflowId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(80),
  instruction: z.string().max(8000).optional(),
  defaultModel: z.string().nullable().optional(),
});

export const workProjectUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  instruction: z.string().max(8000).optional(),
  defaultModel: z.string().nullable().optional(),
});

export const workSessionCreateSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(120).optional(),
});

export const workSessionUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120).optional(),
  model: z.string().nullable().optional(),
  // An id from lib/aspect-ratios.ts, or null to let the agent choose per image.
  aspectRatio: z
    .enum(ASPECT_RATIO_IDS)
    .nullable()
    .optional(),
});

export const workMentionSchema = z.object({
  name: z.string().min(1).max(160),
  // An Asset id for "asset", a RunArtifact id for "render".
  assetId: z.string().min(1),
  relPath: z.string().min(1),
  // A render the agent produced earlier, pointed at for revision. Absent on rows
  // written before renders were mentionable, which read as "asset".
  kind: z.enum(["asset", "render"]).default("asset"),
});

export const workSendMessageSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().min(1, "Say something first").max(8000),
  mentions: z.array(workMentionSchema).max(20).default([]),
  // Everything sitting in the composer tray when the message was sent. The
  // action keeps only the ones no earlier turn already handed over.
  attachments: z.array(workMentionSchema).max(40).default([]),
  researchMode: researchModeEnum.default("AUTO"),
  // The browsing agent, independent of researchMode — see WorkMessage.browseWeb.
  browseWeb: z.boolean().default(true),
});

// Bundles are only ever assembled from renders the project already has, so the
// payloads are id lists. The 200 ceiling is a sanity bound, not the carousel
// limit — going past 20 slides is warned about in the editor, never blocked.
export const workBundleCreateSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1, "Name the bundle").max(80),
  artifactIds: z.array(z.string().min(1)).min(1).max(200),
  ...publishFields,
});

export const workBundleUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name the bundle").max(80).optional(),
  note: z.string().max(1000).optional(),
});

/**
 * Reschedule (or unschedule) a bundle. `publishDate: null` clears the date;
 * omitting it entirely is a no-op, so a caller that only knows the time cannot
 * accidentally wipe the day.
 */
export const workBundleScheduleSchema = z.object({
  id: z.string().min(1),
  ...publishFields,
});

export const workBundleAddSchema = z.object({
  bundleId: z.string().min(1),
  artifactIds: z.array(z.string().min(1)).min(1).max(200),
});

export const workBundleReorderSchema = z.object({
  bundleId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).max(200),
});

export const skillUpsertSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .min(1, "Name the skill")
    .max(SKILL_NAME_MAX, `Keep the name to ${SKILL_NAME_MAX} characters.`),
  description: z
    .string()
    .max(
      SKILL_DESCRIPTION_MAX,
      `The description goes on one line of frontmatter — keep it to ${SKILL_DESCRIPTION_MAX} characters.`,
    )
    .optional(),
  content: z
    .string()
    .max(
      SKILL_CONTENT_MAX,
      `That body is too long — keep it to ${SKILL_CONTENT_MAX.toLocaleString("en-US")} characters.`,
    )
    .optional(),
  enabled: z.boolean().default(true),
});

export const settingsUpdateSchema = z.object({
  engineMode: z.enum(["LOCAL", "PROVIDER"]),
  defaultModel: z.string().min(1),
  claudeAuthMode: z.enum(["SUBSCRIPTION", "API_KEY"]),
  codexModel: z.string().min(1),
  codexReasoningEffort: z.enum(["low", "medium", "high", "xhigh"]),
  // ApiProviderModel id, or null when no provider model has been chosen yet.
  defaultProviderModelId: z.string().nullable().default(null),
  pexelsApiKey: z.string().trim().max(200).default(""),
  tavilyApiKey: z.string().trim().max(200).default(""),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isTimeZone, "Not a timezone the system knows, e.g. Asia/Jakarta"),
});

// --- OpenAI-compatible providers -------------------------------------------

export const providerUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required").max(60),
  protocol: z.enum(["OPENAI", "GOOGLE"]).default("OPENAI"),
  baseUrl: z
    .string()
    .trim()
    .min(1, "Base URL is required")
    .max(300)
    .refine(
      (v) => /^https?:\/\//.test(v),
      "Base URL must start with http:// or https://",
    ),
  // Omitted on edit means "keep the stored key" — the client never receives it
  // back, so it cannot echo it in.
  apiKey: z.string().trim().max(400).optional(),
  enabled: z.boolean().default(true),
  capabilities: z.record(z.string(), z.unknown()).optional(),
});

export const providerModelCreateSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().trim().min(1).max(200),
  label: z.string().trim().max(120).optional(),
  supportsVision: z.boolean().default(false),
  contextWindow: z.number().int().positive().nullable().default(null),
  inputPricePerM: z.number().nonnegative().nullable().default(null),
  outputPricePerM: z.number().nonnegative().nullable().default(null),
});

export const providerModelUpdateSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().max(120).optional(),
  supportsVision: z.boolean().optional(),
  inputPricePerM: z.number().nonnegative().nullable().optional(),
  outputPricePerM: z.number().nonnegative().nullable().optional(),
});

const fontCategoryEnum = z.enum([
  "SANS",
  "SERIF",
  "DISPLAY",
  "HANDWRITING",
  "MONOSPACE",
  "OTHER",
]);

export const googleFontSchema = z.object({
  input: z.string().min(1, "Family name or Google Fonts URL required"),
  moodTags: z.string().max(200).optional(),
});

export const urlFontSchema = z.object({
  family: z.string().min(1).max(80),
  url: z.string().url(),
  category: fontCategoryEnum.default("SANS"),
  weight: z.coerce.number().int().min(1).max(1000).default(400),
  style: z.enum(["normal", "italic"]).default("normal"),
  moodTags: z.string().max(200).optional(),
});

export const fontUpdateSchema = z.object({
  id: z.string().min(1),
  category: fontCategoryEnum.optional(),
  moodTags: z.string().max(200).optional(),
  previewText: z.string().max(120).optional(),
  enabled: z.boolean().optional(),
});

export const pairingSchema = z.object({
  name: z.string().min(1).max(80),
  headingFontId: z.string().min(1),
  bodyFontId: z.string().min(1),
  moodTags: z.string().max(200).optional(),
});

export const workflowFontSchema = z.object({
  workflowId: z.string().min(1),
  fontId: z.string().min(1),
  assigned: z.boolean(),
});

export const workflowSkillSchema = z.object({
  workflowId: z.string().min(1),
  skillId: z.string().min(1),
  assigned: z.boolean(),
});

export const globalAssetUpdateSchema = z.object({
  id: z.string().min(1),
  description: z.string().max(1000).optional(),
  kind: z.enum(["BACKGROUND", "LOGO", "PATTERN", "OTHER"]).optional(),
});
