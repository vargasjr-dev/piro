import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { getHostedModel } from "~/lib/hosted-models";
import {
  getHostedDeploymentStatus,
  HostedInferenceError,
  wakeHostedDeployment,
} from "../../../_lib/hosted";

export const runtime = "nodejs";

async function resolveHostedModel(
  params: Promise<{ id: string }>,
  requestHeaders: Headers,
) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session)
    return {
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };

  const { id } = await params;
  const hostedModel = isAdmin(session) ? getHostedModel(id) : undefined;
  if (!hostedModel) {
    return {
      response: Response.json({ error: "Model not found" }, { status: 404 }),
    };
  }
  return { hostedModel };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveHostedModel(params, await headers());
  if ("response" in resolved) return resolved.response;

  try {
    return Response.json(await getHostedDeploymentStatus(resolved.hostedModel));
  } catch (error) {
    if (error instanceof HostedInferenceError) {
      return Response.json(
        { status: "unavailable", detail: error.message },
        { status: 502 },
      );
    }
    return Response.json(
      { status: "unavailable", detail: "Deployment status unavailable" },
      { status: 502 },
    );
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveHostedModel(params, await headers());
  if ("response" in resolved) return resolved.response;

  try {
    return Response.json(await wakeHostedDeployment(resolved.hostedModel));
  } catch (error) {
    if (error instanceof HostedInferenceError) {
      return Response.json(
        { status: "unavailable", detail: error.message },
        { status: 502 },
      );
    }
    return Response.json(
      { status: "unavailable", detail: "Deployment wake failed" },
      { status: 502 },
    );
  }
}
