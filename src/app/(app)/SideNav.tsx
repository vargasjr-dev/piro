"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FlameLogo from "~/components/FlameLogo";

const NAV_ITEMS = [
  {
    label: "Repos",
    href: "/repos",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7.5L12 3l9 4.5M3 7.5L12 12m-9-4.5v9L12 21m0-9l9-4.5m-9 4.5v9m9-13.5v9L12 21" />
      </svg>
    ),
  },
  {
    label: "Profile",
    href: "/profile",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function SideNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-[#0d0a08]/95 backdrop-blur">
      <div className="flex items-center gap-6 px-4 lg:px-6 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition shrink-0">
          <FlameLogo size={22} />
          <span className="font-bold text-amber-50 tracking-tight hidden sm:inline">Piro</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    isActive
                      ? "bg-orange-500/15 text-amber-100"
                      : "text-amber-400/50 hover:text-amber-300 hover:bg-amber-900/20"
                  }
                `}
              >
                <span className={isActive ? "text-orange-400" : ""}>
                  {item.icon}
                </span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
