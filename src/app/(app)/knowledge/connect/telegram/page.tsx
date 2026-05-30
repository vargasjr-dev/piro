"use client";

import { useEffect } from "react";
import Link from "next/link";
import FlameLogo from "~/components/FlameLogo";

// Telegram Login Widget requires a script tag — we inject it client-side
export default function TelegramConnectPage() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const callbackUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/auth/callback/telegram`
      : "";

  useEffect(() => {
    if (!botUsername) return;
    const container = document.getElementById("telegram-widget-container");
    if (!container || container.childElementCount > 0) return;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", callbackUrl);
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);
  }, [botUsername, callbackUrl]);

  return (
    <div className="min-h-screen bg-[#0d0a08] flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <div className="flex items-center justify-center mb-8">
          <FlameLogo size={48} />
        </div>

        <h1 className="text-2xl font-black text-amber-50 text-center mb-2">
          Connect Telegram
        </h1>
        <p className="text-center text-amber-400/60 text-sm mb-8">
          Sign in with Telegram to link your account. Your bot conversation history will sync into your knowledge base.
        </p>

        {botUsername ? (
          <div
            id="telegram-widget-container"
            className="flex justify-center mb-6"
          />
        ) : (
          <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 text-center mb-6">
            <p className="text-amber-400/80 text-sm">
              Telegram bot not configured.{" "}
              <span className="text-amber-500">
                Set <code className="font-mono">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code> to enable.
              </span>
            </p>
          </div>
        )}

        <div className="text-center">
          <Link href="/knowledge" className="text-sm text-amber-400/40 hover:text-amber-400/70 transition">
            ← Back to Knowledge Base
          </Link>
        </div>
      </div>
    </div>
  );
}
