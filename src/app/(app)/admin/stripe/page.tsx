import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import AdminStripePanel from "./AdminStripePanel";

export const dynamic = "force-dynamic";

export default async function AdminStripePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  return (
    <div className="px-6 py-10 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-amber-50">Stripe Configuration</h1>
        <p className="text-sm text-amber-400/60 mt-1">
          Verify and bootstrap Piro Pro in both live and test Stripe environments.
        </p>
      </div>

      <AdminStripePanel />
    </div>
  );
}