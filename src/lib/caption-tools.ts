import "server-only";
import { z } from "zod";
import { db } from "@/lib/db-client";
import { defineTool, text, type RunToolContext, type ToolDef } from "@/lib/run-tools";
import { normalizeCaption, normalizeTags } from "@/lib/work-events";
import { CAPTION_MAX_CHARS, CAPTION_TAG_LIMIT } from "@/lib/work-types";

// The caption tool for the Work playground: the agent posts the copy that goes
// with the images it just produced, and the canvas shows it above the renders.
// Only registered for a Work turn — a scheduled task run has no conversation to
// hang a caption on, which is what the null `workSessionId` guard below means.
//
// One caption per session, rewritten on every call: a revision changes what the
// images say, so the previous caption is stale rather than worth keeping.

function defineCaptionTool<Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: Shape,
  execute: (
    ctx: RunToolContext,
    args: z.output<z.ZodObject<Shape>>,
  ) => Promise<ReturnType<typeof text>>,
): ToolDef<RunToolContext> {
  return defineTool<RunToolContext, Shape>(name, description, shape, execute);
}

export const CAPTION_TOOLS: ToolDef<RunToolContext>[] = [
  defineCaptionTool(
    "save_caption",
    `Save the social caption and hashtags for the images produced in this conversation. Call this once you have finished rendering, and call it again whenever a revision changes what the images say — the caption always describes the CURRENT set of images. Write the caption in the language and voice of the project brief, ready to paste into the post: a hook first line, then the substance, then whatever call to action fits. Do not put hashtags in the caption itself — pass them separately, three to ${CAPTION_TAG_LIMIT} of them, unless the brief says the channel posts without hashtags.`,
    {
      caption: z
        .string()
        .min(1)
        .describe(
          `The caption exactly as it should be posted, newlines and emoji included. Max ${CAPTION_MAX_CHARS} characters.`,
        ),
      tags: z
        .array(z.string())
        .max(CAPTION_TAG_LIMIT)
        .default([])
        .describe(
          `Three to ${CAPTION_TAG_LIMIT} hashtags, without the "#". Pick the ones the target audience actually searches, not generic filler. Empty only when the brief rules hashtags out.`,
        ),
    },
    async (ctx, args) => {
      if (!ctx.workSessionId) {
        return text(
          "This run is not a Work conversation, so there is nowhere to save a caption. Skip it.",
          true,
        );
      }

      const caption = normalizeCaption(args.caption);
      if (!caption) {
        return text("The caption was empty — write one and call again.", true);
      }
      const tags = normalizeTags(args.tags);

      await db.workSession.update({
        where: { id: ctx.workSessionId },
        data: { caption, captionTags: tags },
      });

      return text(
        `Caption saved (${caption.length} characters` +
          `${tags.length > 0 ? `, ${tags.length} tag${tags.length === 1 ? "" : "s"}` : ", no tags"}). ` +
          "It is shown to the user above the renders — mention it in your reply rather than repeating it in full.",
      );
    },
  ),
];
