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

const supportedArchitectures = new Set<InferenceArchitecture>([
  "ashfall",
  "borealis",
]);

function architectureFromIdentifier(
  value: unknown,
): InferenceArchitecture | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^\/+|\/+$/g, "");
  if (supportedArchitectures.has(normalized as InferenceArchitecture)) {
    return normalized as InferenceArchitecture;
  }
  if (
    normalized === "ctm" ||
    normalized === "ctm.py" ||
    normalized === "ctm-10x" ||
    normalized === "ctm_10x"
  ) {
    return "ashfall";
  }
  return null;
}

export function architectureFromPath(
  path: string,
): InferenceArchitecture | null {
  const normalized = path.trim().replace(/^\/+|\/+$/g, "");
  const match = /^(?:architectures\/(ashfall|borealis)(?:\/|$))/.exec(
    normalized,
  );
  if (match?.[1]) return architectureFromIdentifier(match[1]);

  if (
    normalized === "architectures/ctm" ||
    normalized === "architectures/ctm.py" ||
    normalized === "model/ctm" ||
    normalized === "model/ctm.py" ||
    normalized === "piro/ctm" ||
    normalized === "piro/ctm.py"
  ) {
    return "ashfall";
  }

  return architectureFromIdentifier(normalized);
}

export function architectureFromTrainingMetadata(
  architecturePath: string | null | undefined,
  configJson: string | null | undefined,
): InferenceArchitecture | null {
  const fromPath = architecturePath
    ? architectureFromPath(architecturePath)
    : null;
  if (fromPath) return fromPath;
  if (!configJson) return null;

  try {
    const config: unknown = JSON.parse(configJson);
    if (!config || typeof config !== "object") return null;

    for (const key of [
      "architecture",
      "architectureName",
      "architecturePath",
      "modelTemplate",
      "template",
    ]) {
      const value = (config as Record<string, unknown>)[key];
      const fromValue =
        architectureFromPath(String(value ?? "")) ??
        architectureFromIdentifier(value);
      if (fromValue) return fromValue;
    }
  } catch {
    return null;
  }

  return null;
}

export function modalTextToPiroOutput(text: string): PiroOutput {
  return { parts: [{ type: "text", text }] };
}
