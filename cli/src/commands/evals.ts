import { piroFetch, resolveConfig } from "../client.js";
import { errorMessage, evaluationSchema } from "../response-schemas.js";
import { z } from "zod";

const evalListResponseSchema = z.object({
  evals: z.array(evaluationSchema),
});

function fail(status: number, body: unknown, fallback: string): never {
  console.error(`Error ${status}: ${errorMessage(body, fallback)}`);
  process.exit(1);
}

export async function evalsList(): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(config, "/api/evals");
  if (!response.ok)
    fail(response.status, response.body, "evaluation listing failed");
  const parsed = evalListResponseSchema.safeParse(response.body);
  if (!parsed.success)
    fail(502, response.body, "evaluation listing response was invalid");
  const evals = parsed.data.evals;
  if (evals.length === 0) {
    console.log("No evaluations found.");
    return;
  }
  console.log(
    "ID  STATUS  BENCHMARK  QUEUED_AT  COMPLETED_AT  COST_USD  RUNTIME_MS  TOKENS_IN/OUT",
  );
  for (const evaluation of evals) {
    const benchmarks = evaluation.benchmarks?.join(",") ?? "-";
    const tokens =
      evaluation.results
        ?.map(
          (result) =>
            `${result.target ?? "?"}:${result.inputTokens ?? "—"}/${result.outputTokens ?? "—"}`,
        )
        .join(",") ?? "—";
    console.log(
      [
        evaluation.id ?? "?",
        evaluation.status ?? "?",
        benchmarks,
        evaluation.queuedAt ?? "-",
        evaluation.completedAt ?? "-",
        Number(evaluation.totalCostUsd ?? 0).toFixed(6),
        evaluation.totalDurationMs ?? 0,
        tokens,
      ].join("  "),
    );
  }
}

export async function evalsGet(id: string): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(
    config,
    `/api/evals/${encodeURIComponent(id)}`,
  );
  if (!response.ok)
    fail(response.status, response.body, "evaluation lookup failed");
  const parsed = evaluationSchema.safeParse(response.body);
  if (!parsed.success)
    fail(502, response.body, "evaluation response was invalid");
  console.log(
    JSON.stringify(
      {
        id,
        results: parsed.data.results ?? [],
        summary: parsed.data.summary ?? {},
      },
      null,
      2,
    ),
  );
}
