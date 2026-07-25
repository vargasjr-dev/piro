import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq, isNull } from "drizzle-orm";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { db } from "../../../../../data/db";
import { model, user } from "../../../../../data/schema";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminModelsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const models = await db
    .select({
      id: model.id,
      name: model.name,
      description: model.description,
      parameterCount: model.parameterCount,
      inferenceEndpoint: model.inferenceEndpoint,
      weightsR2Key: model.weightsR2Key,
      archivedAt: model.archivedAt,
      createdAt: model.createdAt,
      ownerName: user.name,
      ownerEmail: user.email,
    })
    .from(model)
    .innerJoin(user, eq(model.userId, user.id))
    .where(isNull(model.archivedAt))
    .orderBy(desc(model.createdAt));

  return (
    <AdminShell current="Models">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
          Models
        </h1>
        <p className="mt-3 text-sm text-amber-200/55">
          Models registered in Piro.
        </p>
      </div>
      {models.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-900/25 bg-amber-900/5 px-5 py-12 text-center text-sm text-amber-200/55">
          No models yet.
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-amber-900/25 bg-[#13100c] p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-amber-50">
                    {item.name}
                  </h2>
                  <p className="mt-1 text-xs text-amber-300/50">
                    {item.description || "No description."}
                  </p>
                </div>
                <span className="text-xs text-amber-500/50">
                  {item.parameterCount?.toLocaleString() ?? "—"} parameters
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-amber-500/50">
                <span>
                  Owner: {item.ownerName} ({item.ownerEmail})
                </span>
                <span>
                  {item.inferenceEndpoint
                    ? "Inference configured"
                    : "No inference endpoint"}
                </span>
                <span>{item.createdAt.toLocaleDateString()}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
