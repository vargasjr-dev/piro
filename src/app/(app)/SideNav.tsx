"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FlameLogo from "~/components/FlameLogo";

interface Props {
  userName?: string | null;
  isSubscribed?: boolean;
  repoTitle?: string | null;
}

const REPOS_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7.5L12 3l9 4.5M3 7.5L12 12m-9-4.5v9L12 21m0-9l9-4.5m-9 4.5v9m9-13.5v9L12 21" />
  </svg>
);

const PROFILE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

function TopRightLinks({ pathname }: { pathname: string }) {
  const reposActive = pathname === "/repos" || pathname.startsWith("/repos/");
  const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/repos"
        aria-label="Repositories"
        className={`p-2 rounded-lg transition-colors ${
          reposActive
            ? "bg-orange-500/15 text-orange-400"
            : "text-amber-400/50 hover:text-amber-200 hover:bg-amber-900/20"
        }`}
      >
        {REPOS_ICON}
      </Link>
      <Link
        href="/profile"
        aria-label="Profile"
        className={`p-2 rounded-lg transition-colors ${
          profileActive
            ? "bg-orange-500/15 text-orange-400"
            : "text-amber-400/50 hover:text-amber-200 hover:bg-amber-900/20"
        }`}
      >
        {PROFILE_ICON}
      </Link>
    </div>
  );
}

export default function SideNav({ userName, isSubscribed, repoTitle }: Props) {
  const pathname = usePathname();

  return (
    <>
      {/* ── DESKTOP SIDEBAR ──────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-amber-900/20 min-h-screen sticky top-0 self-start">
        {/* Logo + repo title + top-right icons */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-amber-900/10">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition shrink-0">
            <FlameLogo size={22} />
            <span className="font-bold text-amber-50 tracking-tight">Piro</span>
          </Link>
          {repoTitle && (
            <span className="text-xs font-semibold text-amber-100 truncate mx-2 min-w-0">
              {repoTitle}
            </span>
          )}
          <TopRightLinks pathname={pathname} />
        </div>

        {/* Public documentation */}
        <nav className="flex-1 px-3 py-4">
          <Link
            href="/docs"
            className="block px-3 py-1.5 rounded-lg text-sm font-medium text-amber-400/50 hover:text-amber-300 hover:bg-amber-900/20 transition-colors"
          >
            Docs
          </Link>
        </nav>

        {/* Bottom — model status + user */}
        <div className="px-5 py-4 border-t border-amber-900/10 space-y-2.5">
          <div className="flex items-center gap-2">
            {isSubscribed ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                <span className="text-xs text-orange-400/80 font-medium">Pro</span>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-amber-900/60" />
                <span className="text-xs text-amber-400/40">Free</span>
              </>
            )}
          </div>
          {userName && (
            <Link href="/profile" className="text-xs text-amber-400/30 truncate hover:text-amber-200 transition block">
              {userName}
            </Link>
          )}
        </div>
      </aside>

      {/* ── MOBILE HEADER ────────────────────────────────────────── */}
      <div className="lg:hidden">
        <header className="border-b border-amber-900/20 px-4 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition shrink-0">
            <FlameLogo size={22} />
            <span className="font-bold text-amber-50 tracking-tight">Piro</span>
          </Link>
          {repoTitle && (
            <span className="text-sm font-semibold text-amber-100 truncate mx-2 min-w-0 text-center">
              {repoTitle}
            </span>
          )}
          <TopRightLinks pathname={pathname} />
        </header>
      </div>
    </>
  );
}
