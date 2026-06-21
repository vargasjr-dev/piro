/**
 * POST /api/admin/modal-secrets
 *
 * One-time utility: reads the Modal/R2 secrets that live in Vercel env vars
 * and returns them so they can be added to the Modal "piro-secrets" secret.
 *
 * Protected by Bearer API key (same as other /api routes).
 *
 * DELETE THIS ROUTE once Modal secrets are synced.
 */

import { extractBearer, validateApiKey } from "~/lib/api-auth";

const KEYS = [
  "DATABASE_URL",
  "MODAL_WEBHOOK_SECRET",
  "BUCKET_ENDPOINT_URL",
  "BUCKET_KEY_ID",
  "BUCKET_APPLICATION_SECRET",
] as const;

export async function POST(request: Request) {
  const bearer = extractBearer(request);
  if (!bearer) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const keyAuth = await validateApiKey(bearer);
  if (!keyAuth?.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result: Record<string, string | null> = {};
  for (const key of KEYS) {
    result[key] = process.env[key] ?? null;
  }

  const missing = KEYS.filter((k) => !result[k]);
  return Response.json({ secrets: result, missing });
}
