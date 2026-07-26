import Link from "next/link";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/models", label: "Models" },
  { href: "/admin/deployments", label: "Deployments" },
  { href: "/admin/nodes", label: "Nodes" },
  { href: "/admin/users", label: "Users" },
] as const;

function AdminNavigation({ current }: { current: string }) {
  return (
    <nav aria-label="Admin sections" className="space-y-1">
      {tabs.map((tab) => {
        const isActive = tab.label === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`block rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-orange-300 bg-orange-500/10 text-amber-50"
                : "border-transparent text-amber-300/60 hover:border-amber-700/70 hover:bg-amber-950/30 hover:text-amber-100"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  current,
  children,
}: {
  current: string;
  children: React.ReactNode;
}) {
  const activeTab = tabs.find((tab) => tab.label === current);

  return (
    <div className="min-h-screen px-4 py-8 text-amber-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24 py-2 pr-2">
            <p className="mb-3 px-3 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-amber-400/45">
              Administration
            </p>
            <AdminNavigation current={current} />
          </div>
        </aside>

        <div className="min-w-0">
          <details className="border-b border-amber-900/20 py-4 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-amber-50 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-[0.68rem] font-bold uppercase tracking-[0.2em] text-amber-400/45">
                  Administration
                </span>
                <span className="mt-1 block">
                  {activeTab?.label ?? "Sections"}
                </span>
              </span>
              <span aria-hidden="true" className="text-lg text-orange-300">
                +
              </span>
            </summary>
            <div className="pt-5 pb-2">
              <AdminNavigation current={current} />
            </div>
          </details>
          {children}
        </div>
      </div>
    </div>
  );
}
