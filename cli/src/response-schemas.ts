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

export const repoSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  ownerUsername: z.string().nullable(),
  githubOwner: z.string().nullable(),
  githubRepository: z.string().nullable(),
  createdAt: z.string(),
});

export const sourceSummarySchema = z.object({
  name: z.string(),
  path: z.string(),
  entrypoint: z.string().nullable(),
  repository: z.string().optional(),
  experiment: z.string().nullable().optional(),
});

export const classFileResponseSchema = z.object({
  content: z.string(),
  truncated: z.boolean(),
  size: z.number(),
});

export const classSizeResponseSchema = z.object({ size: z.number() });

export const evaluationResultSchema = z
  .object({
    target: z.string().optional(),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
  })
  .passthrough();

export const evaluationSchema = z
  .object({
    id: z.string().optional(),
    status: z.string().optional(),
    benchmarks: z.array(z.string()).optional(),
    queuedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    totalCostUsd: z.number().nullable().optional(),
    totalDurationMs: z.number().nullable().optional(),
    results: z.array(evaluationResultSchema).optional(),
    summary: z
      .object({
        totalCostUsd: z.number().optional(),
        totalDurationMs: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();
