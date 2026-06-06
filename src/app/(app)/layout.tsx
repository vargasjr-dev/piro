import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth.server";
import SideNav from "./SideNav";

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
    <div className="min-h-screen bg-[#0d0a08] lg:flex">
      <SideNav userName={session.user.name} />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
    </div>
  );
}
