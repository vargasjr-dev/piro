"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FlameLogo from "~/components/FlameLogo";

interface Props {
  userName?: string | null;
}

const NAV_ITEMS = [
  {
    label: "Knowledge Base",
    href: "/knowledge",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </svg>
    ),
  },
  {
    label: "Training Sessions",
    href: "/training",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    label: "Students",
    href: "/students",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
  },
  {
    label: "Mentors",
    href: "/mentors",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
];

export default function SideNav({ userName }: Props) {
  const pathname = usePathname();

  return (
    <>
      {/* ── DESKTOP SIDEBAR ──────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-amber-900/20 min-h-screen sticky top-0 self-start">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-amber-900/10">
          <FlameLogo size={22} />
          <span className="font-bold text-amber-50 tracking-tight">Piro</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
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
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom — model status + user + sign out */}
        <div className="px-5 py-4 border-t border-amber-900/10 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500/40" />
            <span className="text-xs text-amber-400/40">No model trained</span>
          </div>
          {userName && (
            <p className="text-xs text-amber-400/30 truncate">{userName}</p>
          )}
          <form action="/api/auth/sign-out" method="POST">
            <button className="text-xs text-amber-400/50 hover:text-amber-200 transition">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ── MOBILE HEADER + TABS ─────────────────────────────────── */}
      <div className="lg:hidden">
        {/* Mobile top bar */}
        <header className="border-b border-amber-900/20 px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlameLogo size={22} />
            <span className="font-bold text-amber-50 tracking-tight">Piro</span>
          </div>
          <form action="/api/auth/sign-out" method="POST">
            <button className="text-sm text-amber-400/60 hover:text-amber-200 transition">
              Sign out
            </button>
          </form>
        </header>

        {/* Mobile horizontal tab strip */}
        <div className="border-b border-amber-900/20 overflow-x-auto">
          <div className="flex px-2 min-w-max">
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap
                    ${
                      isActive
                        ? "border-orange-500 text-amber-100"
                        : "border-transparent text-amber-400/50 hover:text-amber-300"
                    }
                  `}
                >
                  <span className={isActive ? "text-orange-400" : ""}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
