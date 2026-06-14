"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MentorForm from "./MentorForm";

export interface MentorData {
  id: string;
  name: string;
  description: string | null;
  model: string;
  systemPrompt: string;
  temperature: number;
  scoreCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-5": "Opus 4.5",
  "claude-sonnet-4-5": "Sonnet 4.5",
  "claude-haiku-3-5": "Haiku 3.5",
};

function MentorCard({
  mentor,
  selected,
  onClick,
}: {
  mentor: MentorData;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left rounded-xl border px-4 py-3.5 transition-all
        ${
          selected
            ? "border-orange-500/40 bg-orange-500/8"
            : "border-amber-900/25 bg-amber-900/5 hover:border-amber-800/40 hover:bg-amber-900/10"
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-100 truncate">
            {mentor.name}
          </p>
          {mentor.description && (
            <p className="text-xs text-amber-400/50 mt-0.5 line-clamp-2">
              {mentor.description}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-amber-600/40 bg-amber-900/20 border border-amber-900/30 rounded-md px-1.5 py-0.5 font-medium">
          {MODEL_LABELS[mentor.model] ?? mentor.model}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-2.5">
        <div className="flex items-center gap-1.5">
          {/* Temperature dot cluster */}
          <span className="text-[10px] text-amber-600/35">
            t={mentor.temperature.toFixed(2)}
          </span>
        </div>
        {mentor.scoreCount > 0 && (
          <span className="text-[10px] text-amber-600/35">
            {mentor.scoreCount.toLocaleString()} score
            {mentor.scoreCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[240px] text-center px-6">
      {/* Star icon */}
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-amber-800/40 mb-4"
      >
        <path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-sm font-semibold text-amber-200/60">No mentors yet</p>
      <p className="text-xs text-amber-600/40 mt-1 max-w-xs">
        A mentor is an LLM agent with a rubric that scores student responses.
        Create one to define what &quot;good&quot; looks like for your model.
      </p>
      <button
        onClick={onNew}
        className="mt-5 px-4 py-2 rounded-xl bg-orange-500/15 border border-orange-500/25 text-orange-300 text-sm font-medium hover:bg-orange-500/25 transition"
      >
        Create first mentor
      </button>
    </div>
  );
}

export default function MentorList({
  initialMentors,
}: {
  initialMentors: MentorData[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<MentorData | "new" | null>(null);

  const showForm = selected !== null;
  const editingMentor = selected !== "new" ? selected : null;

  function handleNew() {
    setSelected("new");
  }

  function handleCardClick(m: MentorData) {
    setSelected((prev) => (prev === m ? null : m));
  }

  function handleClose() {
    setSelected(null);
  }

  function handleSaved() {
    setSelected(null);
    router.refresh();
  }

  return (
    <div className="flex h-full">
      {/* ── Left panel: list ─────────────────────────────────── */}
      <div
        className={`
          flex flex-col border-r border-amber-900/20 overflow-y-auto
          ${showForm ? "w-72 shrink-0 hidden lg:flex" : "flex-1"}
        `}
      >
        {/* List header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-amber-900/15 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/40">
            {initialMentors.length > 0
              ? `${initialMentors.length} mentor${initialMentors.length === 1 ? "" : "s"}`
              : "Mentors"}
          </span>
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 text-xs font-medium text-orange-400/70 hover:text-orange-300 transition"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path
                d="M12 5v14M5 12h14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            New
          </button>
        </div>

        {/* Cards or empty state */}
        {initialMentors.length === 0 ? (
          <EmptyState onNew={handleNew} />
        ) : (
          <div className="flex-1 p-4 space-y-2 overflow-y-auto">
            {initialMentors.map((m) => (
              <MentorCard
                key={m.id}
                mentor={m}
                selected={
                  selected !== null && selected !== "new" && selected.id === m.id
                }
                onClick={() => handleCardClick(m)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: form ────────────────────────────────── */}
      {showForm && (
        <div className="flex-1 overflow-y-auto">
          <MentorForm
            mentor={editingMentor}
            onClose={handleClose}
            onSaved={handleSaved}
          />
        </div>
      )}

      {/* Mobile: form replaces list */}
      {!showForm && initialMentors.length === 0 && (
        <div className="lg:hidden flex-1" />
      )}
    </div>
  );
}
