import { waitUntil } from "@vercel/functions";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../../../../data/db";
import { benchmarkSuiteRun } from "../../../../../../../../../data/schema";
import { getRepositoryComponent } from "~/lib/github-repository";
import { getRepositoryContext } from "~/lib/repository-context.server";
import { BENCHMARKS, runSuite } from "~/lib/benchmarks/runner";

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ username: string; slug: string; benchmark: string }>;
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { username, slug, benchmark: encodedBenchmark } = await params;
  const benchmarkName = decodeURIComponent(encodedBenchmark);
  const context = await getRepositoryContext(username, slug);
  if (!context)
    return Response.json({ error: "Repository not found" }, { status: 404 });
  if (context.owner.id !== session.user.id) {
    return Response.json(
      { error: "Only the repository owner can run evaluations" },
      { status: 403 },
    );
  }
  if (!context.githubRepo) {
    return Response.json(
      { error: "Repository is not linked to GitHub" },
      { status: 404 },
    );
  }

  const component = await getRepositoryComponent(
    context.githubRepo.owner,
    context.githubRepo.repository,
    "benchmarks",
    benchmarkName,
    context.accessToken,
    AbortSignal.timeout(10_000),
  ).catch(() => null);
  if (!component)
    return Response.json({ error: "Benchmark not found" }, { status: 404 });

  const registered = BENCHMARKS.find(
    (benchmark) =>
      normalizeName(benchmark.name) === normalizeName(benchmarkName),
  );
  if (!registered) {
    return Response.json(
      {
        error:
          "This benchmark is visible, but its evaluator is not registered in Piro yet.",
      },
      { status: 409 },
    );
  }

  const suiteRunId = crypto.randomUUID();
  await db.insert(benchmarkSuiteRun).values({
    id: suiteRunId,
    userId: session.user.id,
    status: "queued",
    benchmarks: JSON.stringify([registered.name]),
    targets: null,
  });
  waitUntil(runSuite(suiteRunId, session.user.id, [registered.name], null));

  return Response.json(
    { suiteRunId, message: "Evaluation started." },
    { status: 202 },
  );
}
