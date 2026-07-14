import type { FontCategory } from "@/generated/prisma/enums";

/** Map a Google Fonts category string to our enum. */
export function mapGoogleCategory(input: string | null): FontCategory {
  switch ((input ?? "").toLowerCase().replace(/\s+/g, "")) {
    case "serif":
      return "SERIF";
    case "sansserif":
      return "SANS";
    case "display":
      return "DISPLAY";
    case "handwriting":
      return "HANDWRITING";
    case "monospace":
      return "MONOSPACE";
    default:
      return "SANS";
  }
}

export const FONT_CATEGORIES: { value: FontCategory; label: string }[] = [
  { value: "SANS", label: "Sans" },
  { value: "SERIF", label: "Serif" },
  { value: "DISPLAY", label: "Display" },
  { value: "HANDWRITING", label: "Handwriting" },
  { value: "MONOSPACE", label: "Monospace" },
  { value: "OTHER", label: "Other" },
];
