import Link from "next/link";
import { cookies } from "next/headers";
import PublicNavbar from "~/components/PublicNavbar";

export const DOCS_TABS = [
  { href: "/docs", label: "Overview", exact: true },
  { href: "/docs/getting-started", label: "Getting started" },
  { href: "/docs/api", label: "API" },
  { href: "/docs/architecture", label: "Architecture" },
] as const;

export async function getPublicSessionState() {
  const cookieStore = await cookies();
  return (
    cookieStore.has("better-auth.session_token") ||
    cookieStore.has("__Secure-better-auth.session_token")
  );
}

type DocsShellProps = {
  active?: (typeof DOCS_TABS)[number]["href"];
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export default async function DocsShell({
  active,
  eyebrow,
  title,
  description,
  children,
}: DocsShellProps) {
  const isLoggedIn = await getPublicSessionState();

  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      <PublicNavbar isLoggedIn={isLoggedIn} active="docs" />

      <div className="border-b border-amber-900/20 bg-[#100b08]/80">
        <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            {eyebrow && (
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-400">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-amber-50 sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-amber-200/60 sm:text-lg">
              {description}
            </p>
          </div>

          <nav className="mt-8 flex gap-1 overflow-x-auto" aria-label="Documentation sections">
            {DOCS_TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  active === tab.href
                    ? "border-orange-300 text-amber-50"
                    : "border-transparent text-amber-400/50 hover:text-amber-100"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}
