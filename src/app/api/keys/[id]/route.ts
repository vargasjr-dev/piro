/**
 * DELETE /api/keys/[id]  — revoke an API key (sets revokedAt = now)
 */

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { apiKey } from "../../../../../data/schema";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [updated] = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKey.id, id), eq(apiKey.userId, session.user.id)))
    .returning({ id: apiKey.id });

  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true });
}
