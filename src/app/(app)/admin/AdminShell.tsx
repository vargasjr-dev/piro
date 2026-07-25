import Link from "next/link";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/models", label: "Models" },
  { href: "/admin/deployments", label: "Deployments" },
  { href: "/admin/nodes", label: "Nodes" },
  { href: "/admin/users", label: "Users" },
];

export function AdminShell({
  current,
  children,
}: {
  current: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-8 flex flex-wrap gap-2 border-b border-amber-900/20 pb-3">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                current === tab.label
                  ? "bg-orange-500/15 text-orange-300"
                  : "text-amber-400/55 hover:bg-amber-900/20 hover:text-amber-200"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
