import { z } from "zod";

export const errorBodySchema = z.object({ error: z.string() }).passthrough();

export function errorMessage(body: unknown, fallback: string): string {
  const parsed = errorBodySchema.safeParse(body);
  return parsed.success ? parsed.data.error : fallback;
}

export const datasetSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  sourcePath: z.string(),
  sampleCount: z.number().nullable(),
  generatedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const sourceSummarySchema = z.object({
  name: z.string(),
  path: z.string(),
  entrypoint: z.string().nullable(),
  experiment: z.string().nullable().optional(),
});

export const evaluationResultSchema = z
  .object({
    target: z.string(),
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
  })
  .passthrough();

export const evaluationSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    benchmarks: z.array(z.string()).nullable(),
    queuedAt: z.string(),
    completedAt: z.string().nullable(),
    totalCostUsd: z.number(),
    totalDurationMs: z.number(),
    results: z.array(evaluationResultSchema),
    summary: z
      .object({
        totalCostUsd: z.number(),
        totalDurationMs: z.number(),
      })
      .optional(),
  })
  .passthrough();
