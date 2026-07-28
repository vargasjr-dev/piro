import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { db } from "../../../../../data/db";
import { deployment, model } from "../../../../../data/schema";
import ModelSandbox from "../ModelSandbox";

export default async function ModelSandboxPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [modelRow] = await db
    .select({
      id: model.id,
      name: model.name,
      parameterCount: model.parameterCount,
      createdAt: model.createdAt,
      isGlobal: deployment.isAdmin,
    })
    .from(model)
    .innerJoin(deployment, eq(deployment.modelId, model.id))
    .where(
      and(
        eq(model.name, name),
        isNull(model.archivedAt),
        eq(deployment.enabled, true),
        or(
          and(
            eq(deployment.isAdmin, false),
            eq(deployment.createdByUserId, session.user.id),
            eq(model.userId, session.user.id),
          ),
          and(
            eq(deployment.isAdmin, true),
            or(
              isNull(deployment.targetUserId),
              eq(deployment.targetUserId, session.user.id),
            ),
          ),
        ),
      ),
    )
    .orderBy(desc(deployment.isAdmin), desc(deployment.createdAt))
    .limit(1);

  if (!modelRow) notFound();

  const apiExample = `curl "https://trainpiro.app/api/models/${modelRow.id}/invoke" \\
  -H "Authorization: Bearer $PIRO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "parts": [
      { "type": "text", "text": "What should you remember?" }
    ]
  }'`;

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <Link
            href="/models"
            aria-label="Back to models"
            title="Back to models"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-amber-400/65 transition hover:bg-amber-900/20 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
          >
            ←
          </Link>
          <h1 className="min-w-0 truncate text-2xl font-black tracking-tight text-amber-50 sm:text-3xl">
            {modelRow.name}
          </h1>
        </div>

        <div className="mt-4">
          <ModelSandbox
            modelId={modelRow.id}
            more={{
              apiExample,
              isGlobal: modelRow.isGlobal,
              parameterCount: modelRow.parameterCount?.toLocaleString() ?? "—",
              deployedAt: modelRow.createdAt.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              access: modelRow.isGlobal ? "Shared" : "Private",
            }}
          />
        </div>
      </div>
    </div>
  );
}
