import type { Page } from "playwright";

// Guardrails for the HTML → PNG path. The renderer screenshots one frame and
// hard-crops it to the requested box, so anything that overflows is silently
// discarded and anything mid-animation is captured half-drawn. This module holds
// both halves of the fix: the CSS the renderer always injects, and the audit that
// measures the rendered page before the screenshot is accepted. `layoutContract`
// is the prompt-side statement of the same rules, kept here so the rule and its
// enforcement cannot drift apart.

/**
 * Injected ahead of the font faces on every render.
 *
 * Animation and transition are killed outright: the output is a single frame, so
 * a reveal caught at 20% simply loses content. Note the consequence — an element
 * whose resting state is `opacity: 0` stays invisible once its animation is gone.
 * That is what the INVISIBLE audit check exists to catch.
 *
 * Body margin is reset because the screenshot clips at exactly WxH, so the
 * browser default 8px would show as a white border on every image. Nothing else
 * is reset: a global `box-sizing` change would silently alter width maths in HTML
 * that already lays out correctly.
 */
export const RENDER_RESET_CSS = `*,*::before,*::after{animation:none!important;animation-duration:0s!important;animation-delay:0s!important;transition:none!important;transition-duration:0s!important;transition-delay:0s!important}
html,body{margin:0!important;padding:0!important}`;

export type RenderIssueKind =
  | "PAGE_OVERFLOW"
  | "CLIPPED_TEXT"
  | "OUT_OF_FRAME"
  | "EDGE_CROWDING"
  | "IMAGE_FAILED"
  | "INVISIBLE"
  | "COLLISION";

export interface RenderIssue {
  kind: RenderIssueKind;
  /** Measured, e.g. "body is 1412px tall in a 1350px frame — 62px lost". */
  detail: string;
  /** Short locator so the agent can find the node in its own HTML. */
  element?: string;
}

/** Sub-pixel rounding means exact comparisons produce noise. */
const TOLERANCE = 2;
/** Beyond this share of the canvas an image is a background plate, not an icon. */
const ICON_AREA_SHARE = 0.25;
/**
 * Hard floor for the margin text must keep from the frame edge, as a share of
 * the short edge — 32px at 1080. The prompt asks for roughly 6%; this is
 * deliberately half of that, so a design that merely runs tight still passes and
 * only genuinely edge-to-edge type is rejected. Enforcing it is the point: the
 * instruction alone gets ignored, and text welded to the edge reads as broken on
 * a feed, where the platform's own chrome overlaps the frame.
 */
const SAFE_AREA_SHARE = 0.03;
/** Cap per check, so one systemic mistake cannot flood the tool result. */
const MAX_PER_KIND = 4;

/**
 * Measure the rendered page and report every way it is broken. Runs as one
 * `page.evaluate` after fonts have settled, so it sees final layout.
 *
 * `failedUrls` comes from the caller's `requestfailed` listener — a
 * `background-image` that 404s produces no `img` element, so it is invisible to
 * DOM inspection alone.
 */
