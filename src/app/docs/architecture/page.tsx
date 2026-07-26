import Link from "next/link";
import DocsShell from "~/components/DocsShell";

type MethodLinkProps = {
  href: string;
  children: string;
};

function MethodLink({ href, children }: MethodLinkProps) {
  return (
    <Link
      href={href}
      className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition hover:text-emerald-100 hover:decoration-emerald-200"
    >
      {children}
    </Link>
  );
}

function Variable({ children }: { children: string }) {
  return <span className="text-sky-200/90">{children}</span>;
}

function Keyword({ children }: { children: string }) {
  return <span className="text-orange-300">{children}</span>;
}

export const metadata = {
  title: "Architecture — Piro Docs",
  description:
    "Understand Borealis prefill, hidden state, fast adaptation, and autoregressive generation.",
};

export default function ArchitecturePage() {
  return (
    <DocsShell
      active="/docs/architecture"
      title="Piro Inference Architecture"
      description="Borealis separates prompt adaptation from autoregressive generation: a recurrent hidden state carries context, while the output head produces one next-token decision at a time."
    >
      <div className="space-y-8">
        <section className="rounded-3xl border border-amber-900/30 bg-[#100c0a] p-6 shadow-2xl shadow-black/10 sm:p-8">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/70">
              Borealis · prompt prefill and generation
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-amber-50">
              The hidden state carries the context forward
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-amber-200/65">
              The loop does the recurrent representation work and, while prompt
              targets are known, updates run-local fast state. OutputHead is the
              final vocabulary readout; Generate repeats that readout and
              advances the hidden state for every new token.
            </p>
          </div>
          <div
            className="overflow-x-auto rounded-2xl border border-amber-900/20 bg-[#0b0908] px-4 py-5 sm:px-6"
            role="region"
            aria-label="Borealis prefill and generation pseudocode"
          >
            <code className="block min-w-[56rem] font-mono text-sm leading-6 text-amber-100/85">
              <div className="whitespace-pre">
                <Variable>durableWeights</Variable> ={" "}
                <MethodLink href="/docs/architecture/loadWeights">
                  LoadWeights
                </MethodLink>
                ()
              </div>
              <div className="whitespace-pre">
                <Variable>fastState</Variable> ={" "}
                <MethodLink href="/docs/architecture/initializeFastState">
                  InitializeFastState
                </MethodLink>
                (<Variable>durableWeights</Variable>)
              </div>
              <div className="whitespace-pre">
                <Variable>hidden</Variable> ={" "}
                <MethodLink href="/docs/architecture/hiddenState">
                  InitializeHiddenState
                </MethodLink>
                ()
              </div>
              <div className="whitespace-pre">
                <Variable>prompt</Variable> ={" "}
                <MethodLink href="/docs/architecture/embedding">
                  Embed
                </MethodLink>
                (
                <Link
                  href="/docs/architecture/observation"
                  className="text-violet-300 underline decoration-violet-500/40 underline-offset-4 transition hover:text-violet-100"
                >
                  PiroInput
                </Link>
                )
              </div>
              <div className="whitespace-pre">
                <Keyword>for</Keyword> each known transition (observedToken,
                targetToken) in <Variable>prompt</Variable>:
              </div>
              <div className="whitespace-pre">
                {" "}
                <Variable>prediction</Variable>, <Variable>hidden</Variable> ={" "}
                <MethodLink href="/docs/architecture/predictNext">
                  PredictNextToken
                </MethodLink>
                (observedToken, <Variable>hidden</Variable>,{" "}
                <Variable>fastState</Variable>)
              </div>
              <div className="whitespace-pre">
                {" "}
                <Variable>fastState</Variable> ={" "}
                <MethodLink href="/docs/architecture/fastAdaptation">
                  FastAdaptation
                </MethodLink>
                (<Variable>fastState</Variable>, targetToken,{" "}
                <Variable>prediction</Variable>)
              </div>
              <div className="whitespace-pre">
                <Variable>hidden</Variable> ={" "}
                <MethodLink href="/docs/architecture/advanceHidden">
                  AdvanceHidden
                </MethodLink>
                (lastPromptToken, <Variable>hidden</Variable>)
              </div>
              <div className="whitespace-pre">
                <Keyword>for</Keyword> step in range(maxNewTokens):
              </div>
              <div className="whitespace-pre">
                {" "}
                <Variable>logits</Variable> ={" "}
                <MethodLink href="/docs/architecture/output">
                  OutputHead
                </MethodLink>
                (<Variable>hidden</Variable>, <Variable>fastState</Variable>)
              </div>
              <div className="whitespace-pre">
                {" "}
                <Variable>token</Variable> = Argmax(<Variable>logits</Variable>)
              </div>
              <div className="whitespace-pre">
                {" "}
                Emit(<Variable>token</Variable>)
              </div>
              <div className="whitespace-pre">
                {" "}
                <Variable>hidden</Variable> ={" "}
                <MethodLink href="/docs/architecture/advanceHidden">
                  AdvanceHidden
                </MethodLink>
                (<Variable>token</Variable>, <Variable>hidden</Variable>)
              </div>
              <div className="whitespace-pre">
                <MethodLink href="/docs/architecture/consolidate">
                  ConsolidateWeights
                </MethodLink>
                (<Variable>durableWeights</Variable>,{" "}
                <Variable>fastState</Variable>)
              </div>
            </code>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <article className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.04] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70">
              Hidden state
            </p>
            <h3 className="mt-3 text-lg font-semibold text-amber-50">
              Compressed sequence context
            </h3>
            <p className="mt-3 text-sm leading-7 text-amber-100/70">
              A vector updated by the GRUCell. It is not a token list or durable
              weight tensor; it is the representation consumed by the next step.
            </p>
          </article>
          <article className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.04] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200/70">
              OutputHead
            </p>
            <h3 className="mt-3 text-lg font-semibold text-amber-50">
              One vocabulary decision
            </h3>
            <p className="mt-3 text-sm leading-7 text-amber-100/70">
              LayerNorm plus a linear vocabulary projection and fast bias
              overlay produce logits for one next-token choice.
            </p>
          </article>
          <article className="rounded-2xl border border-orange-300/20 bg-orange-300/[0.04] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-200/70">
              Generate
            </p>
            <h3 className="mt-3 text-lg font-semibold text-amber-50">
              Repeated decode steps
            </h3>
            <p className="mt-3 text-sm leading-7 text-amber-100/70">
              Argmax selects a token, then AdvanceHidden consumes it. Repeating
              this loop turns logits into a multi-token continuation.
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-amber-900/30 bg-[#100c0a] p-6">
          <p className="text-sm leading-7 text-amber-200/70">
            Prompt transitions may be adapted because their targets are known.
            Generated tokens are not adapted by default because the model does
            not receive an external correctness signal for its own output. See
            the individual method pages for the implementation-level contracts.
          </p>
        </section>
      </div>
    </DocsShell>
  );
}
