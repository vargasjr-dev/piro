import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../data/db";
import { repository, user } from "../../../../data/schema";
import { eq, desc } from "drizzle-orm";
import { extractBearer, validateApiKey } from "~/lib/api-auth";
import { parseGitHubRepositoryRef } from "~/lib/github-repository";

/**
 * GET /api/repos
 *
 * Lists all repositories for the authenticated user.
 * Accepts session cookie or Bearer API key.
 *
 * POST /api/repos
 *
 * Creates a new repository. Body:
 *   { id, name, githubRepository, description?, slug? }
 * githubRepository accepts a GitHub URL or owner/repository.
 * slug defaults to id if not provided. r2Prefix auto-set to repos/{id}/.
 */

async function resolveUserId(request: Request): Promise<string | null> {
  const bearer = extractBearer(request);
  if (bearer) {
    const keyAuth = await validateApiKey(bearer);
    if (keyAuth?.userId) return keyAuth.userId;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function GET(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const repos = await db
    .select({
      id: repository.id,
      name: repository.name,
      slug: repository.slug,
      description: repository.description,
      githubOwner: repository.githubOwner,
      githubRepository: repository.githubRepository,
      r2Prefix: repository.r2Prefix,
      createdAt: repository.createdAt,
      updatedAt: repository.updatedAt,
      ownerUsername: user.username,
    })
    .from(repository)
    .innerJoin(user, eq(repository.userId, user.id))
    .where(eq(repository.userId, userId))
    .orderBy(desc(repository.createdAt));

  return Response.json({
    repos: repos.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description ?? null,
      ownerUsername: r.ownerUsername,
      githubOwner: r.githubOwner,
      githubRepository: r.githubRepository,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id as string | undefined;
  const name = body.name as string | undefined;
  const githubRepositoryInput = body.githubRepository as string | undefined;
  if (!id || !name || !githubRepositoryInput) {
    return Response.json(
      { error: "id, name, and githubRepository are required" },
      { status: 400 },
    );
  }

  const githubRepo = parseGitHubRepositoryRef(githubRepositoryInput);
  if (!githubRepo) {
    return Response.json(
      { error: "githubRepository must be a GitHub URL or owner/repository" },
      { status: 400 },
    );
  }

  const slug = (body.slug as string | undefined) ?? id;
  const description = (body.description as string | undefined) ?? null;
  const r2Prefix = `repos/${id}/`;

  try {
    await db.insert(repository).values({
      id,
      userId,
      name,
      slug,
      description,
      githubOwner: githubRepo.owner,
      githubRepository: githubRepo.repository,
      r2Prefix,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert failed";
    if (msg.includes("unique")) {
      return Response.json(
        { error: `Repository '${id}' already exists` },
        { status: 409 },
      );
    }
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ id, ok: true });
}
