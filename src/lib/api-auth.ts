/**
 * src/lib/api-auth.ts
 *
 * Shared helper for API-key–based authentication.
 *
 * Keys have the format:  piro_<32 lowercase hex chars>
 * We store a SHA-256 hash of the raw key; the raw key is never persisted.
 *
 * Usage in a route handler:
 *   const auth = await resolveAuth(request);
 *   if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
 *   const { userId } = auth;
 */

import { createHash, randomBytes } from "crypto";
import { eq, isNull } from "drizzle-orm";
import { db } from "../../data/db";
import { apiKey } from "../../data/schema";

// ── Key generation ────────────────────────────────────────────────────────────

/** Generate a new raw API key.  Format: piro_<32 hex chars>  (128-bit entropy). */
export function generateApiKey(): string {
  return `piro_${randomBytes(16).toString("hex")}`;
}

/** SHA-256 hex digest — what we store in the DB. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** The display prefix shown in the UI (safe — no secret bits). */
export function keyPrefix(raw: string): string {
  return raw.slice(0, 12); // "piro_abc123d"
}

// ── Key validation ────────────────────────────────────────────────────────────

interface AuthResult {
  userId: string;
  source: "session" | "api_key";
}

/**
 * Validate the Bearer token from an Authorization header.
 * Returns the userId if valid and not revoked, otherwise null.
 * Side-effect: stamps lastUsedAt on success.
 */
export async function validateApiKey(raw: string): Promise<AuthResult | null> {
  if (!raw.startsWith("piro_")) return null;

  const hash = hashApiKey(raw);
  const [key] = await db
    .select({ id: apiKey.id, userId: apiKey.userId, revokedAt: apiKey.revokedAt })
    .from(apiKey)
    .where(eq(apiKey.keyHash, hash))
    .limit(1);

  if (!key || key.revokedAt !== null) return null;

  // Stamp lastUsedAt (fire-and-forget — don't block the response)
  void db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, key.id));

  return { userId: key.userId, source: "api_key" };
}

/**
 * Extract the Bearer token from a Request's Authorization header.
 * Returns null if absent or malformed.
 */
export function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}
