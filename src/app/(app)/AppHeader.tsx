"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FlameLogo from "~/components/FlameLogo";

interface Props {
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
    <div className="flex items-center gap-1 shrink-0">
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

export default function AppHeader({ repoTitle }: Props) {
  const pathname = usePathname();

  return (
    <header className="border-b border-amber-900/20 px-4 sm:px-6 py-3.5 flex items-center gap-3">
      <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition shrink-0">
        <FlameLogo size={22} />
        <span className="font-bold text-amber-50 tracking-tight">Piro</span>
      </Link>
      {repoTitle && (
        <span className="text-sm font-semibold text-amber-100 truncate min-w-0">
          {repoTitle}
        </span>
      )}
      <div className="ml-auto">
        <TopRightLinks pathname={pathname} />
      </div>
    </header>
  );
}
