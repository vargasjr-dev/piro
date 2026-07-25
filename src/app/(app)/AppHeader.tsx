"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FlameLogo from "~/components/FlameLogo";

const MODELS_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3.25" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    <path d="M19.5 2.5v3M18 4h3" />
  </svg>
);

const ADMIN_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m12 3 7 3v5c0 4.5-2.8 7.7-7 10-4.2-2.3-7-5.5-7-10V6l7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const PROFILE_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

function TopRightLinks({
  pathname,
  isAdmin,
}: {
  pathname: string;
  isAdmin: boolean;
}) {
  const modelsActive =
    pathname === "/models" || pathname.startsWith("/models/");
  const adminActive = pathname === "/admin" || pathname.startsWith("/admin/");
  const profileActive =
    pathname === "/profile" || pathname.startsWith("/profile/");

  return (
    <div className="flex items-center gap-1 shrink-0">
      <Link
        href="/models"
        aria-label="Models"
        className={`p-2 rounded-lg transition-colors ${
          modelsActive
            ? "bg-orange-500/15 text-orange-400"
            : "text-amber-400/50 hover:text-amber-200 hover:bg-amber-900/20"
        }`}
      >
        {MODELS_ICON}
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
      {isAdmin && (
        <Link
          href="/admin"
          aria-label="Admin"
          className={`p-2 rounded-lg transition-colors ${
            adminActive
              ? "bg-orange-500/15 text-orange-400"
              : "text-amber-400/50 hover:text-amber-200 hover:bg-amber-900/20"
          }`}
        >
          {ADMIN_ICON}
        </Link>
      )}
    </div>
  );
}

export default function AppHeader({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-amber-900/20 px-4 sm:px-6 py-3.5 flex items-center gap-3">
      <Link
        href="/"
        className="flex items-center gap-2.5 hover:opacity-80 transition shrink-0"
      >
        <FlameLogo size={22} />
        <span className="font-bold text-amber-50 tracking-tight">Piro</span>
      </Link>
      <div className="ml-auto">
        <TopRightLinks pathname={pathname} isAdmin={isAdmin} />
      </div>
    </header>
  );
}
