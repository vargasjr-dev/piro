import { z } from "zod";

const modelIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/;
const revisionPattern = /^[A-Za-z0-9._-]{1,128}$/;

export const huggingFaceMigrationRequestSchema = z.object({
  model: z
    .string()
    .trim()
    .regex(modelIdPattern, "model must be a Hugging Face repository id like google/gemma-3-270m"),
  revision: z
    .string()
    .trim()
    .regex(revisionPattern, "revision must be a branch, tag, or commit id"),
});

export type HuggingFaceMigrationRequest = z.infer<
  typeof huggingFaceMigrationRequestSchema
>;

export function modelPrefix(model: string, revision: string): string {
  return `models/${model.replaceAll("/", "--")}/${revision}`;
}

export function encodeRepositoryFile(filename: string): string {
  return filename.split("/").map(encodeURIComponent).join("/");
}

export function huggingFaceApiUrl(model: string, revision: string): string {
  return `https://huggingface.co/api/models/${model}?revision=${encodeURIComponent(revision)}`;
}

export function huggingFaceFileUrl(
  model: string,
  revision: string,
  filename: string,
): string {
  return `https://huggingface.co/${model}/resolve/${encodeURIComponent(revision)}/${encodeRepositoryFile(filename)}?download=true`;
}
