import Link from "next/link";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import DocsShell from "~/components/DocsShell";
import { db } from "../../../../data/db";
import { deployment, model } from "../../../../data/schema";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Getting started — Piro Docs",
  description:
    "Invoke the latest shared Piro model, then deploy a private model when you are ready.",
};

const requestBody = `{
  "parts": [
    { "type": "text", "text": "Remember that I prefer concise answers." }
  ]
}`;

const responseBody = `{
  "output": {
    "parts": [
      { "type": "text", "text": "..." }
    ]
  }
}`;

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#0b0908] p-4 text-xs leading-relaxed text-amber-200/80 sm:p-5">
      <code>{children}</code>
    </pre>
  );
}

async function getLatestGlobalModel() {
  const [latestModel] = await db
    .select({ id: model.id, name: model.name })
    .from(deployment)
    .innerJoin(model, eq(deployment.modelId, model.id))
    .where(
      and(
        eq(deployment.isAdmin, true),
        eq(deployment.enabled, true),
        isNull(deployment.targetUserId),
        isNull(model.archivedAt),
        isNotNull(model.inferenceEndpoint),
        isNotNull(model.weightsR2Key),
      ),
    )
    .orderBy(desc(deployment.createdAt))
    .limit(1);

  return latestModel ?? null;
}

export default async function GettingStartedPage() {
  const latestGlobalModel = await getLatestGlobalModel();
  const globalModelId = latestGlobalModel?.id;
  const globalCurlExample = globalModelId
    ? `export PIRO_MODEL="${globalModelId}"
export PIRO_API_KEY="piro_..."

curl "https://trainpiro.app/api/models/$PIRO_MODEL/invoke" \\
  -H "Authorization: Bearer $PIRO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${requestBody}'`
    : "A shared model is not ready yet. Check back soon for a copy-paste request.";
  const privateCurlExample = `export PIRO_MODEL="your-private-model-id"
export PIRO_API_KEY="piro_..."

curl "https://trainpiro.app/api/models/$PIRO_MODEL/invoke" \\
  -H "Authorization: Bearer $PIRO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${requestBody}'`;

  return (
    <DocsShell
      active="/docs/getting-started"
      title="Invoke a model in minutes."
      description="Start with the latest shared model through the API. When you need an isolated deployment, deploy your own model and use the same inference contract."
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/12 via-[#17100b] to-[#100b08] p-6 shadow-[0_0_80px_rgba(249,115,22,0.08)] sm:p-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-300">
                1 · Use the latest global model
              </p>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-amber-50 sm:text-3xl">
                Make your first API request immediately.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-amber-200/65 sm:text-base">
                Create a Piro API key, set it in your environment, and invoke
                the newest shared model with a typed observation. No deployment
                is required for this first request.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                href="/profile#api-keys"
                className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-[#180d07] transition hover:bg-orange-400"
              >
                Create an API key
              </Link>
              {latestGlobalModel && (
                <Link
                  href={`/models/${encodeURIComponent(latestGlobalModel.id)}`}
                  className="rounded-xl border border-amber-700/40 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:border-amber-500/60 hover:bg-amber-500/5"
                >
                  View {latestGlobalModel.name}
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-amber-900/30 bg-[#0f0c09] p-6 sm:p-9">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">
              Shared model request
            </p>
            {latestGlobalModel ? (
              <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-200">
                {latestGlobalModel.name}
              </span>
            ) : (
              <span className="rounded-full border border-amber-700/30 bg-amber-900/20 px-2.5 py-1 text-[11px] font-semibold text-amber-300/70">
                No shared model is ready yet
              </span>
            )}
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-amber-200/60">
            {latestGlobalModel
              ? "This example is wired to the latest enabled global deployment at page render time. Run it from a server or terminal, and keep the API key private."
              : "No enabled shared model is currently ready for inference. Once one is published, this page will show its model ID automatically; the request shape remains the same."}
          </p>
          <div className="mt-6">
            <CodeBlock>{globalCurlExample}</CodeBlock>
          </div>
          <div className="mt-5 rounded-2xl border border-orange-500/25 bg-orange-500/8 px-4 py-3 text-sm leading-relaxed text-orange-100/75">
            <strong className="font-bold text-orange-200">
              Shared model safety boundary.
            </strong>{" "}
            Global models are for exploration and testing. Do not use them as a
            production or privacy boundary, and do not send sensitive data.
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/65">
              Request body
            </p>
            <h2 className="mt-3 text-xl font-bold text-amber-50">
              Send a typed observation
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-300/55">
              Text input uses one part with{" "}
              <code className="text-amber-100">type: "text"</code>. The body
              must contain at least one non-empty part.
            </p>
            <div className="mt-5">
              <CodeBlock>{requestBody}</CodeBlock>
            </div>
          </div>
          <div className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/65">
              Response
            </p>
            <h2 className="mt-3 text-xl font-bold text-amber-50">
              Read the model output
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-300/55">
              The response uses the same packet shape under the{" "}
              <code className="text-amber-100">output</code> property.
            </p>
            <div className="mt-5">
              <CodeBlock>{responseBody}</CodeBlock>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">
            2 · Deploy your own model
          </p>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-amber-50 sm:text-3xl">
            Move to a private inference endpoint when you need one.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-amber-200/65 sm:text-base">
            Private deployments use the same API shape as the global model, but
            give you a dedicated model target for your application.
          </p>
          <ol className="mt-7 grid gap-4 md:grid-cols-2">
            {[
              [
                "1",
                "Open Models",
                "Choose Deploy Your Model and select a pretrained model.",
              ],
              [
                "2",
                "Create the deployment",
                "Submit the deployment and wait for Stateful inference ready.",
              ],
              [
                "3",
                "Create an API key",
                "Use Profile → API Keys. Store the raw key in an environment variable.",
              ],
              [
                "4",
                "Invoke private inference",
                "Replace the model ID in the request below with your private deployment ID.",
              ],
            ].map(([number, title, detail]) => (
              <li
                key={number}
                className="flex gap-4 rounded-2xl border border-amber-900/25 bg-amber-950/15 p-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-400/40 bg-orange-500/10 font-mono text-sm font-bold text-orange-300">
                  {number}
                </span>
                <div>
                  <h3 className="font-semibold text-amber-50">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-amber-300/55">
                    {detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-7">
            <CodeBlock>{privateCurlExample}</CodeBlock>
          </div>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link
              href="/models"
              className="rounded-xl bg-orange-500 px-4 py-3 font-bold text-[#180d07] transition hover:bg-orange-400"
            >
              Open Models
            </Link>
            <Link
              href="/docs/api"
              className="rounded-xl border border-amber-700/40 px-4 py-3 font-semibold text-amber-100 transition hover:border-amber-500/60 hover:bg-amber-500/5"
            >
              Read the API reference
            </Link>
          </div>
        </section>
      </div>
    </DocsShell>
  );
}
