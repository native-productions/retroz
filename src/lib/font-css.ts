import { toAbsolute } from "@/lib/paths";

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
 *
 * `resolve` maps a stored font key to the local file holding it. It defaults to
 * the project-relative path, which is correct for the local storage driver; a
 * run backed by object storage passes the lookup built while hydrating fonts
 * into its workspace.
 */
export function buildFontFaceCss(
  fonts: FontForCss[],
  resolve: (relPath: string) => string = toAbsolute,
): string {
  const blocks: string[] = [];
  for (const font of fonts) {
    for (const v of font.variants) {
      const abs = resolve(v.relPath);
      const weight = v.weightRange ?? String(v.weight);
      blocks.push(
        `@font-face{font-family:'${font.family}';font-style:${v.style};font-weight:${weight};font-display:swap;src:url('file://${abs}') format('woff2');}`,
      );
    }
  }
  return blocks.join("\n");
}
