import DocsShell from "~/components/DocsShell";

export const metadata = {
  title: "Getting started — Piro Docs",
  description: "Create your first Piro experiment and connect it to the model loop.",
};

const repoTree = `my-piro-experiment/
├── sources/
│   └── associative-recall/
│       └── main.py
├── architectures/
│   └── piro-256m/
│       └── main.py
├── benchmarks/
│   └── persistent-memory/
│       └── main.py
└── README.md`;

export default function GettingStartedPage() {
  return (
    <DocsShell
      active="/docs/getting-started"
      eyebrow="First model, first loop"
      title="Start with an experiment."
      description="A Piro project is a small, inspectable repo: generate the experiences, define the architecture, run the training loop, and measure whether the model is actually becoming more capable."
    >
      <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
        <section className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-[#13100c] p-7 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-300">The first run</p>
          <ol className="mt-7 space-y-6">
            {[
              ["01", "Create a repo", "Keep the learning loop in plain sight: sources, architectures, and benchmarks are files, not opaque configuration."],
              ["02", "Generate experience", "A source emits structured episodes such as WRITE → DISTRACT → QUERY. Those episodes become the material your model learns from."],
              ["03", "Train and compare", "Start a run against an architecture, then use benchmarks to compare the result with a baseline."],
            ].map(([number, title, body]) => (
              <li key={number} className="flex gap-4">
                <span className="font-mono text-sm text-orange-300">{number}</span>
                <div><h2 className="font-semibold text-amber-50">{title}</h2><p className="mt-2 text-sm leading-relaxed text-amber-300/55">{body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-7 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400/60">Project contract</p>
          <h2 className="mt-4 text-2xl font-bold text-amber-50">One repo. Three responsibilities.</h2>
          <pre className="mt-7 overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#0b0908] p-5 text-sm leading-relaxed text-amber-200/75"><code>{repoTree}</code></pre>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Sources produce data", "Architectures define state", "Benchmarks make claims testable"].map((label) => <div key={label} className="rounded-xl border border-amber-900/25 bg-amber-950/15 p-3 text-xs leading-relaxed text-amber-200/65">{label}</div>)}
          </div>
        </section>
      </div>

      <section className="mt-12 rounded-2xl border border-amber-900/30 bg-[#0f0c09] p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">A useful mental model</p>
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          {["Observation", "State update", "Action + reward"].map((label, index) => (
            <div key={label} className="relative">
              <p className="text-sm font-semibold text-amber-50">{index + 1}. {label}</p>
              <p className="mt-2 text-sm leading-relaxed text-amber-300/55">{index === 0 ? "The model receives an event, not a blank chat window." : index === 1 ? "The internal state changes as the model processes the episode." : "The model produces an output and the loop records what happened."}</p>
            </div>
          ))}
        </div>
      </section>
    </DocsShell>
  );
}
