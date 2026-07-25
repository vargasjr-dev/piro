import { z } from "zod";

export const MODEL_ID_MIN_LENGTH = 8;

const MODEL_ID_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const modelIdSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .refine((value) => value.length >= MODEL_ID_MIN_LENGTH, {
    message: `Model ID must be at least ${MODEL_ID_MIN_LENGTH} characters`,
  })
  .refine((value) => !value.startsWith("piro"), {
    message: 'Model IDs beginning with "piro" are reserved',
  })
  .refine((value) => !value.endsWith("-global"), {
    message: 'Model IDs ending in "-global" are reserved',
  })
  .refine((value) => MODEL_ID_FORMAT.test(value), {
    message: "Use lowercase letters, numbers, and single hyphens between words",
  });
