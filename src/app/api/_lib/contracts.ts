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

export function architectureFromPath(path: string): "ashfall" | "borealis" | null {
  const match = /^architectures\/(ashfall|borealis)(?:\/|$)/.exec(path);
  return match?.[1] === "ashfall" || match?.[1] === "borealis"
    ? match[1]
    : null;
}

export function modalTextToPiroOutput(text: string): PiroOutput {
  return { parts: [{ type: "text", text }] };
}
