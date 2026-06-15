import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { createSign } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../data/db";
import { benchmarkSuiteRun } from "../../../../../data/schema";

const REPO_OWNER = "vargasjr-dev";
const REPO_NAME = "piro";
const WORKFLOW_ID = "benchmark.yml";
const INSTALLATION_ID = "97994364"; // vargasjr-dev org

// ── GitHub App auth ───────────────────────────────────────────────────────────

function makeJWT(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  return `${unsigned}.${sign.sign(privateKey, "base64url")}`;
}

async function getInstallationToken(
  appId: string,
  privateKey: string,
): Promise<string> {
  const jwt = makeJWT(appId, privateKey);
  const res = await fetch(
    `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to get installation token: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

// ── POST /api/benchmarks/trigger ─────────────────────────────────────────────
// Body: { benchmarks?: string[], targets?: string[] }
// Creates a benchmark_suite_run record then dispatches the GHA workflow.

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    return NextResponse.json(
      { error: "GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY not configured" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { benchmarks, targets } = body as {
    benchmarks?: string[];
    targets?: string[];
  };

  // Create the suite run record first — this is what the UI polls
  const suiteRunId = crypto.randomUUID();
  await db.insert(benchmarkSuiteRun).values({
    id: suiteRunId,
    userId: session.user.id,
    status: "queued",
    benchmarks: benchmarks && benchmarks.length > 0
      ? JSON.stringify(benchmarks)
      : null,
    targets: targets && targets.length > 0
      ? JSON.stringify(targets)
      : null,
  });

  // Dispatch GHA workflow
  let token: string;
  try {
    token = await getInstallationToken(appId, privateKey);
  } catch (e) {
    console.error("[benchmarks/trigger] App auth failed:", e);
    // Mark as error so the UI doesn't spin forever
    await db
      .update(benchmarkSuiteRun)
      .set({ status: "error", error: "GitHub App authentication failed", completedAt: new Date() })
      .where(eq(benchmarkSuiteRun.id, suiteRunId));
    return NextResponse.json(
      { error: "GitHub App authentication failed" },
      { status: 503 },
    );
  }

  const dispatched = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_ID}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          suite_run_id: suiteRunId,
          benchmarks: benchmarks?.join(",") ?? "",
          models: targets?.join(",") ?? "",
        },
      }),
    },
  );

  if (!dispatched.ok) {
    const text = await dispatched.text();
    console.error("[benchmarks/trigger] GitHub dispatch failed:", dispatched.status, text);
    await db
      .update(benchmarkSuiteRun)
      .set({ status: "error", error: `GitHub dispatch failed (${dispatched.status})`, completedAt: new Date() })
      .where(eq(benchmarkSuiteRun.id, suiteRunId));
    return NextResponse.json(
      { error: `GitHub dispatch failed (${dispatched.status})` },
      { status: dispatched.status },
    );
  }

  return NextResponse.json({ suiteRunId });
}