export async function auditRenderedPage(
  page: Page,
  width: number,
  height: number,
  failedUrls: string[],
): Promise<RenderIssue[]> {
  const issues = await page.evaluate(
    ({ width, height, tolerance, iconAreaShare, safeAreaShare, maxPerKind }) => {
      const found: RenderIssue[] = [];
      const canvasArea = width * height;
      const safeArea = Math.round(Math.min(width, height) * safeAreaShare);

      /** tag + first class + a snippet of text, e.g. `h1.headline — "Coding bukan…"` */
      function locator(el: Element): string {
        const tag = el.tagName.toLowerCase();
        const cls = el.classList.item(0);
        const id = el.id ? `#${el.id}` : "";
        const head = `${tag}${id}${cls ? `.${cls}` : ""}`;
        const raw = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!raw) {
          const src = el.getAttribute("src");
          if (!src) return head;
          // A data URI has no meaningful tail to quote; the filename does.
          if (src.startsWith("data:")) return `${head} — inline data URI`;
          return `${head} — src …${src.slice(-48)}`;
        }
        const snippet = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
        return `${head} — "${snippet}"`;
      }

      function push(kind: RenderIssue["kind"], detail: string, el?: Element) {
        if (found.filter((f) => f.kind === kind).length >= maxPerKind) return;
        found.push({ kind, detail, ...(el ? { element: locator(el) } : {}) });
      }

      const all = Array.from(document.body.querySelectorAll("*"));

      /** An element that renders its own text rather than just wrapping others. */
      function ownText(el: Element): string {
        let out = "";
        for (const node of Array.from(el.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
        }
        return out.replace(/\s+/g, " ").trim();
      }

      const textEls = all.filter((el) => ownText(el).length > 0);

      /**
       * Where an element's own text actually sits, measured off its text nodes
       * rather than its box. A padded wrapper's box touches the edge while its
       * copy is safely inset — measuring the box would reject that design for a
       * problem it does not have.
       */
      function inkBounds(
        el: Element,
      ): { left: number; top: number; right: number; bottom: number } | null {
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (const node of Array.from(el.childNodes)) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          if (!(node.textContent ?? "").trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width <= 0 || r.height <= 0) continue;
            left = Math.min(left, r.left);
            top = Math.min(top, r.top);
            right = Math.max(right, r.right);
            bottom = Math.max(bottom, r.bottom);
          }
        }
        return left === Infinity ? null : { left, top, right, bottom };
      }

      // --- 1. the document itself does not fit the frame ---------------------
      const root = document.documentElement;
      const overW = root.scrollWidth - width;
      const overH = root.scrollHeight - height;
      if (overW > tolerance) {
        push(
          "PAGE_OVERFLOW",
          `the page is ${root.scrollWidth}px wide in a ${width}px frame — ${overW}px is cropped away`,
        );
      }
      if (overH > tolerance) {
        push(
          "PAGE_OVERFLOW",
          `the page is ${root.scrollHeight}px tall in a ${height}px frame — ${overH}px is cropped away`,
        );
      }

      for (const el of all) {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const isImg = el.tagName === "IMG";
        const text = ownText(el);
        const carriesContent = text.length > 0 || isImg;

        // --- 2. text clipped inside its own box ----------------------------
        // Reaching for overflow:hidden to make copy fit is the failure mode
        // this catches: the text is gone but nothing else reports it.
        if (text.length > 0 && style.overflow !== "visible") {
          const cutH = el.scrollHeight - el.clientHeight;
          const cutW = el.scrollWidth - el.clientWidth;
          if (cutH > tolerance) {
            push("CLIPPED_TEXT", `${cutH}px of text is cut off below the box`, el);
          } else if (cutW > tolerance) {
            push("CLIPPED_TEXT", `${cutW}px of text is cut off to the side`, el);
          }
        }

        // --- 3. text sitting outside the frame ------------------------------
        // Text only: a bleed photo deliberately exceeding the frame is fine.
        if (text.length > 0 && rect.width > 0 && rect.height > 0) {
          const out: string[] = [];
          if (rect.left < -tolerance) out.push(`${Math.round(-rect.left)}px past the left edge`);
          if (rect.top < -tolerance) out.push(`${Math.round(-rect.top)}px past the top edge`);
          if (rect.right > width + tolerance)
            out.push(`${Math.round(rect.right - width)}px past the right edge`);
          if (rect.bottom > height + tolerance)
            out.push(`${Math.round(rect.bottom - height)}px past the bottom edge`);
          if (out.length > 0) {
            push("OUT_OF_FRAME", `text extends ${out.join(", ")}`, el);
          }

          // --- 3b. text welded to the edge -----------------------------------
          // Only when it is inside the frame: text already reported as out of
          // frame does not need a second, weaker complaint about the same edge.
          if (out.length === 0) {
            const ink = inkBounds(el);
            if (ink) {
              const tight: string[] = [];
              if (ink.left < safeArea) tight.push(`${Math.round(ink.left)}px from the left`);
              if (ink.top < safeArea) tight.push(`${Math.round(ink.top)}px from the top`);
              if (width - ink.right < safeArea)
                tight.push(`${Math.round(width - ink.right)}px from the right`);
              if (height - ink.bottom < safeArea)
                tight.push(`${Math.round(height - ink.bottom)}px from the bottom`);
              if (tight.length > 0) {
                push(
                  "EDGE_CROWDING",
                  `this text sits ${tight.join(", ")} — every edge needs at least ` +
                    `${safeArea}px clear. Add padding to the frame, do not shrink the type`,
                  el,
                );
              }
            }
          }
        }

        // --- 4. an image that never loaded ----------------------------------
        if (isImg) {
          const img = el as HTMLImageElement;
          if (img.naturalWidth === 0) {
            push(
              "IMAGE_FAILED",
              `this image did not load — check the file:// path exists and is absolute`,
              el,
            );
          }
        }

        // --- 5. content present in the DOM but invisible in the frame -------
        // Chiefly the cost of stripping animation: an element resting at
        // opacity 0, waiting for a reveal that no longer runs.
        if (carriesContent) {
          if (Number(style.opacity) === 0) {
            push("INVISIBLE", `opacity is 0, so this renders as nothing`, el);
          } else if (style.visibility === "hidden") {
            push("INVISIBLE", `visibility is hidden, so this renders as nothing`, el);
          } else if (rect.width < 1 || rect.height < 1) {
            push(
              "INVISIBLE",
              `this collapsed to ${Math.round(rect.width)}x${Math.round(rect.height)}px, so it renders as nothing`,
              el,
            );
          }
        }
      }

      // --- 6. text overlapping an icon or logo ------------------------------
      // Only small images qualify: text over a full-bleed photo is a legitimate
      // design, text over a logo is a collision.
      const icons = all.filter((el) => {
        if (el.tagName !== "IMG" && el.tagName !== "SVG" && el.tagName !== "svg") {
          return false;
        }
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.width * r.height < canvasArea * iconAreaShare;
      });

      for (const icon of icons) {
        const ir = icon.getBoundingClientRect();
        for (const el of textEls) {
          if (icon.contains(el) || el.contains(icon)) continue;
          // Siblings inside a SMALL shared parent are a composed unit — a glyph
          // centred on a ring graphic, a number badge on a marker. The author
          // placed them together on purpose. A shared parent that spans the page
          // (body, the frame wrapper) proves nothing, so it does not exempt.
          const parent = el.parentElement;
          if (parent && parent === icon.parentElement) {
            const pr = parent.getBoundingClientRect();
            if (pr.width * pr.height < canvasArea * iconAreaShare) continue;
          }
          // A one- or two-character glyph ("?", "→", "1") over a graphic is
          // decoration. Real damage is a headline or a paragraph landing on a logo.
          if (ownText(el).length <= 3) continue;
          const tr = el.getBoundingClientRect();
          if (tr.width === 0 || tr.height === 0) continue;
          const overlapW = Math.min(ir.right, tr.right) - Math.max(ir.left, tr.left);
          const overlapH = Math.min(ir.bottom, tr.bottom) - Math.max(ir.top, tr.top);
          if (overlapW > tolerance && overlapH > tolerance) {
            push(
              "COLLISION",
              `overlaps ${locator(icon)} by ${Math.round(overlapW)}x${Math.round(overlapH)}px — give each its own cell instead of stacking them`,
              el,
            );
          }
        }
      }

      return found;
    },
    {
      width,
      height,
      tolerance: TOLERANCE,
      iconAreaShare: ICON_AREA_SHARE,
      safeAreaShare: SAFE_AREA_SHARE,
      maxPerKind: MAX_PER_KIND,
    },
  );

  // A failed background-image request leaves no DOM trace, so it is folded in
  // from the network listener rather than measured in the page.
  for (const url of failedUrls) {
    if (issues.filter((i) => i.kind === "IMAGE_FAILED").length >= MAX_PER_KIND) break;
    issues.push({
      kind: "IMAGE_FAILED",
      detail: `a referenced file failed to load: ${url}`,
    });
  }

  return issues;
}

