"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FlameLogo from "~/components/FlameLogo";

interface Props {
  userName?: string | null;
}

const NAV_ITEMS = [
  {
    label: "Benchmarks",
    shortLabel: "Benchmarks",
    href: "/benchmarks",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    label: "Classes",
    shortLabel: "Classes",
    href: "/classes",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    label: "Training Sessions",
    shortLabel: "Training",
    href: "/training",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    label: "Models",
    shortLabel: "Models",
    href: "/models",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
      </svg>
    ),
  },
  {
    label: "Sources",
    shortLabel: "Sources",
    href: "/sources",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12" />
        <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
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

        </div>

      {/* Mobile bottom nav bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-[#0d0a08] border-t border-amber-900/20 flex z-50 pb-safe">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors
                ${isActive ? "text-orange-400" : "text-amber-400/40 hover:text-amber-300"}
              `}
            >
              <span className="w-5 h-5 flex items-center justify-center">
                {item.icon}
              </span>
              {item.shortLabel}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
