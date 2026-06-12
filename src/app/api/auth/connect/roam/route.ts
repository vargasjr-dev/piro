import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { integration } from "../../../../../../data/schema";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    apiToken?: string;
    graphName?: string;
  };

  const apiToken = body.apiToken?.trim();
  const graphName = body.graphName?.trim();

  if (!apiToken || !graphName) {
    return NextResponse.json(
      { error: "API token and graph name are required" },
      { status: 400 },
    );
  }

  // Validate credentials against the Roam API
  const testRes = await fetch(
    `https://api.roamresearch.com/api/graph/${graphName}/q`,
    {
      method: "POST",
      headers: {
        "X-Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      // Minimal query — just checks auth without pulling real data
      body: JSON.stringify({
        query: "[:find (count ?e) . :where [?e :node/title]]",
      }),
    },
  ).catch(() => null);

  if (!testRes) {
    return NextResponse.json(
      { error: "Could not reach Roam — check your network and try again." },
      { status: 502 },
    );
  }

  if (testRes.status === 401 || testRes.status === 403) {
    return NextResponse.json(
      { error: "Invalid API token. Check Roam Settings → API Tokens." },
      { status: 401 },
    );
  }

  if (testRes.status === 404) {
    return NextResponse.json(
      { error: `Graph "${graphName}" not found. Check the name in your Roam URL.` },
      { status: 404 },
    );
  }

  if (!testRes.ok) {
    return NextResponse.json(
      { error: `Roam returned ${testRes.status} — try again later.` },
      { status: 502 },
    );
  }

  // Upsert the integration record
  const [existing] = await db
    .select()
    .from(integration)
    .where(
      and(
        eq(integration.userId, session.user.id),
        eq(integration.provider, "roam"),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(integration)
      .set({
        accessToken: apiToken,
        providerUsername: graphName,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(integration.id, existing.id));
  } else {
    await db.insert(integration).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      provider: "roam",
      accessToken: apiToken,
      providerUsername: graphName,
      status: "active",
    });
  }

  return NextResponse.json({ ok: true });
}
