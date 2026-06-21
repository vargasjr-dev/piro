/**
 * GET  /api/keys  — list the authenticated user's API keys (no hashes)
 * POST /api/keys  — create a new API key; returns the raw key ONCE
 */

import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { eq, isNull } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { apiKey } from "../../../../data/schema";
import { generateApiKey, hashApiKey, keyPrefix } from "~/lib/api-auth";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, session.user.id))
    .orderBy(apiKey.createdAt);

  return Response.json({ keys });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const raw = generateApiKey();
  const hash = hashApiKey(raw);
  const prefix = keyPrefix(raw);

  const [created] = await db
    .insert(apiKey)
    .values({
      id: randomUUID(),
      userId: session.user.id,
      name,
      keyHash: hash,
      keyPrefix: prefix,
    })
    .returning({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
    });

  // Return the raw key ONCE — it will never be retrievable again
  return Response.json({ key: { ...created, rawKey: raw } }, { status: 201 });
}
