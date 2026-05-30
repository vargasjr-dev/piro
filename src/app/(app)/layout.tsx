import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import FlameLogo from "~/components/FlameLogo";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) {
    const nextUrl = headersList.get("next-url") ?? "";
    const callbackUrl = nextUrl ? `?callbackUrl=${encodeURIComponent(nextUrl)}` : "";
    redirect(`/login${callbackUrl}`);
  }

  return (
    <div className="min-h-screen bg-[#0d0a08]">
      <nav className="border-b border-amber-900/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlameLogo size={32} />
          <span className="font-bold text-amber-50 tracking-tight">Piro</span>
        </div>
        <form action="/api/auth/sign-out" method="POST">
          <button className="text-sm text-amber-400/60 hover:text-amber-200 transition">
            Sign out
          </button>
        </form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
