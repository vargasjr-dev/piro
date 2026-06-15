import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";

const REPO_OWNER = "vargasjr-dev";
const REPO_NAME = "piro";
const WORKFLOW_ID = "benchmark.yml";

// ── POST /api/benchmarks/trigger — dispatch a benchmark run via GitHub Actions ─

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_DISPATCH_TOKEN not configured" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { benchmark, model } = body as {
    benchmark?: string;
    model?: string;
  };

  const res = await fetch(
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
          benchmark: benchmark ?? "",
          model: model ?? "",
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[benchmarks/trigger] GitHub dispatch failed:", res.status, text);
    return NextResponse.json(
      { error: `GitHub dispatch failed (${res.status})` },
      { status: res.status },
    );
  }

  // GitHub returns 204 No Content on success
  return NextResponse.json({ queued: true });
}
