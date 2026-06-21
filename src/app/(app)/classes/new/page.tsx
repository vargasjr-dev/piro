"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function NewClassPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(toSlug(value));
  }

  function handleSlugChange(value: string) {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    setSlugTouched(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setSubmitting(true);
    setError(null);

    const form = new FormData();
    form.append("name", name.trim());
    form.append("slug", slug.trim());
    if (description.trim()) form.append("description", description.trim());
    if (file) form.append("module", file);

    try {
      const res = await fetch("/api/classes", { method: "POST", body: form });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Failed to create class");
        return;
      }
      router.push(`/classes/${data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-900/20 shrink-0">
        <Link
          href="/classes"
          className="text-amber-600/40 hover:text-amber-400/70 transition-colors"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <h1 className="text-amber-100 font-bold text-sm tracking-tight">New class</h1>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="p-6 max-w-lg space-y-5">

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="My Model"
            required
            className="w-full bg-[#0d0a08] border border-amber-900/20 rounded-xl px-4 py-2.5 text-sm text-amber-100 placeholder:text-amber-700/30 focus:outline-none focus:border-orange-500/30"
          />
        </div>

        {/* Slug */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
            Slug
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="my-model"
            required
            className="w-full bg-[#0d0a08] border border-amber-900/20 rounded-xl px-4 py-2.5 text-sm font-mono text-amber-300/80 placeholder:text-amber-700/30 focus:outline-none focus:border-orange-500/30"
          />
          <p className="text-[10px] text-amber-700/35">Lowercase letters, numbers, and hyphens only.</p>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
            Description <span className="normal-case font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What makes this architecture different…"
            rows={3}
            className="w-full bg-[#0d0a08] border border-amber-900/20 rounded-xl px-4 py-2.5 text-sm text-amber-100 placeholder:text-amber-700/30 focus:outline-none focus:border-orange-500/30 resize-none"
          />
        </div>

        {/* Python module upload */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/50">
            Python module <span className="normal-case font-normal">(optional)</span>
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-amber-900/30 bg-amber-900/5 cursor-pointer hover:bg-amber-900/10 transition-colors"
          >
            <svg className="w-4 h-4 text-amber-700/40 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
            </svg>
            <span className="text-xs text-amber-600/50">
              {file ? file.name : "Upload .py file"}
            </span>
            {file && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="ml-auto text-amber-700/40 hover:text-amber-500/60 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".py"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-[10px] text-amber-700/35">
            Must export a <code className="font-mono">serialize()</code> function. Can be uploaded later from the class page.
          </p>
        </div>

        {error && <p className="text-xs text-red-400/70">{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting || !name.trim() || !slug.trim()}
            className="px-5 py-2 rounded-xl bg-orange-500/15 border border-orange-500/25 text-xs font-semibold text-amber-200/80 hover:bg-orange-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating…" : "Create class"}
          </button>
          <Link href="/classes" className="text-xs text-amber-600/40 hover:text-amber-400/60 transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
