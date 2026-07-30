import "server-only";
import { z } from "zod";
import { defineTool, text, type ToolDef } from "@/lib/run-tools";
import { searchWeb, extractWeb } from "@/lib/tavily";
import type { ResearchMode } from "@/lib/research";

// Web research tools, shared by every agent flow. They need nothing from the run
// context at all, so one array serves the render runs, the work playground and
// the campaign planner: an `unknown` context parameter is wider than any of them,
// which makes these defs assignable alongside RUN_TOOLS or PLANNER_TOOLS.
// The run viewer already shows each call through the backend's TOOL event, so the
// tools record nothing of their own.

function defineResearchTool<Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: Shape,
  execute: (
    ctx: unknown,
    args: z.output<z.ZodObject<Shape>>,
  ) => Promise<ReturnType<typeof text>>,
): ToolDef<unknown> {
  return defineTool<unknown, Shape>(name, description, shape, execute);
}

function reason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "TAVILY_NOT_CONFIGURED") {
    return "Web research is not configured (no Tavily API key in Settings). Continue without it.";
  }
  if (message === "TAVILY_HTTP_401") {
    return "Tavily rejected the API key. Continue without web research and say so in your reply.";
  }
  if (message === "TAVILY_HTTP_429" || message === "TAVILY_HTTP_432") {
    return "Tavily usage limit reached. Continue without web research and say so in your reply.";
  }
  return `Web research failed: ${message}. Continue without it.`;
}

export const RESEARCH_TOOLS: ToolDef<unknown>[] = [
  defineResearchTool(
    "web_search",
    "Search the live web for sources on a subject. Returns titles, URLs and short snippets — nothing is quoted or summarised for you. Use this before writing any factual claim, then call web_extract on the sources worth reading in full.",
    {
      query: z
        .string()
        .min(2)
        .describe("What you need to know, phrased as a search query."),
      depth: z
        .enum(["basic", "advanced"])
        .default("basic")
        .describe("Use 'advanced' only when a basic search returned nothing usable."),
      max_results: z.number().int().min(1).max(10).default(5),
      topic: z
        .enum(["general", "news"])
        .default("general")
        .describe("Use 'news' for current events and anything time-sensitive."),
      time_range: z
        .enum(["day", "week", "month", "year"])
        .optional()
        .describe("Restrict to recently published pages. Omit for evergreen facts."),
    },
    async (_ctx, args) => {
      let hits;
      try {
        hits = await searchWeb({
          query: args.query,
          depth: args.depth,
          maxResults: args.max_results,
          topic: args.topic,
          timeRange: args.time_range,
        });
      } catch (err) {
        return text(reason(err), true);
      }

      if (hits.length === 0) {
        return text(
          `No results for "${args.query}". Try a shorter or differently worded query before giving up.`,
        );
      }

      return text(
        [
          ...hits.map(
            (h, i) =>
              `[${i + 1}] ${h.title} :: ${h.url} :: score ${h.score.toFixed(2)}` +
              ` :: ${h.publishedDate ?? "no date"} :: ${h.snippet.slice(0, 400)}`,
          ),
          "",
          "Snippets are for judging relevance, not for quoting. Call web_extract on the URLs you intend to rely on.",
        ].join("\n"),
      );
    },
  ),
  defineResearchTool(
    "web_extract",
    "Read the full text of pages returned by web_search, as markdown. Extract only the sources you will actually rely on — pass URLs back exactly as web_search returned them.",
    {
      urls: z
        .array(z.string().url())
        .min(1)
        .max(5)
        .describe("URLs from web_search, unmodified."),
      query: z
        .string()
        .optional()
        .describe("What you are looking for in these pages, to focus the extraction."),
    },
    async (_ctx, args) => {
      let result;
      try {
        result = await extractWeb(args.urls, args.query);
      } catch (err) {
        return text(reason(err), true);
      }

      if (result.docs.length === 0) {
        return text(
          `Could not read any of those pages (${result.failed.join(", ")}). Pick different sources from web_search.`,
          true,
        );
      }

      const blocks = result.docs.map(
        (d) =>
          `--- ${d.url} ---\n${d.content}${d.truncated ? "\n[truncated]" : ""}`,
      );
      if (result.failed.length > 0) {
        blocks.push(`Could not read: ${result.failed.join(", ")}`);
      }
      return text(blocks.join("\n\n"));
    },
  ),
];

/**
 * The research instruction, shared verbatim by every prompt builder so the three
 * flows cannot drift apart. Returns "" when research is off for this run, which
 * makes the whole section vanish from the prompt.
 */
export function researchDirective(mode: ResearchMode | null): string {
  if (!mode || mode === "OFF") return "";

  const opening =
    mode === "ON"
      ? `Before you write any copy, run at least one "web_search" on the subject and
"web_extract" the best source. Do this even when the request looks familiar —
your training data is older than the subject.`
      : `If the content will state a fact about the world — a number, a date, a price,
a statistic, a product or person's name, a trend, a "did you know" — you MUST
"web_search" it first and "web_extract" the best source before writing it. If
the request is purely visual or stylistic, skip research entirely.`;

  return `${opening}

Rules, without exception:
- Never invent a URL, a source name, a statistic or a date. If research turned up
  nothing, write around the claim instead of guessing at it.
- Prefer primary sources — the publisher, the report, the official page — over
  aggregators and listicles.
- Snippets are for picking sources. Quote or paraphrase only from what
  "web_extract" actually returned.
- At most 3 searches per request. Stop once you have what you need.
- In your reply, name the source behind each fact you used.`;
}
