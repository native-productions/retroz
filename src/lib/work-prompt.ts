import type { AgentProvider } from "@/generated/prisma/enums";

// Prompts for the Work playground. Unlike a task run — one instruction, one
// batch of images, done — Work is a conversation: the first turn establishes the
// working agreement, later turns ride the resumed engine session and only carry
// what is new.

interface WorkAsset {
  filename: string;
  absPath: string;
  description: string;
  origin: "session" | "folder" | "global";
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

export interface WorkPromptInput {
  provider: AgentProvider;
  workflowName: string;
  platform: string;
  globalInstruction: string;
  projectName: string;
  projectInstruction: string;
  outDirAbs: string;
  /** Images the user pointed at with `@` in this message. */
  mentioned: WorkAsset[];
  /** Everything else reachable through list_assets / search_assets. */
  available: WorkAsset[];
  fonts: FontForPrompt[];
  pairings: PairingForPrompt[];
  skills: SkillForPrompt[];
  message: string;
}

function assetLines(assets: WorkAsset[]): string {
  return assets
    .map(
      (a) =>
        `  - ${a.filename} [${a.origin}]` +
        `\n     path: ${a.absPath}` +
        `\n     description: ${a.description || "(none provided)"}`,
    )
    .join("\n");
}

function mentionBlock(mentioned: WorkAsset[]): string {
  if (mentioned.length === 0) return "";
  return `\n=== IMAGES THIS MESSAGE POINTS AT ===
The user referenced these with @. Treat them as the intended material unless the
message says otherwise.
${assetLines(mentioned)}
`;
}

/** First turn of a session: the full working agreement plus the user message. */
export function buildWorkPrompt(input: WorkPromptInput): string {
  const {
    provider,
    workflowName,
    platform,
    globalInstruction,
    projectName,
    projectInstruction,
    outDirAbs,
    mentioned,
    available,
    fonts,
    pairings,
    skills,
    message,
  } = input;

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
Reusable recipes you can load on demand. Load one BEFORE building images when it
fits, and say which you used.
${skills
  .map((s) => `  - ${s.slug}: ${s.description || "(no description)"}`)
  .join("\n")}
`
      : "";

  const availableBlock =
    available.length > 0
      ? `\n=== OTHER AVAILABLE IMAGES ===
${assetLines(available)}
`
      : "";

  return `You are a content production agent working side by side with the user on a
${platform} channel: "${workflowName}". This is an open conversation, not a batch
job: the user will ask for images, react to them, and ask for changes.

You produce finished, post-ready images by composing HTML/CSS overlays over the
provided photos and exporting them to PNG. You do NOT generate imagery with any
AI image model — every final image is HTML rendered to PNG.

=== WORKFLOW INSTRUCTION ===
${globalInstruction || "(none)"}

=== PROJECT: ${projectName} ===
${projectInstruction || "(no project-specific instruction)"}
${mentionBlock(mentioned)}${availableBlock}
=== AVAILABLE FONTS ===
These fonts are pre-loaded — use them in CSS via font-family; do NOT @font-face
them yourself, the renderer injects the faces for you.
${fontList}${pairingList}
${skillsBlock}
=== CONTENT-ONLY RULE ===
The image shows ONLY audience-facing content. Never render production metadata
(day/slot counters, series labels, angle tags like "HOOK"/"CTA") unless the user
explicitly asks for it as a design element.

=== HOW TO WORK ===
1. If the request needs more than one step or produces more than one image,
   open with the TodoWrite tool and keep it updated as you go — the user watches
   it as the plan for the current request. Keep it short and concrete. A
   single-image tweak needs no todo list.
2. Inspect the source photos (use the ${provider === "CODEX" ? "view_image" : "Read"} tool on their paths) before
   designing over them. Use "search_assets" to find photos you were not handed.
3. For EACH final image, build a complete self-contained HTML document. Embed the
   photo as the background via its absolute file:// path or a data URI, inline
   all CSS, and use the fonts above.
4. Call "render_html_to_png" to export it. Pick a size that fits the intended
   ${platform} format (1080x1080 square, 1080x1350 portrait, 1080x1920 story).
5. Give each image a clear, ordered filename ("01-hook.png"). Re-rendering the
   same filename replaces that image — do that when the user asks for a revision,
   and use a new filename for a genuinely new image.

=== OUTPUT CONTRACT ===
- Write ALL PNGs into this session's folder: ${outDirAbs}
  (pass just a filename to render_html_to_png, not a path).
- Reply conversationally and briefly: what you made and the choices worth
  knowing. No status-report formatting, no restating the request.
- If the request is ambiguous in a way that changes the design, ask instead of
  guessing.

=== USER ===
${message}`;
}

/** Later turns: the engine session already holds the context. */
export function buildWorkTurnPrompt(input: {
  mentioned: WorkAsset[];
  message: string;
}): string {
  return `${mentionBlock(input.mentioned)}
${input.message}`.trim();
}
