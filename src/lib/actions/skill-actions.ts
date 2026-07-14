"use server";

import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db-client";
import { PROJECT_ROOT, slugify } from "@/lib/paths";
import { skillUpsertSchema, workflowSkillSchema } from "@/lib/validation";

const SKILLS_DIR = path.join(PROJECT_ROOT, ".claude", "skills");

function skillFilePath(slug: string): string {
  return path.join(SKILLS_DIR, slug, "SKILL.md");
}

function renderSkillMd(input: {
  slug: string;
  description: string;
  content: string;
}): string {
  const frontmatter = `---\nname: ${input.slug}\ndescription: ${input.description.replace(/\n/g, " ")}\n---\n\n`;
  return frontmatter + (input.content || `# ${input.slug}\n`);
}

async function writeSkillFile(skill: {
  slug: string;
  description: string;
  content: string;
}): Promise<void> {
  const dir = path.join(SKILLS_DIR, skill.slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(skillFilePath(skill.slug), renderSkillMd(skill), "utf8");
}

async function removeSkillFile(slug: string): Promise<void> {
  await fs.rm(path.join(SKILLS_DIR, slug), { recursive: true, force: true });
}

export async function upsertSkill(input: unknown) {
  const data = skillUpsertSchema.parse(input);

  if (data.id) {
    const existing = await db.skill.findUniqueOrThrow({
      where: { id: data.id },
    });
    const skill = await db.skill.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description ?? "",
        content: data.content ?? "",
        enabled: data.enabled,
      },
    });
    // slug is immutable once created; sync file
    if (skill.enabled) {
      await writeSkillFile({
        slug: existing.slug,
        description: skill.description,
        content: skill.content,
      });
    } else {
      await removeSkillFile(existing.slug);
    }
  } else {
    let slug = slugify(data.name);
    let n = 1;
    while (await db.skill.findUnique({ where: { slug } })) {
      slug = `${slugify(data.name)}-${++n}`;
    }
    const skill = await db.skill.create({
      data: {
        slug,
        name: data.name,
        description: data.description ?? "",
        content: data.content ?? "",
        enabled: data.enabled,
      },
    });
    if (skill.enabled) {
      await writeSkillFile({
        slug,
        description: skill.description,
        content: skill.content,
      });
    }
  }

  revalidatePath("/skills");
}

export async function deleteSkill(id: string) {
  const skill = await db.skill.delete({ where: { id } });
  await removeSkillFile(skill.slug);
  revalidatePath("/skills");
}

/** Assign / unassign a skill to a workflow (mirrors setWorkflowFont). */
export async function setWorkflowSkill(input: unknown) {
  const data = workflowSkillSchema.parse(input);
  if (data.assigned) {
    await db.workflowSkill.upsert({
      where: {
        workflowId_skillId: {
          workflowId: data.workflowId,
          skillId: data.skillId,
        },
      },
      update: {},
      create: { workflowId: data.workflowId, skillId: data.skillId },
    });
  } else {
    await db.workflowSkill.deleteMany({
      where: { workflowId: data.workflowId, skillId: data.skillId },
    });
  }
  revalidatePath(`/workflows/${data.workflowId}`);
}

/** Parse a SKILL.md into its frontmatter name/description and body content. */
function parseSkillMd(raw: string): {
  name?: string;
  description: string;
  content: string;
} {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { description: "", content: raw.trim() };
  const [, frontmatter, body] = m;
  const unquote = (v: string) => v.trim().replace(/^["']|["']$/g, "").trim();
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1];
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1];
  return {
    name: name ? unquote(name) : undefined,
    description: description ? unquote(description) : "",
    content: body.trim(),
  };
}

/** Title-case a slug for a display name: "content-strategy-sms" → "Content Strategy Sms". */
function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Import every `.claude/skills/<slug>/SKILL.md` on disk into the DB so
 * CLI-installed or hand-dropped skills show up on /skills. New slugs are
 * created (enabled); existing ones refresh description/content from disk.
 * Symlinked skill folders (e.g. installed via `npx skills add`) are followed.
 */
export async function syncSkillsFromDisk(): Promise<{
  imported: number;
  updated: number;
}> {
  let entries: string[];
  try {
    entries = await fs.readdir(SKILLS_DIR);
  } catch {
    return { imported: 0, updated: 0 };
  }

  let imported = 0;
  let updated = 0;
  for (const slug of entries) {
    let raw: string;
    try {
      // path resolves through a symlinked directory automatically
      raw = await fs.readFile(skillFilePath(slug), "utf8");
    } catch {
      continue; // no SKILL.md → skip (not a skill dir)
    }
    const parsed = parseSkillMd(raw);
    const existing = await db.skill.findUnique({ where: { slug } });
    if (existing) {
      await db.skill.update({
        where: { slug },
        data: { description: parsed.description, content: parsed.content },
      });
      updated++;
    } else {
      await db.skill.create({
        data: {
          slug,
          name: parsed.name && parsed.name !== slug
            ? parsed.name
            : humanizeSlug(slug),
          description: parsed.description,
          content: parsed.content,
          enabled: true,
        },
      });
      imported++;
    }
  }

  revalidatePath("/skills");
  return { imported, updated };
}
