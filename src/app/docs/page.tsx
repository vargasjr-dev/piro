import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";

export const metadata = {
  title: "Docs — Piro",
  description: "How to structure your Piro experiment repo.",
};

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#0d0a08] text-amber-100">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-amber-900/20 bg-[#0d0a08]/95 backdrop-blur">
        <div className="flex items-center gap-6 px-4 lg:px-6 h-14">
          <Link
            href="/"
            className="flex items-center gap-2.5 hover:opacity-80 transition shrink-0"
          >
            <FlameLogo size={22} />
            <span className="font-bold text-amber-50 tracking-tight hidden sm:inline">
              Piro
            </span>
          </Link>
          <Link
            href="/docs"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-500/15 text-amber-100"
          >
            Docs
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-amber-50 mb-2">
          Repo Structure
        </h1>
        <p className="text-amber-400/50 text-sm mb-10">
          Every Piro experiment repo follows the same directory convention. Piro
          discovers components by path — no registration needed.
        </p>

        {/* Directory tree */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-amber-300/70 uppercase tracking-wider mb-4">
            Directory Layout
          </h2>
          <pre className="rounded-xl border border-amber-900/20 bg-amber-950/30 px-5 py-4 text-[13px] font-mono leading-relaxed text-amber-200/70 overflow-x-auto">{`my-experiment/
├── sources/
│   └── associative-recall/
│       └── main.py          # generates WRITE / QUERY data (JSONL → R2)
├── architectures/
│   ├── ctm/
│   │   └── main.py          # defines a PiroModel subclass
│   └── baseline-transformer/
│       └── main.py
├── benchmarks/
│   ├── persistent-memory/
│   │   └── main.py          # evaluates retained state
│   └── ood-generalization/
│       └── main.py
└── README.md`}</pre>
        </section>

        {/* Sources */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-amber-100 mb-3">Sources</h2>
          <p className="text-sm text-amber-400/60 leading-relaxed mb-4">
            A <strong className="text-amber-200">source</strong> is a data
            generation script. Each source lives in{" "}
            <code className="font-mono text-amber-300/70">
              sources/&lt;name&gt;/main.py
            </code>{" "}
            and produces JSONL output that Piro stores in R2 as a{" "}
            <strong className="text-amber-200">dataset</strong>.
          </p>
          <p className="text-sm text-amber-400/60 leading-relaxed">
            Generate a dataset by running{" "}
            <code className="font-mono text-amber-300/70">
              piro sources generate
            </code>{" "}
            — Piro executes the script, uploads the output to R2, and records a
            row in the{" "}
            <code className="font-mono text-amber-300/70">dataset</code> table.
          </p>
        </section>

        {/* Architectures */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-amber-100 mb-3">
            Architectures
          </h2>
          <p className="text-sm text-amber-400/60 leading-relaxed mb-4">
            An <strong className="text-amber-200">architecture</strong> defines
            a model. Each architecture lives in{" "}
            <code className="font-mono text-amber-300/70">
              architectures/&lt;name&gt;/main.py
            </code>{" "}
            and exports a{" "}
            <code className="font-mono text-amber-300/70">PiroModel</code>{" "}
            subclass that Piro instantiates during training.
          </p>
          <p className="text-sm text-amber-400/60 leading-relaxed">
            When you start a training run, you specify the architecture by its
            repo path (e.g.{" "}
            <code className="font-mono text-amber-300/70">
              architectures/ctm
            </code>
            ). Piro clones the repo, imports the module, and trains the model on
            Modal GPUs.
          </p>
        </section>

        {/* Benchmarks */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-amber-100 mb-3">
            Benchmarks
          </h2>
          <p className="text-sm text-amber-400/60 leading-relaxed mb-4">
            A <strong className="text-amber-200">benchmark</strong> evaluates a
            trained model. Each benchmark lives in{" "}
            <code className="font-mono text-amber-300/70">
              benchmarks/&lt;name&gt;/main.py
            </code>{" "}
            and runs against a model's weights to produce metrics like accuracy,
            generalization gaps, or compute allocation.
          </p>
          <p className="text-sm text-amber-400/60 leading-relaxed">
            Benchmarks are how you compare architectures against falsifiable
            claims — for example, whether retained state beats reset state after
            a delayed WRITE / DISTRACT / QUERY episode.
          </p>
        </section>

        {/* Datasets */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-amber-100 mb-3">
            Datasets
          </h2>
          <p className="text-sm text-amber-400/60 leading-relaxed">
            A <strong className="text-amber-200">dataset</strong> is the
            materialized output of a source run. It's stored in R2 and tracked
            in the Piro database with its sample count, source path, and
            generation timestamp. Training runs reference a dataset by ID — Piro
            streams the data from R2 into the training process on Modal.
          </p>
        </section>

        {/* How it fits together */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-amber-100 mb-3">
            How it fits together
          </h2>
          <div className="rounded-xl border border-amber-900/20 bg-amber-900/5 px-5 py-4">
            <ol className="space-y-3 text-sm text-amber-400/60">
              <li className="flex gap-3">
                <span className="text-orange-400 font-mono text-xs mt-0.5">
                  1
                </span>
                <span>
                  Write a <strong className="text-amber-200">source</strong>{" "}
                  that generates your training data.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-400 font-mono text-xs mt-0.5">
                  2
                </span>
                <span>
                  Run{" "}
                  <code className="font-mono text-amber-300/70">
                    piro sources generate
                  </code>{" "}
                  to produce a{" "}
                  <strong className="text-amber-200">dataset</strong> in R2.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-400 font-mono text-xs mt-0.5">
                  3
                </span>
                <span>
                  Write an{" "}
                  <strong className="text-amber-200">architecture</strong> that
                  defines your model.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-400 font-mono text-xs mt-0.5">
                  4
                </span>
                <span>
                  Start a{" "}
                  <strong className="text-amber-200">training run</strong> —
                  Piro trains your model on the dataset using Modal GPUs.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-400 font-mono text-xs mt-0.5">
                  5
                </span>
                <span>
                  Write <strong className="text-amber-200">benchmarks</strong>{" "}
                  to evaluate the trained model and compare architectures.
                </span>
              </li>
            </ol>
          </div>
        </section>

        <div className="border-t border-amber-900/20 pt-6 mt-12">
          <Link
            href="/"
            className="text-sm text-amber-400/50 hover:text-amber-200 transition-colors"
          >
            ← Back to Piro
          </Link>
        </div>
      </div>
    </main>
  );
}
