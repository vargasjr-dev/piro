import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { getHostedModelByRouteKey } from "~/lib/hosted-models";
import { db } from "../../../../../data/db";
import { deployment, model } from "../../../../../data/schema";
import GlobalDeploymentControls from "../GlobalDeploymentControls";
import ModelSandbox from "../ModelSandbox";
import {
  deleteGlobalDeployment,
  disableGlobalDeployment,
  disablePrivateDeployment,
} from "../actions";

export default async function ModelSandboxPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const adminSession = isAdmin(session);
  const hostedModel = adminSession ? getHostedModelByRouteKey(name) : undefined;
  const privateDeployment = and(
    eq(deployment.isAdmin, false),
    eq(deployment.enabled, true),
    eq(deployment.createdByUserId, session.user.id),
    eq(model.userId, session.user.id),
  );
  const globalDeployment = and(
    eq(deployment.isAdmin, true),
    or(
      isNull(deployment.targetUserId),
      eq(deployment.targetUserId, session.user.id),
    ),
  );
  const visibleDeployment = adminSession
    ? or(privateDeployment, globalDeployment)
    : or(
        privateDeployment,
        and(globalDeployment, eq(deployment.enabled, true)),
      );

  const [modelRow] = hostedModel
    ? []
    : await db
        .select({
          id: model.id,
          name: model.name,
          parameterCount: model.parameterCount,
          createdAt: deployment.createdAt,
          deploymentId: deployment.id,
          isGlobal: deployment.isAdmin,
          targetUserId: deployment.targetUserId,
          enabled: deployment.enabled,
        })
        .from(model)
        .innerJoin(deployment, eq(deployment.modelId, model.id))
        .where(
          and(
            eq(model.name, name),
            isNull(model.archivedAt),
            visibleDeployment,
          ),
        )
        .orderBy(desc(deployment.isAdmin), desc(deployment.createdAt))
        .limit(1);

  if (!hostedModel && !modelRow) notFound();

  const resolvedModel = hostedModel
    ? {
        id: hostedModel.modelId,
        name: hostedModel.displayName,
        parameterCount: null,
        createdAt: new Date(0),
        deploymentId: null,
        isGlobal: true,
        targetUserId: null,
        enabled: true,
      }
    : modelRow!;

  const apiExample = `curl "https://trainpiro.app/api/models/${encodeURIComponent(resolvedModel.id)}/invoke" \\
  -H "Authorization: Bearer $PIRO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "parts": [
      { "type": "text", "text": "What should you remember?" }
    ]
  }'`;

  const canDisablePrivateDeployment = Boolean(
    !hostedModel && !resolvedModel.isGlobal && resolvedModel.deploymentId,
  );
  const canManageGlobalDeployment = Boolean(
    adminSession &&
    !hostedModel &&
    resolvedModel.isGlobal &&
    resolvedModel.deploymentId &&
    resolvedModel.targetUserId === null,
  );

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
          <h1 className="min-w-0 flex-1 truncate text-2xl font-black tracking-tight text-amber-50 sm:text-3xl">
            {resolvedModel.name}
          </h1>
          {canDisablePrivateDeployment && (
            <form action={disablePrivateDeployment} className="shrink-0">
              <input
                type="hidden"
                name="deploymentId"
                value={resolvedModel.deploymentId ?? ""}
              />
              <button
                type="submit"
                className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/10"
              >
                Disable
              </button>
            </form>
          )}
          {canManageGlobalDeployment && (
            <GlobalDeploymentControls
              deploymentId={resolvedModel.deploymentId!}
              enabled={resolvedModel.enabled}
              disableAction={disableGlobalDeployment}
              deleteAction={deleteGlobalDeployment}
            />
          )}
        </div>

        <div className="mt-4">
          <ModelSandbox
            modelId={resolvedModel.id}
            more={{
              apiExample,
              isGlobal: resolvedModel.isGlobal,
              parameterCount:
                resolvedModel.parameterCount?.toLocaleString() ?? "—",
              deployedAt: resolvedModel.createdAt.toLocaleDateString(
                undefined,
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                },
              ),
              access: hostedModel ? "Shared" : "Private",
              showDeploymentStatus: Boolean(hostedModel),
            }}
          />
        </div>
      </div>
    </div>
  );
}
