import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { getSubscription, isActive } from "~/lib/billing";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const sub = await getSubscription(session.user.id);
  if (isActive(sub)) {
    redirect("/benchmarks");
  }

  // Free user — hand off to the upgrade page
  redirect("/upgrade");
}
