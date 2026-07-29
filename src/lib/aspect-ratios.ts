/**
 * The shapes a Work session can lock its renders to.
 *
 * A carousel only reads as one piece when every slide shares a ratio —
 * Instagram crops the whole set to the first slide otherwise — so this is the
 * guard that keeps a session's output bundle-ready. Ids double as the label the
 * bundle ratio guard compares against (`ratioOf` in `work-bundle-queries.ts`).
 */
export interface AspectRatio {
  id: string;
  label: string;
  /** Rendered pixel size at Instagram's native width. */
  width: number;
  height: number;
  /** What the shape is for, shown next to the label. */
  hint: string;
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { id: "1:1", label: "1:1", width: 1080, height: 1080, hint: "Square feed" },
  { id: "4:5", label: "4:5", width: 1080, height: 1350, hint: "Portrait feed" },
  { id: "3:4", label: "3:4", width: 1080, height: 1440, hint: "Tall feed" },
  { id: "9:16", label: "9:16", width: 1080, height: 1920, hint: "Story / Reels" },
  { id: "1.91:1", label: "1.91:1", width: 1080, height: 566, hint: "Landscape" },
];

/** Null or an unknown id means the agent picks per image. */
export function findAspectRatio(id: string | null): AspectRatio | null {
  if (!id) return null;
  return ASPECT_RATIOS.find((r) => r.id === id) ?? null;
}

/** The size constraint handed to the agent, or "" when it is free to choose. */
export function aspectRatioRule(id: string | null): string {
  const ratio = findAspectRatio(id);
  if (!ratio) return "";
  return `Render EVERY image at exactly ${ratio.width}x${ratio.height} (${ratio.label}, ${ratio.hint.toLowerCase()}). Pass width=${ratio.width} and height=${ratio.height} to render_html_to_png, and size the HTML body to match. Do not vary the shape between images in this session — mixed ratios break a carousel.`;
}
