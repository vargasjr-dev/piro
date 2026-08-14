import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { r2ListObjects } from "~/lib/r2";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";

const DIAGNOSTICS_PREFIX = "diagnostics/gemma/";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function GemmaDiagnosticsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  const diagnostics = (await r2ListObjects(DIAGNOSTICS_PREFIX))
    .sort(
      (a, b) =>
        (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0),
    )
    .slice(0, 100);

  return (
    <AdminShell current="Gemma Diagnostics">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
          Gemma diagnostics
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-amber-200/55">
          Automatic redacted failure bundles captured by the hosted Gemma
          runtime. Prompt text is not stored.
        </p>
      </div>

      {diagnostics.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-900/25 bg-amber-900/5 px-5 py-12 text-center text-sm text-amber-200/55">
          No Gemma failure bundles captured.
        </div>
      ) : (
        <div className="space-y-3">
          {diagnostics.map((diagnostic) => {
            const filename = diagnostic.key.split("/").at(-1) ?? diagnostic.key;
            return (
              <article
                key={diagnostic.key}
                className="flex flex-col gap-3 rounded-2xl border border-amber-900/25 bg-[#13100c] p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-amber-50">
                    {filename}
                  </h2>
                  <p className="mt-1 text-xs text-amber-300/50">
                    {diagnostic.lastModified?.toISOString() ?? "Unknown time"} ·{" "}
                    {formatBytes(diagnostic.size)}
                  </p>
                </div>
                <Link
                  href={`/api/admin/gemma-diagnostics/${diagnostic.key
                    .split("/")
                    .map((part) => encodeURIComponent(part))
                    .join("/")}`}
                  className="shrink-0 rounded-lg border border-amber-700/35 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:border-orange-300/60 hover:text-amber-50"
                >
                  Download bundle
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
