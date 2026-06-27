import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { getSubscription, isActive } from "~/lib/billing";
import SideNav from "./SideNav";

// Pages accessible to logged-in users without an active subscription.
const FREE_PATHS = ["/upgrade", "/dashboard"];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) {
    const nextUrl = headersList.get("next-url") ?? "";
    const callbackUrl = nextUrl
      ? `?callbackUrl=${encodeURIComponent(nextUrl)}`
      : "";
    redirect(`/login${callbackUrl}`);
  }

  const sub = await getSubscription(session.user.id);
  const pathname = headersList.get("x-pathname") ?? "";

  const isFree = FREE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isActive(sub) && !isFree) {
    redirect("/upgrade");
  }

  return (
    <div className="min-h-screen bg-[#0d0a08] lg:flex">
      <SideNav userName={session.user.name} isSubscribed={isActive(sub)} />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
    </div>
  );
}
