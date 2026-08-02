// Length limits for a skill, shared by the zod schema and the editor form so
// the dialog can warn while typing instead of letting the action reject a paste.
// Kept in their own module because the editor is a client component and should
// not pull zod into the browser bundle just to read two numbers.

export const SKILL_NAME_MAX = 80;

/** Goes on one line of SKILL.md frontmatter — it is how the skill gets matched. */
export const SKILL_DESCRIPTION_MAX = 300;

/**
 * The SKILL.md body. Generous on purpose: installed skills read off disk by
 * `syncSkillsFromDisk` are not truncated, so a hand-pasted skill of the same
 * size must not be rejected either.
 */
export const SKILL_CONTENT_MAX = 200_000;
