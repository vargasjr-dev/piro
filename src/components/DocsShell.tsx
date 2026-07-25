import Link from "next/link";
import { cookies } from "next/headers";
import PublicNavbar from "~/components/PublicNavbar";

export const DOCS_NAV = [
  {
    label: "Start here",
    items: [
      { href: "/docs", label: "Overview", exact: true },
      { href: "/docs/getting-started", label: "Getting started" },
    ],
  },
  {
    label: "Build with Piro",
    items: [{ href: "/docs/api", label: "API" }],
  },
  {
    label: "Understand Piro",
    items: [{ href: "/docs/architecture", label: "Architecture" }],
  },
] as const;

type DocsNavItem = (typeof DOCS_NAV)[number]["items"][number];
type DocsHref = DocsNavItem["href"];

export async function getPublicSessionState() {
  const cookieStore = await cookies();
  return (
    cookieStore.has("better-auth.session_token") ||
    cookieStore.has("__Secure-better-auth.session_token")
  );
}

type DocsShellProps = {
  active?: DocsHref;
  title: string;
  description?: string;
  compact?: boolean;
  children: React.ReactNode;
};

function DocsNavigation({
  active,
  mobile = false,
}: {
  active?: DocsHref;
  mobile?: boolean;
}) {
  return (
    <nav
      aria-label="Documentation sections"
      className={mobile ? "space-y-5" : "space-y-7"}
    >
      {DOCS_NAV.map((section) => (
        <div key={section.label}>
          <p className="mb-2 px-3 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-amber-400/45">
            {section.label}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => {
              const isActive = active === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`block rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-orange-300 bg-orange-500/10 text-amber-50"
                      : "border-transparent text-amber-300/60 hover:border-amber-700/70 hover:bg-amber-950/30 hover:text-amber-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default async function DocsShell({
  active,
  title,
  description,
  compact = false,
  children,
}: DocsShellProps) {
  const isLoggedIn = await getPublicSessionState();
  const activeItem = DOCS_NAV.reduce<DocsNavItem | undefined>(
    (found, section) => {
      if (found) return found;
      return section.items.find((item) => item.href === active);
    },
    undefined,
  );

  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      <PublicNavbar isLoggedIn={isLoggedIn} active="docs" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto py-10 pr-2">
              <DocsNavigation active={active} />
            </div>
          </aside>

          <div className="min-w-0">
            <details className="border-b border-amber-900/20 py-4 lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-amber-50 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-[0.68rem] font-bold uppercase tracking-[0.2em] text-amber-400/45">
                    Documentation
                  </span>
                  <span className="mt-1 block">
                    {activeItem?.label ?? "Sections"}
                  </span>
                </span>
                <span aria-hidden="true" className="text-lg text-orange-300">
                  +
                </span>
              </summary>
              <div className="pt-5 pb-2">
                <DocsNavigation active={active} mobile />
              </div>
            </details>

            <header
              className={`${compact ? "py-6 lg:py-7" : "border-b border-amber-900/20 py-10 lg:py-14"}`}
            >
              <div className="max-w-4xl">
                <h1 className="text-4xl font-black tracking-[-0.04em] text-amber-50 sm:text-5xl">
                  {title}
                </h1>
                {description && (
                  <p className="mt-4 max-w-3xl text-base leading-relaxed text-amber-200/60 sm:text-lg">
                    {description}
                  </p>
                )}
              </div>
            </header>

            <div className={compact ? "pb-8 lg:pb-10" : "py-10 lg:py-12"}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
