import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../../../../data/db";
import {
  account,
  repository,
  user,
} from "../../../../../../../../../data/schema";
import { verifyArchitectureSerializationHandoff } from "~/lib/architecture-serialization-handoff.server";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; slug: string; architecture: string }>;
  },
) {
  const { id: username, slug, architecture: encodedArchitecture } = await params;
  const architectureName = decodeURIComponent(encodedArchitecture);
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    source?: string;
  } | null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);
  if (!owner)
    return Response.json({ error: "Repository not found" }, { status: 404 });

  const [repo] = await db
    .select({ slug: repository.slug })
    .from(repository)
    .where(and(eq(repository.userId, owner.id), eq(repository.slug, slug)))
    .limit(1);
  if (!repo)
    return Response.json({ error: "Repository not found" }, { status: 404 });

  if (!body?.token) {
    return Response.json(
      { error: "Serialization handoff required" },
      { status: 400 },
    );
  }

  const source = body?.source;
  if (!source) {
    return Response.json(
      { error: "Architecture source required" },
      { status: 400 },
    );
  }

  if (
    !verifyArchitectureSerializationHandoff({
      token: body.token,
      username,
      repository: repo.slug,
      architecture: architectureName,
      source,
    })
  ) {
    return Response.json(
      { error: "Invalid serialization handoff" },
      { status: 403 },
    );
  }

  try {
    const requestSignal = AbortSignal.timeout(20_000);
    const endpoint =
      process.env.MODAL_SERIALIZE_SOURCE_ENDPOINT ??
      "https://dvargasfuertes--piro-serialize-source.modal.run";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Piro-Secret": process.env.MODAL_WEBHOOK_SECRET ?? "",
      },
      body: JSON.stringify({ source }),
      cache: "no-store",
      signal: requestSignal,
    });

    const body = await response
      .json()
      .catch(() => ({ error: "Invalid serializer response" }));
    if (!response.ok) {
      return Response.json(
        {
          error: "Architecture serialization failed",
          detail: body.detail ?? body.error,
        },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }

    return Response.json(body);
  } catch (error) {
    console.error("[architecture-serialize] failed", error);
    return Response.json(
      { error: "Architecture serialization failed" },
      { status: 502 },
    );
  }
}
