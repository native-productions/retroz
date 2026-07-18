import { z } from "zod";

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

export const skillUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  content: z.string().max(20000).optional(),
  enabled: z.boolean().default(true),
});

export const settingsUpdateSchema = z.object({
  defaultModel: z.string().min(1),
  claudeAuthMode: z.enum(["SUBSCRIPTION", "API_KEY"]),
  codexModel: z.string().min(1),
  codexReasoningEffort: z.enum(["low", "medium", "high", "xhigh"]),
  pexelsApiKey: z.string().trim().max(200).default(""),
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