/** One line per issue, for the tool result and the run log. */
export function formatRenderIssues(issues: RenderIssue[]): string {
  return issues
    .map((i) => `  - [${i.kind}] ${i.element ? `${i.element}: ` : ""}${i.detail}`)
    .join("\n");
}

/**
 * The prompt-side statement of the rules the audit enforces. One source of truth
 * for every prompt builder, so the instruction and the check stay aligned.
 */
export function layoutContract(platform: string): string {
  return `Every image is ONE STATIC FRAME, screenshotted at the exact size you pass to
"render_html_to_png" and hard-cropped to it. The renderer audits what you produced
and REJECTS the render when it is broken, so build to these rules the first time:

- NO animation, NO transition, NO keyframes. The renderer strips them, and an
  element resting at "opacity: 0" or an untriggered "transform" stays invisible
  forever. Every element must be at its final, visible state in the CSS itself.
- Size the body to exactly the render dimensions and set "margin: 0". Nothing may
  extend past the frame — cropped is lost, not scaled.
- PAD THE FRAME. Keep roughly 6% of the short edge clear on all four sides (about
  64px at 1080) and put every element inside that box. This is measured: text
  closer than 3% of the short edge to ANY edge fails the audit. Give the frame
  real padding rather than shrinking the type to buy the margin, and do not let a
  headline, a label, a handle, or a card run to the edge "for effect".
- Only a full-bleed background plate may reach the frame edge. Cards, panels,
  screenshots and mockups stay inside the safe area — a content block sliced by
  the frame reads as a mistake, not as a crop.
- NEVER use "overflow: hidden" to make copy fit. If text does not fit, cut words
  or reduce the size. Hiding the overflow fails the audit exactly the same way.
- Lay text out with flex or grid and explicit "gap". Absolute positioning for
  body copy is what puts text on top of other text.
- Icons, logos and the handle get their OWN grid cell or a padded corner that no
  text block reaches into. Never drop them over text.
- Give text room to breathe: "line-height" at least 1.1 on display type and at
  least 1.35 on body copy. Do not compress leading to win space.
- Keep copy inside a budget so it fits without tricks: headline up to ~45
  characters, subhead up to ~90, a body paragraph up to ~220, a caption or label
  up to ~30. Longer than that, rewrite it shorter.
- Body copy stays at 28px or larger at 1080px width, so it survives ${platform}
  feed scale. Labels no smaller than 20px.
- Reference photos by ABSOLUTE "file://" path or a data URI. A relative path or a
  remote URL will not load, and the audit will flag the blank image.`;
}
