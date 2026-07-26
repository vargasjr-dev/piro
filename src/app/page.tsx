import Link from "next/link";
import { cookies } from "next/headers";
import PublicNavbar from "~/components/PublicNavbar";
import { getCurrentPiroArchitecture } from "~/lib/latest-architecture";

export default async function HomePage() {
  const cookieStore = await cookies();
  const isLoggedIn =
    cookieStore.has("better-auth.session_token") ||
    cookieStore.has("__Secure-better-auth.session_token");
  const latestModel = getCurrentPiroArchitecture();
  const primaryHref = isLoggedIn ? "/models" : "/signup";
  const primaryLabel = isLoggedIn ? "Open your model →" : "Deploy your model →";

  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      <PublicNavbar isLoggedIn={isLoggedIn} />

      <section className="relative overflow-hidden px-4 pb-24 pt-20 sm:px-6 sm:pb-32 sm:pt-28">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-orange-600/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="mx-auto max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.045em] text-amber-50 sm:text-7xl lg:text-8xl">
            Your model should
            <span className="block bg-gradient-to-r from-orange-300 via-amber-200 to-red-500 bg-clip-text text-transparent ember-text-glow">
              remember you.
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-amber-200/70 sm:text-xl">
            Piro is a model with persistent state. Deploy your own instance and
            let it carry context forward instead of starting from zero every
            time.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href={primaryHref}
              className="ember-glow rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-8 py-4 text-base font-bold text-white transition-all hover:from-orange-400 hover:to-red-500"
            >
              {primaryLabel}
            </Link>
            <Link
              href="#how-it-works"
              className="rounded-xl border border-amber-800/50 px-8 py-4 text-base font-semibold text-amber-200 transition-colors hover:border-amber-500/70 hover:bg-amber-500/5"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-t border-amber-900/20 bg-[#0a0806] px-4 py-24 sm:px-6 sm:py-32"
      >
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-orange-400">
              Built for continuity
            </p>
            <h2 className="text-3xl font-bold leading-tight text-amber-50 sm:text-5xl">
              Intelligence that keeps its place.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-amber-200/65">
              Piro is designed around an ongoing working state, not a series of
              disposable chats.
            </p>
          </div>

          <div className="mt-14 grid gap-8 border-t border-amber-900/30 pt-8 md:grid-cols-3 md:gap-10">
            {[
              [
                "Start with context",
                "Your deployment begins with the state it has already accumulated.",
              ],
              [
                "Keep learning",
                "Its state can be updated as it works, so useful context carries forward.",
              ],
              [
                "Make it yours",
                "A dedicated, addressable model gives that continuity somewhere to live.",
              ],
            ].map(([title, body], index) => (
              <article key={title}>
                <p className="text-sm font-bold text-orange-400">
                  0{index + 1}
                </p>
                <h3 className="mt-4 text-xl font-bold text-amber-50">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-amber-300/60">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-amber-900/20 px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 max-w-2xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-orange-400">
              One model, one price
            </p>
            <h2 className="text-3xl font-bold text-amber-50 sm:text-5xl">
              A place for your intelligence to grow.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-amber-200/65">
              Get a dedicated Piro deployment with persistent state and
              unlimited inference for $100/month.
            </p>
          </div>

          <div className="rounded-3xl border border-orange-500/35 bg-gradient-to-b from-orange-500/10 to-transparent p-8 sm:p-12">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-end gap-2">
                  <span className="text-6xl font-black text-amber-50">
                    $100
                  </span>
                  <span className="mb-3 text-amber-400/60">/month</span>
                </div>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-amber-300/60">
                  Your deployment starts on the current Piro architecture:
                  <span className="font-semibold text-orange-200">
                    {" "}
                    {latestModel.label}
                  </span>
                  .
                </p>
              </div>
              <Link
                href="/pricing"
                className="rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-6 py-4 text-center text-base font-bold text-white transition-all hover:from-orange-400 hover:to-red-500 ember-glow"
              >
                See the plan →
              </Link>
            </div>

            <ul className="mt-10 grid gap-4 border-t border-orange-400/20 pt-8 sm:grid-cols-3">
              {[
                ["Persistent state", "Context carries between calls."],
                [
                  "Unlimited inference",
                  "Use your model without a token meter.",
                ],
                [
                  "Current architecture",
                  "Start from the latest validated track.",
                ],
              ].map(([title, detail]) => (
                <li key={title} className="border-l border-orange-400/50 pl-4">
                  <p className="text-sm font-semibold text-amber-50">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-300/55">
                    {detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-amber-900/20 px-4 py-24 text-center sm:px-6 sm:py-32">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold leading-tight text-amber-50 sm:text-5xl">
            Give your intelligence
            <span className="block bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">
              somewhere to grow.
            </span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-amber-200/65">
            Deploy Piro and stop starting from zero.
          </p>
          <Link
            href={primaryHref}
            className="ember-glow mt-10 inline-block rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-10 py-4 text-base font-bold text-white transition-all hover:from-orange-400 hover:to-red-500"
          >
            {primaryLabel}
          </Link>
        </div>
      </section>

      <footer className="border-t border-amber-900/20 px-4 py-10 text-center text-xs text-amber-400/40">
        <p>Piro — intelligence that remembers. © 2026.</p>
        <p className="mt-1">© 2026 VargasJR LLC. All rights reserved.</p>
      </footer>
    </main>
  );
}
