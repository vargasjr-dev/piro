import Link from "next/link";
import DocsShell from "~/components/DocsShell";

export const metadata = {
  title: "Piro Docs — Stateful model infrastructure",
  description: "Build, train, and invoke small stateful models with Piro.",
};

export default function DocsPage() {
  return (
    <DocsShell
      active="/docs"
      title="Build models that keep becoming."
    >
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-[#17100b] to-[#100b08] p-7 shadow-[0_0_80px_rgba(249,115,22,0.08)] sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-300">What is Piro?</p>
          <h2 className="mt-4 max-w-2xl text-3xl font-black leading-tight tracking-[-0.035em] text-amber-50 sm:text-4xl">
            Pretrained models you can deploy as your own.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-amber-200/65">
            Piro provides pretrained, stateful models that you can deploy, run, and build into your own applications through a model API designed to carry state forward.
          </p>
        </section>

        <section className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-7 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400/60">Quick start</p>
          <h2 className="mt-4 text-2xl font-bold text-amber-50">Get oriented in a few minutes.</h2>
          <p className="mt-3 text-sm leading-relaxed text-amber-300/55">
            Learn the core repo contract, then move directly to the API or architecture docs when you are ready to go deeper.
          </p>
          <Link
            href="/docs/getting-started"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-500/10 px-4 py-2.5 text-sm font-semibold text-orange-100 transition-colors hover:border-orange-300 hover:bg-orange-500/20"
          >
            Start building <span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>

      <section className="mt-12">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">Where to go next</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ["/docs/getting-started", "Getting started", "Create your first experiment and understand the repo contract."],
            ["/docs/api", "API", "Send observations, continue state, and receive model output."],
            ["/docs/architecture", "Architecture", "Trace the state update loop from input to output."],
          ].map(([href, label, detail]) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl border border-amber-900/30 bg-[#13100c] p-6 transition-colors hover:border-orange-500/40 hover:bg-orange-500/5"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold text-amber-50">{label}</h2>
                <span aria-hidden="true" className="text-orange-300 transition-transform group-hover:translate-x-1">→</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-amber-300/55">{detail}</p>
            </Link>
          ))}
        </div>
      </section>
    </DocsShell>
  );
}
