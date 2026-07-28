import { z } from "zod";

const textPartSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().refine((value) => value.trim().length > 0, {
      message: "text must not be empty",
    }),
  })
  .strict();

export const piroInputSchema = z
  .object({
    parts: z.array(textPartSchema).min(1),
  })
  .strict();

export type PiroInput = z.infer<typeof piroInputSchema>;
export type PiroOutput = PiroInput;

const architecturePathPattern =
  /^architectures\/([a-z0-9][a-z0-9_-]*)\/main\.py$/;

export function architectureFromPath(path: string): string | null {
  const normalized = path.trim().replace(/^\/+|\/+$/g, "");
  return architecturePathPattern.exec(normalized)?.[1] ?? null;
}

export function modalTextToPiroOutput(text: string): PiroOutput {
  return { parts: [{ type: "text", text }] };
}
