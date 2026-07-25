import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";

type PublicNavbarProps = {
  isLoggedIn: boolean;
  active?: "docs" | "pricing";
};

export default function PublicNavbar({ isLoggedIn, active }: PublicNavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-[#0d0a08]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-lg font-black tracking-tight text-amber-50 transition-opacity hover:opacity-80"
        >
          <FlameLogo size={28} />
          Piro
        </Link>

        <nav className="flex items-center gap-1 text-sm text-amber-300/70" aria-label="Primary navigation">
          <Link
            href="/docs"
            className={`rounded-lg px-3 py-2 transition-colors hover:text-amber-100 ${
              active === "docs" ? "bg-orange-500/10 text-amber-100" : ""
            }`}
          >
            Docs
          </Link>
          <Link
            href="/pricing"
            className={`rounded-lg px-3 py-2 transition-colors hover:text-amber-100 ${
              active === "pricing" ? "bg-orange-500/10 text-amber-100" : ""
            }`}
          >
            Pricing
          </Link>
          {isLoggedIn ? (
            <Link
              href="/models"
              className="ml-2 rounded-full border border-amber-700/50 px-4 py-2 text-amber-100 transition-colors hover:border-orange-400/70 hover:bg-orange-500/10"
            >
              Open Piro →
            </Link>
          ) : (
            <Link
              href="/login"
              className="ml-2 rounded-full border border-amber-700/50 px-4 py-2 text-amber-100 transition-colors hover:border-orange-400/70 hover:bg-orange-500/10"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
