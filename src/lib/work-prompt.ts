import type { AgentProvider } from "@/generated/prisma/enums";
import { researchDirective } from "@/lib/research-tools";
import type { ResearchMode } from "@/lib/research";

// Prompts for the Work playground. Unlike a task run — one instruction, one
// batch of images, done — Work is a conversation: the first turn establishes the
// working agreement, later turns ride the resumed engine session and only carry
// what is new.

interface WorkAsset {
  filename: string;
  absPath: string;
  description: string;
  origin: "session" | "project" | "folder" | "global";
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

/** A skill whose full text is pasted in, for engines with no skill loader. */
export interface InlinedSkill {
  slug: string;
  name: string;
  content: string;
}

export function inlinedSkillBlock(skills: InlinedSkill[]): string {
  if (skills.length === 0) return "";
  return `\n=== SKILLS THIS MESSAGE ASKED FOR ===
The user named these with /slug. Follow them for this request.
${skills
  .map((s) => `\n--- /${s.slug} — ${s.name} ---\n${s.content}`)
  .join("\n")}
`;
}

/** Research is a per-turn toggle, so this block is restated on every turn — see
 *  the note on buildWorkTurnPrompt. Empty when the web tools are not registered. */
export function researchBlock(research: ResearchMode | null): string {
  const directive = researchDirective(research);
  if (!directive) return "";
  return `\n=== RESEARCH (this message) ===
You can look things up with "web_search" and "web_extract".
${directive}
`;
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
  /** Full text of the skills this message named, for engines without a loader. */
  inlinedSkills: InlinedSkill[];
  /** Size constraint from the session's locked aspect ratio, "" when free. */
  aspectRule: string;
  /** Null when the web tools are not registered for this turn. */
  research: ResearchMode | null;
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
    inlinedSkills,
    aspectRule,
    research,
    message,
  } = input;

  // The research step only exists when the tools do, so the procedure renumbers
  // around it rather than leaving a dead instruction in the prompt.
  const researching = Boolean(researchDirective(research));
  const step = (n: number) => (researching ? n + 1 : n);

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
fits, and say which you used. When the user writes a skill as /slug in their
message, that is an explicit instruction: load that skill and follow it.
${skills
  .map((s) => `  - /${s.slug}: ${s.description || "(no description)"}`)
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

=== PROJECT BRIEF: ${projectName} ===
This is the foundation for everything you make in this project. It defines the
role you are working in, the voice, the language, and the visual rules. Follow it
in every turn, not just this one, and prefer it over your own defaults. Where it
conflicts with the channel instruction below, the brief wins.
${projectInstruction || "(no brief written yet — fall back on the channel instruction)"}

=== CHANNEL INSTRUCTION (${workflowName}) ===
Applies to every project on this channel.
${globalInstruction || "(none)"}
${mentionBlock(mentioned)}${availableBlock}
=== AVAILABLE FONTS ===
These fonts are pre-loaded — use them in CSS via font-family; do NOT @font-face
them yourself, the renderer injects the faces for you.
${fontList}${pairingList}
${skillsBlock}${inlinedSkillBlock(inlinedSkills)}${researchBlock(research)}
=== CONTENT-ONLY RULE ===
The image shows ONLY audience-facing content. Never render production metadata
(day/slot counters, series labels, angle tags like "HOOK"/"CTA") unless the user
explicitly asks for it as a design element.

=== HOW TO WORK ===
1. PLAN FIRST. If the request needs more than one step or produces more than one
   image, open with the TodoWrite tool and keep it updated as you go — the user
   watches it as the plan for the current request. Keep it short and concrete. A
   single-image tweak needs no todo list.${
     researching
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
   a. the images this message pointed at with @ — always these first;
   b. "search_assets" — the project library and brand assets. They carry
      descriptions written for exactly this ("use this when you need the X
      logo"), so search by what you need, not by filename;
   c. "search_stock" then "import_stock" — Wikimedia Commons and Pexels, only
      when nothing local fits. Import just the ones you will actually place;
      each becomes a permanent asset the user sees. Never invent a URL — pass
      back exactly what search_stock returned.
${step(4)}. Inspect whatever you chose (use the ${provider === "CODEX" ? "view_image" : "Read"} tool on its path) before designing
   over it, so the overlay fits the real composition.
${step(5)}. For EACH final image, build a complete self-contained HTML document. Embed the
   photo as the background via its absolute file:// path or a data URI, inline
   all CSS, and use the fonts above.
${step(6)}. Call "render_html_to_png" to export it. ${
    aspectRule ||
    `Pick a size that fits the intended ${platform} format (1080x1080 square, 1080x1350 portrait, 1080x1920 story).`
  }
${step(7)}. Give each image a clear, ordered filename ("01-hook.png"). Re-rendering the
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

/**
 * Later turns: the engine session already holds the context. The size and
 * research rules are restated anyway — they are per-turn settings the user can
 * change mid-session, and the opening prompt's version would otherwise be the one
 * that sticks.
 */
export function buildWorkTurnPrompt(input: {
  mentioned: WorkAsset[];
  inlinedSkills: InlinedSkill[];
  /** Set only when the brief changed since the last turn — see work-executor. */
  revisedBrief: { projectName: string; instruction: string } | null;
  aspectRule: string;
  research: ResearchMode | null;
  message: string;
}): string {
  // The opening prompt is what the resumed engine session still holds, so an
  // edited brief has to be re-sent or the session would keep working off the
  // version it was started with.
  const brief = input.revisedBrief
    ? `\n=== PROJECT BRIEF UPDATED: ${input.revisedBrief.projectName} ===
The brief has changed since your last turn. This version replaces it entirely —
follow it from here on.
${input.revisedBrief.instruction || "(the brief was cleared — fall back on the channel instruction)"}
`
    : "";
  const size = input.aspectRule ? `\n=== SIZE ===\n${input.aspectRule}\n` : "";
  // A resumed session still holds whatever research rule it opened with, so
  // turning research off has to be said out loud rather than merely omitted.
  const research =
    researchBlock(input.research) ||
    `\n=== RESEARCH (this message) ===
Web research is off for this message. Do not call "web_search" or "web_extract",
whatever earlier turns said.
`;
  return `${mentionBlock(input.mentioned)}${brief}${inlinedSkillBlock(
    input.inlinedSkills,
  )}${research}${size}
${input.message}`.trim();
}
