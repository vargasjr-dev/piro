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
export type InferenceArchitecture = "ashfall" | "borealis";

export function architectureFromPath(
  path: string,
): InferenceArchitecture | null {
  const normalized = path.trim().replace(/^\/+|\/+$/g, "");
  if (normalized === "architectures/ashfall/main.py") return "ashfall";
  if (normalized === "architectures/borealis/main.py") return "borealis";
  return null;
}

export function modalTextToPiroOutput(text: string): PiroOutput {
  return { parts: [{ type: "text", text }] };
}
