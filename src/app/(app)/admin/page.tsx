import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin";
import { AdminShell } from "./AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/models");

  return (
    <AdminShell current="Overview">
      <h1 className="text-3xl font-black tracking-tight text-amber-50 sm:text-4xl">
        Admin
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-amber-200/55">
        Piro administration.
      </p>
    </AdminShell>
  );
}
