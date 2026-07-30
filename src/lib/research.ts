// Client-safe research contract. Imported by client components for the picker
// labels, so it must never pull in `server-only`, a driver, or a `node:` module
// (same rule as lib/stock.ts).

export type ResearchMode = "OFF" | "AUTO" | "ON";

/** Display order for every research picker. */
export const RESEARCH_MODES: ResearchMode[] = ["AUTO", "ON", "OFF"];

export const RESEARCH_LABELS: Record<ResearchMode, string> = {
  AUTO: "Auto",
  ON: "Always",
  OFF: "Off",
};

export const RESEARCH_HINTS: Record<ResearchMode, string> = {
  AUTO: "Research only when the content states a fact — a number, date, price, or claim about the world.",
  ON: "Research the subject on every request before any copy is written.",
  OFF: "No web tools. The agent writes from the instruction alone.",
};

/** Shown wherever a picker is disabled because no Tavily key is saved. */
export const RESEARCH_LOCKED_HINT =
  "Add a Tavily API key in Settings to enable web research.";

export function isResearchMode(value: unknown): value is ResearchMode {
  return value === "OFF" || value === "AUTO" || value === "ON";
}
