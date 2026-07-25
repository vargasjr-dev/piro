import DocsShell from "~/components/DocsShell";

export const metadata = {
  title: "API — Piro Docs",
  description: "Run a pretrained Piro model through the inference API.",
};

const requestExample = `curl https://api.trainpiro.app/models/your-model/invoke \\
  -H "Authorization: Bearer $PIRO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "parts": [
      { "type": "text", "text": "What did I learn yesterday?" }
    ]
  }'`;

const requestBody = `{
  "parts": [
    { "type": "text", "text": "What did I learn yesterday?" }
  ]
}`;

const responseExample = `{
  "output": {
    "parts": [
      { "type": "text", "text": "..." }
    ]
  }
}`;

export default function ApiDocsPage() {
  return (
    <DocsShell active="/docs/api" title="API">
      <div className="overflow-hidden rounded-3xl border border-amber-900/30 bg-[#13100c]">
        <div className="border-b border-amber-900/25 px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-3 font-mono text-sm">
            <span className="rounded-md bg-emerald-400/15 px-2.5 py-1 font-bold text-emerald-300">POST</span>
            <code className="text-amber-100/80">/models/&#123;model&#125;/invoke</code>
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-amber-300/65 sm:text-base">
            Run a pretrained Piro model on one observation. The model carries its learned state in its weights, so requests send a PiroInput packet and do not include a separate state parameter.
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <section className="border-b border-amber-900/25 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <h2 className="text-xl font-bold text-amber-50">Request</h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-300/60">
              The request body is a PiroInput observation. PiroInput is an ordered packet of typed parts; text observations use a single <code className="text-amber-100">text</code> part.
            </p>

            <div className="mt-8">
              <h3 className="text-sm font-semibold text-amber-100">Body parameters</h3>
              <dl className="mt-4 divide-y divide-amber-900/25 rounded-2xl border border-amber-900/25">
                <div className="grid gap-1 p-4 sm:grid-cols-[8rem_1fr] sm:gap-5">
                  <dt className="font-mono text-sm text-sky-200">parts</dt>
                  <dd className="text-sm text-amber-300/65"><span className="font-mono text-amber-100/80">array</span> · required — the ordered parts of the observation.</dd>
                </div>
                <div className="grid gap-1 border-t border-amber-900/25 p-4 sm:grid-cols-[8rem_1fr] sm:gap-5">
                  <dt className="font-mono text-sm text-sky-200">parts[].type</dt>
                  <dd className="text-sm text-amber-300/65"><span className="font-mono text-amber-100/80">&quot;text&quot;</span> — identifies a text observation part.</dd>
                </div>
                <div className="grid gap-1 border-t border-amber-900/25 p-4 sm:grid-cols-[8rem_1fr] sm:gap-5">
                  <dt className="font-mono text-sm text-sky-200">parts[].text</dt>
                  <dd className="text-sm text-amber-300/65"><span className="font-mono text-amber-100/80">string</span> · required — the text presented to the model.</dd>
                </div>
              </dl>
            </div>

            <pre className="mt-8 overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#0b0908] p-5 text-xs leading-relaxed text-amber-200/80"><code>{requestBody}</code></pre>
          </section>

          <section className="p-6 sm:p-8">
            <h2 className="text-xl font-bold text-amber-50">Response</h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-300/60">
              The response returns the model output in the same packet shape, so clients can handle model observations and outputs consistently.
            </p>
            <pre className="mt-8 overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#0b0908] p-5 text-xs leading-relaxed text-amber-200/80"><code>{responseExample}</code></pre>
          </section>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-amber-50">Example request</h2>
        <pre className="mt-4 overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#0b0908] p-5 text-xs leading-relaxed text-amber-200/80 sm:p-6"><code>{requestExample}</code></pre>
      </section>
    </DocsShell>
  );
}
