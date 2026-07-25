import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, eq, gt } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../data/db";
import { deployment, inferenceNode } from "../../../../../data/schema";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";

const ONLINE_WINDOW_MS = 90_000;

export default async function AdminNodesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
  const nodes = await db
    .select({
      id: inferenceNode.id,
      name: inferenceNode.name,
      gpuType: inferenceNode.gpuType,
      lastHeartbeatAt: inferenceNode.lastHeartbeatAt,
      deploymentCount: count(deployment.id),
    })
    .from(inferenceNode)
    .leftJoin(
      deployment,
      and(
        eq(deployment.nodeId, inferenceNode.id),
        eq(deployment.enabled, true),
      ),
    )
    .where(
      and(
        eq(inferenceNode.gpuType, "H100"),
        gt(inferenceNode.lastHeartbeatAt, onlineSince),
      ),
    )
    .groupBy(
      inferenceNode.id,
      inferenceNode.name,
      inferenceNode.gpuType,
      inferenceNode.lastHeartbeatAt,
    );

  const assignedDeployments = nodes.reduce(
    (total, node) => total + Number(node.deploymentCount),
    0,
  );

  return (
    <AdminShell current="Nodes">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
          Nodes
        </h1>
        <p className="mt-3 text-sm text-amber-200/55">
          H100 capacity and deployment assignments.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5">
          <p className="text-xs uppercase tracking-[0.14em] text-amber-500/50">
            Online H100 nodes
          </p>
          <p className="mt-3 text-4xl font-black text-amber-50">
            {nodes.length}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5">
          <p className="text-xs uppercase tracking-[0.14em] text-amber-500/50">
            Assigned deployments
          </p>
          <p className="mt-3 text-4xl font-black text-amber-50">
            {assignedDeployments}
          </p>
        </div>
      </div>
      {nodes.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-amber-900/25 bg-amber-900/5 px-5 py-12 text-center">
          <p className="text-sm font-semibold text-amber-200/60">
            No H100 nodes connected
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-amber-600/45">
            Nodes appear here after the runtime control plane registers a node
            heartbeat.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {nodes.map((node) => (
            <article
              key={node.id}
              className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-amber-50">
                    {node.name}
                  </h2>
                  <p className="mt-1 text-xs text-amber-300/50">
                    {node.gpuType} · Last heartbeat{" "}
                    {node.lastHeartbeatAt?.toLocaleTimeString() ?? "unknown"}
                  </p>
                </div>
                <span className="text-sm font-semibold text-amber-200">
                  {Number(node.deploymentCount)} deployments
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
