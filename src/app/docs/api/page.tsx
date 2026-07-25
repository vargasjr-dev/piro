import DocsShell from "~/components/DocsShell";

export const metadata = {
  title: "API — Piro Docs",
  description: "Invoke a stateful Piro model through the model API.",
};

const requestExample = `curl https://api.trainpiro.app/v1/models/your-model/invoke \\
  -H "Authorization: Bearer $PIRO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": {"type": "message", "content": "What did I learn yesterday?"},
    "state": {"session_id": "obi-wan-workspace"}
  }'`;

const responseExample = `{
  "id": "inv_01J...",
  "model": "your-model",
  "output": {"type": "message", "content": "..."},
  "state": {"session_id": "obi-wan-workspace", "version": 42},
  "usage": {"steps": 6}
}`;

export default function ApiDocsPage() {
  return (
    <DocsShell
      active="/docs/api"
      eyebrow="The model interface"
      title="Invoke a model with continuity."
      description="The Piro API treats state as a first-class part of inference. Send an observation, address the model state you want to continue, and receive an output plus the next state version."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-[#13100c] p-7 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-300">Invoke</p>
          <h2 className="mt-4 text-2xl font-bold text-amber-50">One endpoint. Persistent context.</h2>
          <p className="mt-4 text-sm leading-relaxed text-amber-300/60">The endpoint shown here is the contract we are building toward. It is intentionally simple: the complexity belongs inside the model loop, not in every client integration.</p>
          <pre className="mt-7 overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#0b0908] p-5 text-xs leading-relaxed text-amber-200/80"><code>{requestExample}</code></pre>
        </section>
        <section className="rounded-3xl border border-amber-900/30 bg-[#13100c] p-7 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400/60">Response shape</p>
          <h2 className="mt-4 text-2xl font-bold text-amber-50">Output and state move together.</h2>
          <p className="mt-4 text-sm leading-relaxed text-amber-300/60">A response is more than generated text. It tells you which model answered, which state version was used, and how far the recurrent loop ran.</p>
          <pre className="mt-7 overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#0b0908] p-5 text-xs leading-relaxed text-amber-200/80"><code>{responseExample}</code></pre>
        </section>
      </div>

      <section className="mt-12">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Core concepts</p><h2 className="mt-4 text-3xl font-bold tracking-tight text-amber-50">Designed for model-native applications.</h2></div>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {[
            ["Model", "A named deployment with its own weights, state, and checkpoint history."],
            ["Session state", "A durable address for the model’s working context. Resume it from the next request instead of rebuilding it."],
            ["Version", "A checkpoint boundary you can inspect, benchmark, and recover when an update needs to be reversed."],
          ].map(([title, body]) => <article key={title} className="rounded-2xl border border-amber-900/30 bg-[#13100c] p-6"><h3 className="font-semibold text-amber-50">{title}</h3><p className="mt-3 text-sm leading-relaxed text-amber-300/55">{body}</p></article>)}
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-amber-900/30 bg-[#0f0c09] p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/60">Planned surface area</p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          {["POST /v1/models/:model/invoke", "GET /v1/models/:model", "GET /v1/models/:model/state", "POST /v1/models/:model/checkpoints"].map((route) => <code key={route} className="rounded-lg border border-amber-800/30 bg-amber-950/20 px-3 py-2 text-amber-200/75">{route}</code>)}
        </div>
      </section>
    </DocsShell>
  );
}
