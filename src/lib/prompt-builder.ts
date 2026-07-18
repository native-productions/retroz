import type { AgentProvider } from "@/generated/prisma/enums";

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
  } = input;

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
${skillsBlock}
=== HOW TO WORK ===
1. Inspect the source photos (use the ${provider === "CODEX" ? "view_image" : "Read"} tool on their paths) so overlays fit
   the actual composition.
2. For EACH final image, build a complete self-contained HTML document. Embed
   the source photo as the background using its absolute file:// path
   (e.g. <img src="file://${assetDirAbs ?? "/path"}/photo.png">) or a data URI.
   Inline all CSS. Use the AVAILABLE FONTS above (by font-family name) to match
   the mood — fall back to system fonts only if none fit.
3. Call the "render_html_to_png" tool with that HTML to export the PNG. Choose a
   width/height that matches the intended ${platform} format (e.g. 1080x1080
   square, 1080x1350 portrait, 1080x1920 story).
4. Give each output a clear, ordered filename (e.g. "01-hook.png", "02-tip.png").

=== OUTPUT CONTRACT ===
- Write ALL final PNGs into this run's output folder: ${outDirAbs}
- Use the render_html_to_png tool for every final image (it writes into the
  output folder for you — pass just a filename, not a full path).
- When finished, briefly summarize what you produced and why.

Begin now.`;
}
