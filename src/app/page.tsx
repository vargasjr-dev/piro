import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "~/lib/auth.server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#0d0a08] flex flex-col items-center justify-center px-4">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 text-center max-w-2xl">
        {/* Logo mark */}
        <div className="mb-8 flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-700 flex items-center justify-center ember-glow">
            <span className="text-2xl font-black text-white">P</span>
          </div>
        </div>

        <h1 className="text-5xl font-black tracking-tight mb-4">
          <span className="text-amber-50">Your model.</span>
          <br />
          <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">
            Built on you.
          </span>
        </h1>

        <p className="text-amber-200/60 text-lg mb-12 leading-relaxed">
          Train a tiny, RL-first model from scratch using your own knowledge as
          the reward signal. It learns your preferences, grows over time, and
          never forgets.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-red-500 transition-all ember-glow"
          >
            Start training
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 border border-amber-900/50 text-amber-200 font-semibold rounded-xl hover:border-orange-500/50 hover:text-amber-50 transition-all"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
