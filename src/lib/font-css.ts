import path from "node:path";
import { PROJECT_ROOT } from "@/lib/paths";

export interface FontForCss {
  family: string;
  variants: {
    weight: number;
    weightRange: string | null;
    style: string;
    relPath: string;
  }[];
}

/**
 * Build @font-face CSS for a set of fonts using absolute file:// URLs. The
 * render page is loaded via file:// so these resolve without network access.
 */
export function buildFontFaceCss(fonts: FontForCss[]): string {
  const blocks: string[] = [];
  for (const font of fonts) {
    for (const v of font.variants) {
      const abs = path.resolve(PROJECT_ROOT, v.relPath);
      const weight = v.weightRange ?? String(v.weight);
      blocks.push(
        `@font-face{font-family:'${font.family}';font-style:${v.style};font-weight:${weight};font-display:swap;src:url('file://${abs}') format('woff2');}`,
      );
    }
  }
  return blocks.join("\n");
}
