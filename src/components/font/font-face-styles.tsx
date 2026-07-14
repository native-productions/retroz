"use client";

import { mediaUrl } from "@/lib/media";

export interface PreviewVariant {
  weight: number;
  weightRange: string | null;
  style: string;
  relPath: string;
}

export interface PreviewFont {
  family: string;
  variants: PreviewVariant[];
}

function fmt(relPath: string): string {
  if (relPath.endsWith(".woff2")) return "woff2";
  if (relPath.endsWith(".woff")) return "woff";
  if (relPath.endsWith(".otf")) return "opentype";
  return "truetype";
}

/** Inject @font-face rules so the browser can render live font previews. */
export function FontFaceStyles({ fonts }: { fonts: PreviewFont[] }) {
  const css = fonts
    .flatMap((f) =>
      f.variants.map(
        (v) =>
          `@font-face{font-family:'${f.family}';font-weight:${v.weightRange ?? v.weight};font-style:${v.style};font-display:swap;src:url('${mediaUrl(v.relPath)}') format('${fmt(v.relPath)}');}`,
      ),
    )
    .join("");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
