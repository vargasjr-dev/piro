/**
 * GET /api/classes/[id]/serialize
 *
 * Proxies to the Modal serialize endpoint on the caller's behalf, using the
 * server-side MODAL_WEBHOOK_SECRET.  Returns the full ModelManifest on
 * success, or a { error, detail } payload on failure — so callers (CLI,
 * debug tooling) see the actual Python traceback instead of a bare 500.
 *
 * Query params:
 *   bust=true   — forward cache-bust to Modal
 *
 * Auth: session cookie or Bearer API key (same as other /api/classes routes).
 */

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../../data/db";
import { modelClass } from "../../../../../../data/schema";
import { extractBearer, validateApiKey } from "~/lib/api-auth";

const SERIALIZE_ENDPOINT =
  process.env.MODAL_SERIALIZE_ENDPOINT ??
  "https://dvargasfuertes--piro-serialize.modal.run";

async function resolveUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [cls] = await db
    .select({ moduleR2Key: modelClass.moduleR2Key })
    .from(modelClass)
    .where(and(eq(modelClass.id, id), eq(modelClass.userId, userId)))
    .limit(1);

  if (!cls) return Response.json({ error: "Not found" }, { status: 404 });
  if (!cls.moduleR2Key)
    return Response.json({ error: "No module uploaded for this class" }, { status: 404 });

  const bust = new URL(request.url).searchParams.get("bust") === "true";
  const url = `${SERIALIZE_ENDPOINT}?class_id=${encodeURIComponent(id)}${bust ? "&bust=true" : ""}`;

  const secret = process.env.MODAL_WEBHOOK_SECRET ?? "";

  let modalRes: Response;
  try {
    modalRes = await fetch(url, {
      headers: { "X-Piro-Secret": secret },
      cache: "no-store",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "Serialize endpoint unreachable", detail },
      { status: 502 },
    );
  }

  // Capture raw text first so we never lose the body regardless of content-type
  const rawText = await modalRes.text().catch(() => "");
  let body: unknown = rawText;
  try {
    body = JSON.parse(rawText);
  } catch { /* keep as raw string */ }

  if (!modalRes.ok) {
    const detail =
      rawText.length > 0
        ? typeof body === "object" && body !== null
          ? JSON.stringify(body)
          : rawText
        : `HTTP ${modalRes.status}`;
    return Response.json(
      { error: `Serialize endpoint returned ${modalRes.status}`, detail },
      { status: modalRes.status },
    );
  }

  return Response.json(body, { status: 200 });
}
