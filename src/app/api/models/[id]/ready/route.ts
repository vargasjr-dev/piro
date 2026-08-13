import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { getHostedModel } from "~/lib/hosted-models";
import {
  checkHostedReadiness,
  HostedInferenceError,
} from "../../../_lib/hosted";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const hostedModel = isAdmin(session) ? getHostedModel(id) : undefined;
  if (!hostedModel)
    return Response.json({ error: "Model not found" }, { status: 404 });

  try {
    const readiness = await checkHostedReadiness(hostedModel);
    return Response.json(readiness, {
      headers:
        readiness.status === "warming_up"
          ? { "Retry-After": String(readiness.retryAfterMs / 1000) }
          : undefined,
    });
  } catch (error) {
    if (error instanceof HostedInferenceError) {
      if (error.upstreamStatus === 503) {
        const warmingUp = {
          status: "warming_up",
          retryAfterMs: 5_000,
        } as const;
        return Response.json(warmingUp, {
          status: 200,
          headers: { "Retry-After": "5" },
        });
      }
      return Response.json({ error: error.message }, { status: 502 });
    }
    return Response.json(
      { error: "Hosted readiness check failed" },
      { status: 502 },
    );
  }
}
