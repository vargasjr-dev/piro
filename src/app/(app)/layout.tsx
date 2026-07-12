import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import { getSubscription, isActive } from "~/lib/billing";
import { isAdmin } from "~/lib/admin";
import { eq, and } from "drizzle-orm";
import { db } from "../../../data/db";
import { repository, user } from "../../../data/schema";
import AppHeader from "./AppHeader";

// Pages accessible to logged-in users without an active subscription.
const FREE_PATHS = ["/upgrade", "/dashboard", "/profile"];

// Admin paths (e.g. /admin/stripe) are accessible to admins regardless of
// subscription status — admins need to bootstrap Stripe before any subs exist.
const ADMIN_PATH_PREFIX = "/admin";

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
  const isAdminPath = pathname.startsWith(ADMIN_PATH_PREFIX);

  // Admins bypass the subscription gate entirely — they can use all app
  // features without paying, and they need access to bootstrap billing.
  if (!isActive(sub) && !isFree && !isAdminPath && !isAdmin(session)) {
    redirect("/upgrade");
  }

  // If we're inside a repo page, fetch the repo title for the nav bar.
  // Pathname looks like /repos/[username]/[slug](...).
  let repoTitle: string | null = null;
  const repoMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)/);
  if (repoMatch) {
    const [, ownerHandle, slug] = repoMatch;
    const [owner] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, ownerHandle))
      .limit(1);
    if (owner) {
      const [repo] = await db
        .select({ name: repository.name })
        .from(repository)
        .where(and(eq(repository.userId, owner.id), eq(repository.slug, slug)))
        .limit(1);
      if (repo) repoTitle = repo.name;
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0a08]">
      <AppHeader repoTitle={repoTitle} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
