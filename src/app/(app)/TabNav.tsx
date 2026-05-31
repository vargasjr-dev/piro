"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Knowledge Base", href: "/knowledge" },
  { label: "Training Sessions", href: "/training" },
  { label: "Learning Moments", href: "/moments" },
  { label: "Capability Ledger", href: "/ledger" },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-amber-900/20">
      <div className="flex px-6 max-w-5xl mx-auto overflow-x-auto">
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                shrink-0 px-4 py-3.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${
                  isActive
                    ? "border-orange-500 text-amber-100"
                    : "border-transparent text-amber-400/50 hover:text-amber-300 hover:border-amber-700/40"
                }
              `}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
