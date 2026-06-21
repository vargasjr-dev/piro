import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import FlameLogo from "~/components/FlameLogo";

export default async function HomePage() {
  // If a session cookie is present, send them straight to the app.
  // Full session verification happens in the (app) layout — if the token
  // is expired it will redirect to /login from there.
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has("better-auth.session_token") ||
    cookieStore.has("__Secure-better-auth.session_token");

  if (hasSession) {
    redirect("/benchmarks");
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
          <FlameLogo size={72} />
        </div>

        <h1 className="text-5xl font-black tracking-tight mb-4">
          <span className="text-amber-50">Your model.</span>
          <br />
          <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent ember-text-glow">
            Built for you.
          </span>
        </h1>

        <p className="text-amber-200/60 text-lg mb-12 leading-relaxed">
          A personal model that thinks continuously, learns from your knowledge,
          and compounds over time — without ever forgetting.
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
