/**
 * View models for the Work playground. The server builds these from Prisma rows
 * (`work-queries.ts`) so the client components stay free of DB types and of any
 * date formatting that could drift between server and client render.
 */

export type WorkAccent = "primary" | "secondary" | "accent";

export interface WorkProject {
  id: string;
  name: string;
  /** Short mono tag shown on the rail tile. */
  code: string;
  accent: WorkAccent;
  sessionCount: number;
  /** PNGs rendered across every session here — the Gallery tab's badge. */
  renderCount: number;
  bundleCount: number;
  /** Images in the project library the agent can reach. */
  assetCount: number;
  /** Newest session, so switching project keeps you on the Chat tab. */
  chatSessionId: string | null;
}

export type WorkSessionStatus = "idle" | "running" | "error";

export interface WorkSession {
  id: string;
  projectId: string;
  title: string;
  /** Pre-formatted on the server so the rail never fights hydration. */
  updatedLabel: string;
  bucket: "Today" | "Yesterday" | "Earlier";
  status: WorkSessionStatus;
}

/** An image pasted into a session — a real Asset row under the session folder. */
export interface WorkAttachment {
  id: string;
  /** Mention handle and display name, e.g. `image-2.png`. */
  name: string;
  /** Browser URL for the stored file. */
  url: string;
  relPath: string;
  /** Where it came from: this session's uploads, or the workflow's banks. */
  origin: "session" | "folder" | "global";
}

export interface WorkMention {
  name: string;
  assetId: string;
  relPath: string;
  url: string;
}

/** A skill the composer can reference with `/slug`. */
export interface WorkSkillOption {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** True when the workflow assigned it, false when it comes from the bank. */
  assigned: boolean;
}

export interface WorkUserMessage {
  id: string;
  role: "user";
  timeLabel: string;
  text: string;
  mentions: WorkMention[];
  /** The turn this message kicked off, if it has one. */
  runId: string | null;
}

export interface WorkAssistantMessage {
  id: string;
  role: "assistant";
  timeLabel: string;
  text: string;
}

export interface WorkToolMessage {
  id: string;
  role: "tool";
  timeLabel: string;
  tool: string;
  detail: string;
  status: "done" | "running" | "error";
}

export type WorkMessage =
  | WorkUserMessage
  | WorkAssistantMessage
  | WorkToolMessage;

export type WorkStepStatus = "done" | "running" | "pending" | "blocked";

export interface WorkPlanStep {
  id: string;
  label: string;
  detail?: string;
  status: WorkStepStatus;
}

export interface WorkResult {
  id: string;
  filename: string;
  relPath: string;
  url: string;
  sizeLabel: string;
}

/** Instagram refuses a carousel longer than this. */
export const CAROUSEL_LIMIT = 20;

/** One render in the project gallery, or one slide inside a bundle. */
export interface WorkRender {
  /** The RunArtifact id — what bundle items point at. */
  id: string;
  filename: string;
  relPath: string;
  url: string;
  width: number | null;
  height: number | null;
  /** `1080 × 1350`, or "" when the render predates dimension tracking. */
  sizeLabel: string;
  /** `412 KB`, or "" when the size is not on record. */
  weightLabel: string;
  /** `4:5` — the bucket the aspect-ratio guard compares slides on. */
  ratio: string;
  /** Where it came from, for the gallery's source chip. */
  sessionId: string;
  sessionTitle: string;
  /** Day bucket heading, e.g. `Today` or `Mon, 21 Jul`. */
  dayLabel: string;
  /** Sort key for the day bucket, `YYYY-MM-DD`. */
  day: string;
}

export interface WorkBundleSummary {
  id: string;
  name: string;
  count: number;
  /** Up to three covers for the stacked card preview, in slide order. */
  covers: { id: string; url: string }[];
  /** The ratio most slides share, or "" for an empty bundle. */
  ratio: string;
  /** True when at least one slide breaks that ratio. */
  mixedRatio: boolean;
  updatedLabel: string;
}

export interface WorkBundleItem {
  /** The WorkBundleItem id — the handle for reorder and remove. */
  id: string;
  render: WorkRender;
}

export interface WorkBundleDetail {
  id: string;
  projectId: string;
  name: string;
  note: string;
  items: WorkBundleItem[];
  /** The ratio most slides share, or "" for an empty bundle. */
  ratio: string;
  updatedLabel: string;
}
