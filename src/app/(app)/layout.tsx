import { redirect } from "next/navigation";
import {
  getRequestHeaders,
  getRequestSession,
  getRequestSubscription,
} from "~/lib/request-context";
import { isActive } from "~/lib/billing";
import { isAdmin } from "~/lib/admin";
import AppHeader from "./AppHeader";

// Pages accessible to logged-in users without an active subscription.
const FREE_PATHS = ["/upgrade", "/dashboard", "/models", "/profile"];

// Admin paths (e.g. /admin/stripe) are accessible to admins regardless of
// subscription status — admins need to bootstrap Stripe before any subs exist.
const ADMIN_PATH_PREFIX = "/admin";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await getRequestHeaders();
  const session = await getRequestSession();

  if (!session) {
    const nextUrl = headersList.get("next-url") ?? "";
    const callbackUrl = nextUrl
      ? `?callbackUrl=${encodeURIComponent(nextUrl)}`
      : "";
    redirect(`/login${callbackUrl}`);
  }

  const pathname = headersList.get("x-pathname") ?? "";
  const isFree = FREE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isAdminPath = pathname.startsWith(ADMIN_PATH_PREFIX);
  const sub = isFree || isAdminPath ? null : await getRequestSubscription();

  // Admins bypass the subscription gate entirely — they can use all app
  // features without paying, and they need to bootstrap Stripe before any
  // subscriptions exist.
  if (!isActive(sub) && !isFree && !isAdminPath && !isAdmin(session)) {
    redirect("/upgrade");
  }

  return (
    <div className="min-h-screen bg-[#0d0a08]">
      <AppHeader isAdmin={isAdmin(session)} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
