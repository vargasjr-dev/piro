import Link from "next/link";
import DocsShell from "~/components/DocsShell";

export const metadata = {
  title: "Getting started — Piro Docs",
  description:
    "Deploy a private Piro model and invoke it from your first application.",
};

const curlExample = `export PIRO_MODEL="your-model-id"
export PIRO_API_KEY="piro_..."

curl "https://trainpiro.app/api/models/$PIRO_MODEL/invoke" \\
  -H "Authorization: Bearer $PIRO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "parts": [
      { "type": "text", "text": "Remember that I prefer concise answers." }
    ]
  }'`;

const requestBody = `{
  "parts": [
    { "type": "text", "text": "What should you remember about me?" }
  ]
}`;

const responseBody = `{
  "output": {
    "parts": [
      { "type": "text", "text": "..." }
    ]
  }
}`;

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 sm:gap-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-400/40 bg-orange-500/10 font-mono text-sm font-bold text-orange-300">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold text-amber-50">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-amber-200/60">
          {children}
        </div>
      </div>
    </li>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#0b0908] p-4 text-xs leading-relaxed text-amber-200/80 sm:p-5">
      <code>{children}</code>
    </pre>
  );
}

export default function GettingStartedPage() {
  return (
    <DocsShell
      active="/docs/getting-started"
      title="Deploy and invoke your first Piro model."
      description="The shortest path from a Piro account to a working private model endpoint. No repository setup required."
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/12 via-[#17100b] to-[#100b08] p-6 shadow-[0_0_80px_rgba(249,115,22,0.08)] sm:p-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-300">
                Quick start
              </p>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-amber-50 sm:text-3xl">
                Get a response in a few minutes.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-amber-200/65 sm:text-base">
                Piro gives you a private, addressable model deployment. Pick a
                pretrained model, give your deployment an ID, create an API key,
                and send it a typed observation.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                href="/models"
                className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-[#180d07] transition hover:bg-orange-400"
              >
                Open Models
              </Link>
              <Link
                href="/profile#api-keys"
                className="rounded-xl border border-amber-700/40 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:border-amber-500/60 hover:bg-amber-500/5"
              >
                Manage API keys
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400/65">
            Before you start
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-900/25 bg-amber-950/15 p-4">
              <p className="font-semibold text-amber-50">
                You need a Piro account
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-300/55">
                Sign in first. Private model deployment requires an active Pro
                subscription; the Models page will send you to upgrade when
                needed.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-900/25 bg-amber-950/15 p-4">
              <p className="font-semibold text-amber-50">
                Keep two values handy
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-300/55">
                Your model ID and API key are the only values your first request
                needs. Treat the API key like a password.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-amber-900/30 bg-[#0f0c09] p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">
            Three steps
          </p>
          <ol className="mt-7 space-y-8">
            <Step number="1" title="Deploy a private model">
              <p>
                Open{" "}
                <Link
                  href="/models"
                  className="text-orange-300 underline decoration-orange-500/40 underline-offset-4"
                >
                  Models
                </Link>{" "}
                and choose{" "}
                <strong className="font-semibold text-amber-100">
                  Deploy Your Model
                </strong>
                . Select one of the available pretrained models, enter a unique
                model ID, and submit the deployment.
              </p>
              <p className="mt-3">
                Copy the model ID exactly. Wait for the card to show
                <strong className="ml-1 font-semibold text-emerald-300/80">
                  Stateful inference ready
                </strong>{" "}
                before moving on.
              </p>
            </Step>
            <Step number="2" title="Create an API key">
              <p>
                Open{" "}
                <Link
                  href="/profile#api-keys"
                  className="text-orange-300 underline decoration-orange-500/40 underline-offset-4"
                >
                  Profile → API Keys
                </Link>
                , give the key a name such as{" "}
                <code className="rounded bg-amber-950/60 px-1.5 py-0.5 font-mono text-xs text-amber-100">
                  quickstart
                </code>
                , and create it.
              </p>
              <p className="mt-3">
                Piro displays the raw key only once. Copy it immediately and
                store it in an environment variable—not in source control.
              </p>
            </Step>
            <Step number="3" title="Invoke your model">
              <p>
                Set the two values from the previous steps, then run this from a
                terminal. The request body is a Piro observation: an ordered
                array of text parts.
              </p>
              <div className="mt-4">
                <CodeBlock>{curlExample}</CodeBlock>
              </div>
            </Step>
          </ol>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/65">
              Request body
            </p>
            <h2 className="mt-3 text-xl font-bold text-amber-50">
              Send an observation
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-300/55">
              Text input uses one part with{" "}
              <code className="text-amber-100">type: "text"</code>. The body
              must contain at least one non-empty part.
            </p>
            <div className="mt-5">
              <CodeBlock>{requestBody}</CodeBlock>
            </div>
          </div>
          <div className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/65">
              Response
            </p>
            <h2 className="mt-3 text-xl font-bold text-amber-50">
              Read the model output
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-300/55">
              The response uses the same packet shape, under the{" "}
              <code className="text-amber-100">output</code> property.
            </p>
            <div className="mt-5">
              <CodeBlock>{responseBody}</CodeBlock>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-amber-900/30 bg-amber-500/5 p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">
            Next
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-amber-50">
                Build on the endpoint.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-300/55">
                Use the same model ID for subsequent requests, keep the API key
                on your server, and send observations from your application. See
                the full request and response contract in the API reference.
              </p>
            </div>
            <Link
              href="/docs/api"
              className="shrink-0 text-sm font-semibold text-orange-300 underline decoration-orange-500/40 underline-offset-4 transition hover:text-orange-200"
            >
              Read the API reference →
            </Link>
          </div>
        </section>
      </div>
    </DocsShell>
  );
}
