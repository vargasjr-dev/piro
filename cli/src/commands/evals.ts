import { piroFetch, resolveConfig } from "../client.js";

function fail(status: number, body: unknown, fallback: string): never {
  const error = body as Record<string, unknown> | null;
  console.error(`Error ${status}: ${error?.error ?? fallback}`);
  process.exit(1);
}

export async function evalsList(): Promise<void> {
  const config = resolveConfig();
  const response = await piroFetch(config, "/api/evals");
  if (!response.ok)
    fail(response.status, response.body, "evaluation listing failed");
  const evals = (response.body as { evals: Array<Record<string, unknown>> })
    .evals;
  if (evals.length === 0) {
    console.log("No evaluations found.");
    return;
  }
  console.log(
    "ID  STATUS  BENCHMARK  QUEUED_AT  COMPLETED_AT  COST_USD  RUNTIME_MS  TOKENS_IN/OUT",
  );
  for (const evaluation of evals) {
    const benchmarks = Array.isArray(evaluation.benchmarks)
      ? evaluation.benchmarks.join(",")
      : "-";
    console.log(
      [
        evaluation.id,
        evaluation.status,
        benchmarks,
        evaluation.queuedAt,
        evaluation.completedAt ?? "-",
        Number(evaluation.totalCostUsd ?? 0).toFixed(6),
        evaluation.totalDurationMs ?? 0,
        Array.isArray(evaluation.results)
          ? evaluation.results
              .map((result) => {
                const item = result as Record<string, unknown>;
                return `${item.target ?? "?"}:${item.inputTokens ?? "—"}/${item.outputTokens ?? "—"}`;
              })
              .join(",")
          : "—",
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
  const evaluation = response.body as {
    results?: Array<Record<string, unknown>>;
    summary?: { totalCostUsd?: number; totalDurationMs?: number };
  };
  console.log(
    JSON.stringify(
      {
        id,
        results: evaluation.results ?? [],
        summary: evaluation.summary ?? {},
      },
      null,
      2,
    ),
  );
}
