import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import FlameLogo from "~/components/FlameLogo";
import TabNav from "./TabNav";

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

  return (
    <div className="min-h-screen bg-[#0d0a08]">
      <nav className="border-b border-amber-900/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlameLogo size={28} />
          <span className="font-bold text-amber-50 tracking-tight">Piro</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500/40" />
            <span className="text-xs text-amber-400/40 hidden sm:block">
              No model trained
            </span>
          </div>
          <span className="text-xs text-amber-400/30 hidden sm:block">
            {session.user.name?.split(" ")[0]}
          </span>
          <form action="/api/auth/sign-out" method="POST">
            <button className="text-sm text-amber-400/60 hover:text-amber-200 transition">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <TabNav />
      <main>{children}</main>
    </div>
  );
}
