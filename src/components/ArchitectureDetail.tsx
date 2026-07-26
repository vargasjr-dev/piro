"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Tab = "preview" | "code";

export function ArchitectureDetail({
  source,
}: {
  source: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    requestedTab === "code" ? "code" : "preview",
  );

  function switchTab(nextTab: Tab) {
    setTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "preview") params.delete("tab");
    else params.set("tab", nextTab);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center rounded-lg border border-amber-900/20 overflow-hidden w-fit">
        <button
          type="button"
          onClick={() => switchTab("preview")}
          className={`px-3 py-1.5 text-xs transition-colors ${
            tab === "preview"
              ? "bg-amber-900/30 text-amber-200/80"
              : "text-amber-700/40 hover:text-amber-500/60 hover:bg-amber-900/10"
          }`}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => switchTab("code")}
          className={`px-3 py-1.5 border-l border-amber-900/20 text-xs transition-colors ${
            tab === "code"
              ? "bg-amber-900/30 text-amber-200/80"
              : "text-amber-700/40 hover:text-amber-500/60 hover:bg-amber-900/10"
          }`}
        >
          Code
        </button>
      </div>

      {tab === "code" ? (
        <pre className="rounded-xl border border-amber-900/20 bg-[#13100c] p-4 overflow-x-auto text-xs leading-relaxed text-amber-200/70 font-mono">
          <code>{source ?? "Source unavailable."}</code>
        </pre>
      ) : (
        <div className="rounded-xl border border-amber-900/15 bg-amber-900/5 px-4 py-12 text-center text-sm text-amber-500/50">
          Select Code to inspect this architecture&apos;s source.
        </div>
      )}
    </div>
  );
}
