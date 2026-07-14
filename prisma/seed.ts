import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_USER_EMAIL ?? "you@example.com";
  const password = process.env.SEED_USER_PASSWORD ?? "changeme123";
  const name = process.env.SEED_USER_NAME ?? "You";

  const passwordHash = await bcrypt.hash(password, 10);

  await db.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, passwordHash },
  });
  console.log(`Seeded user: ${email}`);

  await db.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  console.log("Seeded app settings (singleton)");

  // Starter skill — content recipe Claude can load during runs.
  const starterSlug = "instagram-carousel";
  const starterBody = `# Instagram Carousel

When producing a carousel with the render_html_to_png tool:

- One idea per slide. Slide 1 is the hook, last slide is the CTA.
- Use a strong, readable headline (large weight, high contrast).
- Keep the source photo visible — overlays frame it, never bury it.
- Match the workflow's brand colors and handle placement.
- Export 1080x1350 (portrait) unless the task says otherwise.
- Name files in order: 01-hook.png, 02-*.png, ..., NN-cta.png.
`;
  const starterDesc =
    "Layout recipe for engaging Instagram education carousels.";
  await db.skill.upsert({
    where: { slug: starterSlug },
    update: {},
    create: {
      slug: starterSlug,
      name: "instagram-carousel",
      description: starterDesc,
      content: starterBody,
      enabled: true,
    },
  });
  const skillDir = path.join(process.cwd(), ".claude", "skills", starterSlug);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${starterSlug}\ndescription: ${starterDesc}\n---\n\n${starterBody}`,
    "utf8",
  );
  console.log("Seeded starter skill: instagram-carousel");
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
