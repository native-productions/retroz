import type { AgentProvider } from "@/generated/prisma/enums";
import { researchDirective } from "@/lib/research-tools";
import { layoutContract } from "@/lib/render-guard";
import type { ResearchMode } from "@/lib/research";

interface AssetForPrompt {
  filename: string;
  absPath: string;
  width: number | null;
  height: number | null;
  description: string;
  tags: string[];
}

interface GlobalAssetForPrompt {
  filename: string;
  absPath: string;
  kind: string;
  description: string;
}

interface FontForPrompt {
  family: string;
  category: string;
  moodTags: string;
}

interface PairingForPrompt {
  name: string;
  heading: string;
  body: string;
  moodTags: string;
}

interface SkillForPrompt {
  slug: string;
  description: string;
}

export function buildRunPrompt(input: {
  provider: AgentProvider;
  workflowName: string;
  platform: string;
  globalInstruction: string;
  taskName: string;
  taskInstruction: string;
  assetDirAbs: string | null;
  assets: AssetForPrompt[];
  assetsTotal: number;
  assetsTruncated: boolean;
  globalAssets: GlobalAssetForPrompt[];
  outDirAbs: string;
  fonts: FontForPrompt[];
  pairings: PairingForPrompt[];
  skills: SkillForPrompt[];
  /** Null when the web tools are not registered for this run. */
  research: ResearchMode | null;
}): string {
  const {
    provider,
    workflowName,
    platform,
    globalInstruction,
    taskName,
    taskInstruction,
    assetDirAbs,
    assets,
    assetsTotal,
    assetsTruncated,
    globalAssets,
    outDirAbs,
    fonts,
    pairings,
    skills,
    research,
  } = input;

  const directive = researchDirective(research);
  const researchBlock = directive
    ? `\n=== RESEARCH ===
You can look things up with "web_search" and "web_extract".
${directive}
`
    : "";
  // The research step only exists when the tools do, so the procedure renumbers
  // around it rather than leaving a dead instruction in the prompt.
  const step = (n: number) => (directive ? n + 1 : n);

  const globalManifest =
    globalAssets.length > 0
      ? globalAssets
          .map(
            (a) =>
              `  - [${a.kind.toLowerCase()}] ${a.filename}` +
              `\n     path: ${a.absPath}` +
              `\n     use: ${a.description || "(no note)"}`,
          )
          .join("\n")
      : null;

  const fontList =
    fonts.length > 0
      ? fonts
          .map(
            (f) =>
              `  - "${f.family}" (${f.category.toLowerCase()})` +
              (f.moodTags ? ` — mood: ${f.moodTags}` : ""),
          )
          .join("\n")
      : "  (none registered — use system fonts)";

  const pairingList =
    pairings.length > 0
      ? "\nRecommended pairings (heading / body):\n" +
        pairings
          .map(
            (p) =>
              `  - ${p.name}: "${p.heading}" heading + "${p.body}" body` +
              (p.moodTags ? ` — mood: ${p.moodTags}` : ""),
          )
          .join("\n")
      : "";

  const skillsBlock =
    skills.length > 0
      ? `\n=== AVAILABLE SKILLS ===
Reusable recipes you can load on demand. When a task benefits from one, load it
BEFORE building images by invoking the Skill tool, and announce it in your reply
as "LoadSkill: <slug>" so the run log records which skills were used.
${skills
  .map((s) => `  - ${s.slug}: ${s.description || "(no description)"}`)
  .join("\n")}
`
      : "";

  const assetManifest =
    assets.length > 0
      ? assets
          .map(
            (a, i) =>
              `  ${i + 1}. ${a.filename}` +
              (a.width && a.height ? ` (${a.width}x${a.height})` : "") +
              `\n     path: ${a.absPath}` +
              `\n     description: ${a.description || "(none provided)"}` +
              (a.tags.length > 0 ? `\n     tags: ${a.tags.join(", ")}` : ""),
          )
          .join("\n")
      : "  (no source photos — build overlays from scratch)";

  // When the folder is large, only the top matches are shown above. Tell Claude
  // where to find the rest instead of dumping every asset into the prompt.
  const assetScopeNote = assetsTruncated
    ? `\nShowing the ${assets.length} most relevant of ${assetsTotal} photos for this task. ` +
      `To find others, call the "search_assets" tool with a short description ` +
      `(it returns paths + tags without loading images) and Read only the ones you'll use.`
    : "";

  return `You are a content production agent for a ${platform} channel: "${workflowName}".
You produce finished, post-ready images by composing HTML/CSS overlays over the
provided source photos and exporting them to PNG. You do NOT generate imagery
with any AI image model — every final image is HTML rendered to PNG.

=== WORKFLOW INSTRUCTION (applies to all tasks) ===
${globalInstruction || "(none)"}

=== TASK: ${taskName} ===
${taskInstruction || "(no task-specific instruction)"}

=== SOURCE ASSETS ===
Asset folder: ${assetDirAbs ?? "(none)"}
${assetManifest}${assetScopeNote}
${
  globalManifest
    ? `\n=== GLOBAL WORKFLOW ASSETS ===
Shared assets available to EVERY task in this workflow (brand logos, background
plates, SVG patterns). Reuse them wherever the task/instruction calls for it —
e.g. place the logo, use a background, tile a pattern. Reference by absolute
file:// path like the source photos.
${globalManifest}
`
    : ""
}
=== AVAILABLE FONTS ===
These fonts are pre-loaded — just use them in CSS via font-family; do NOT
@font-face them yourself, the renderer injects the faces for you. Pick fonts
that fit the mood of the content and the workflow instruction.
${fontList}${pairingList}
${skillsBlock}${researchBlock}
=== LAYOUT RULES (hard — the renderer enforces these) ===
${layoutContract(platform)}

=== CONTENT-ONLY RULE (important) ===
The image shows ONLY audience-facing content. Never render production or campaign
metadata onto the image, including:
  - day / slot counters ("Day 1", "Day 1/7", "1 of 7", "Part 3"),
  - series or campaign labels (the campaign name, "a 7-day series", topic-plus-day
    tags like "SOFTWARE DEVELOPMENT — Day 1/7"),
  - angle / format labels ("HOOK", "TIP", "CTA", "OUTRO"),
  - meta CTAs about the series ("save this series", "follow for day 2").
If the task instruction contains any such scaffolding, treat it as internal
guidance and keep it OFF the image — render the content message itself. The only
exception is when the instruction EXPLICITLY asks for visible numbering or series
branding as a deliberate design element.

=== HOW TO WORK ===
1. PLAN FIRST. Work out how many images the task needs and what each one says
   before building anything.${
     directive
       ? `\n2. RESEARCH THE SUBJECT, per the RESEARCH section above, before you commit to
   what each image says. Facts get checked here, not invented later.`
       : ""
   }
${step(2)}. DECIDE, PER IMAGE, WHETHER IT NEEDS A PHOTO AT ALL. A quote card, a statistic,
   a section break, a definition, a text-led hook — these are usually stronger as
   pure typography on a flat or gradient ground. Do not reach for a photo to fill
   space, and do not put one behind text that then needs a scrim to stay legible.
   A photo earns its place when it shows something the words cannot.
${step(3)}. Only when an image genuinely needs one, source it in this order and stop at
   the first good fit:
   a. "search_assets" — the source folder and global assets above, matched on
      their descriptions rather than their filenames;
   b. "search_stock" then "import_stock" — Wikimedia Commons and Pexels, only
      when nothing local fits. Import just the ones you will actually place;
      each becomes a permanent asset in this task's folder. Never invent a URL —
      pass back exactly what search_stock returned.
${step(4)}. Inspect whatever you chose (use the ${provider === "CODEX" ? "view_image" : "Read"} tool on its path) so overlays fit
   the actual composition.
${step(5)}. For EACH final image, build a complete self-contained HTML document. Embed
   the source photo as the background using its absolute file:// path
   (e.g. <img src="file://${assetDirAbs ?? "/path"}/photo.png">) or a data URI.
   Inline all CSS. Use the AVAILABLE FONTS above (by font-family name) to match
   the mood — fall back to system fonts only if none fit.
${step(6)}. Call the "render_html_to_png" tool with that HTML to export the PNG. Choose a
   width/height that matches the intended ${platform} format (e.g. 1080x1080
   square, 1080x1350 portrait, 1080x1920 story).
${step(7)}. IF THE RENDER IS REJECTED, fix it before moving on. The tool reports exactly
   what broke and where. Inspect the PNG it wrote, correct the HTML, and
   re-render the same filename. Never leave a rejected image behind, and never
   silence the problem with "overflow: hidden".
${step(8)}. Give each output a clear, ordered filename (e.g. "01-hook.png", "02-tip.png").

=== OUTPUT CONTRACT ===
- Write ALL final PNGs into this run's output folder: ${outDirAbs}
- Use the render_html_to_png tool for every final image (it writes into the
  output folder for you — pass just a filename, not a full path).
- When finished, briefly summarize what you produced and why.

Begin now.`;
}
