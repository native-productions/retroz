import { z } from "zod";

/**
 * Per-endpoint quirk flags for the OPENAI_COMPAT engine.
 *
 * "OpenAI-compatible" describes a family, not a single protocol. Gateways
 * disagree on whether parallel tool calls work, whether strict JSON schemas are
 * accepted, what the system message is called, and which max-tokens parameter
 * the endpoint reads. These are stored per provider so a broken endpoint can be
 * corrected from the settings page instead of a code change.
 */
export const providerCapabilitiesSchema = z.object({
  /**
   * Endpoint accepts more than one tool call per assistant turn. Turning this
   * off sends `parallel_tool_calls: false`, which some gateways require.
   */
  parallelToolCalls: z.boolean().default(true),
  /** Endpoint honours JSON Schema `strict` on tool parameters. */
  strictSchemas: z.boolean().default(false),
  /** Name of the instruction role. Newer OpenAI models want "developer". */
  systemRole: z.enum(["system", "developer"]).default("system"),
  /** Ask for token usage on streamed responses. A few endpoints reject it. */
  includeUsage: z.boolean().default(true),
  /** Hard ceiling on agent steps per run, so a looping model cannot burn a key. */
  maxSteps: z.number().int().min(1).max(200).default(60),
});

export type ProviderCapabilities = z.output<typeof providerCapabilitiesSchema>;

export const DEFAULT_CAPABILITIES: ProviderCapabilities =
  providerCapabilitiesSchema.parse({});

/** Read the JSON column back, falling back to defaults for anything missing. */
export function parseCapabilities(value: unknown): ProviderCapabilities {
  const parsed = providerCapabilitiesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_CAPABILITIES;
}
