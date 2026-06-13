import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/lib/auth.server";
import { headers } from "next/headers";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../../../../../data/db";
import { integration, syncJob } from "../../../../../../data/schema";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify the integration belongs to this user
  const [integ] = await db
    .select({ id: integration.id })
    .from(integration)
    .where(and(eq(integration.id, id), eq(integration.userId, session.user.id)))
    .limit(1);

  if (!integ)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const limit = Math.min(
    50,
    parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10),
  );

  const jobs = await db
    .select()
    .from(syncJob)
    .where(eq(syncJob.integrationId, id))
    .orderBy(desc(syncJob.startedAt))
    .limit(limit);

  return NextResponse.json({ jobs });
}
