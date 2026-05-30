import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";

export default async function DashboardPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-amber-50 mb-2">
          Welcome, {session?.user.name?.split(" ")[0]}.
        </h1>
        <p className="text-amber-400/60">Your model is waiting to be trained.</p>
      </div>

      {/* Status card */}
      <div className="bg-[#1a1208]/60 border border-amber-900/30 rounded-2xl p-8 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2 h-2 rounded-full bg-orange-500/40" />
          <span className="text-sm text-amber-400/60 font-medium uppercase tracking-widest">Model status</span>
        </div>
        <p className="text-amber-200/50 text-sm leading-relaxed">
          No model trained yet. Connect your knowledge base and start your first training session to bring your model to life.
        </p>
      </div>

      {/* Modules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a
          href="/knowledge"
          className="bg-[#1a1208]/60 border border-amber-700/30 rounded-xl p-6 hover:border-amber-600/50 hover:bg-[#1a1208]/80 transition-all group"
        >
          <h3 className="font-semibold text-amber-200 mb-1 group-hover:text-amber-100">Knowledge Base</h3>
          <p className="text-sm text-amber-400/50">Connect your accounts and pull your data</p>
          <span className="mt-3 inline-block text-xs text-orange-500/80 font-medium uppercase tracking-widest">Open →</span>
        </a>
        {[
          { label: "Training Sessions", desc: "Run GRPO with your Opus judge" },
          { label: "Learning Moments", desc: "Review correction and discovery events" },
          { label: "Capability Ledger", desc: "Track what your model has learned" },
        ].map((m) => (
          <div
            key={m.label}
            className="bg-[#1a1208]/40 border border-amber-900/20 rounded-xl p-6 opacity-50 cursor-not-allowed"
          >
            <h3 className="font-semibold text-amber-200 mb-1">{m.label}</h3>
            <p className="text-sm text-amber-400/50">{m.desc}</p>
            <span className="mt-3 inline-block text-xs text-orange-600/60 font-medium uppercase tracking-widest">Coming soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}
