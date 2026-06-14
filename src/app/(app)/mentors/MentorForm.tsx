"use client";

import { useState } from "react";
import type { MentorData } from "./MentorList";

const MODELS = [
  {
    value: "claude-opus-4-5",
    label: "Claude Opus 4.5",
    note: "Most capable — best for nuanced rubrics",
  },
  {
    value: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    note: "Recommended — strong quality at lower cost",
  },
  {
    value: "claude-haiku-3-5",
    label: "Claude Haiku 3.5",
    note: "Fastest and cheapest — good for simple rubrics",
  },
] as const;

const DEFAULT_SYSTEM_PROMPT = `You are a personalized reward evaluator for a small language model being trained via reinforcement learning.

Your goal is to score candidate responses based on how well they serve the user's needs and preferences. Be consistent in your scoring so the model can learn reliable patterns.

Evaluation criteria:
- Accuracy and helpfulness (0.4 weight): Does the response correctly address the prompt?
- Clarity and conciseness (0.3 weight): Is it well-expressed without unnecessary verbosity?
- Alignment with user style (0.3 weight): Does it match the tone and approach the user prefers?

Score from 0.0 (completely wrong or unhelpful) to 1.0 (ideal response). Most responses should fall between 0.2 and 0.9 — reserve the extremes for genuinely exceptional or broken outputs.`;

interface Props {
  mentor: MentorData | null; // null = creating new
  onClose: () => void;
  onSaved: () => void;
}

export default function MentorForm({ mentor, onClose, onSaved }: Props) {
  const isEditing = mentor !== null;

  const [name, setName] = useState(mentor?.name ?? "");
  const [description, setDescription] = useState(mentor?.description ?? "");
  const [model, setModel] = useState(
    mentor?.model ?? "claude-sonnet-4-5",
  );
  const [systemPrompt, setSystemPrompt] = useState(
    mentor?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
  );
  const [temperature, setTemperature] = useState(
    mentor?.temperature ?? 0.2,
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/mentors/${mentor.id}`
        : "/api/mentors";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          model,
          systemPrompt: systemPrompt.trim(),
          temperature,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to save");
        return;
      }

      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!mentor) return;
    setDeleting(true);
    setConfirmDelete(false);
    try {
      await fetch(`/api/mentors/${mentor.id}`, { method: "DELETE" });
      onSaved();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col h-full"
    >
      {/* Form header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-900/20 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-900/30 text-amber-400/50 hover:text-amber-200 transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div>
          <h2 className="text-sm font-bold text-amber-50 leading-none">
            {isEditing ? "Edit mentor" : "New mentor"}
          </h2>
          <p className="text-xs text-amber-400/40 mt-0.5">
            Define the rubric your mentor uses to score responses
          </p>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-amber-300/60">
            Name <span className="text-orange-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Writing Quality"
            required
            maxLength={100}
            className="w-full px-3 py-2.5 rounded-xl bg-amber-900/10 border border-amber-900/30 text-amber-100 text-sm placeholder:text-amber-700/40 focus:outline-none focus:border-orange-500/40 focus:bg-amber-900/15 transition"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-amber-300/60">
            Description
            <span className="text-amber-600/40 font-normal ml-1">
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this mentor evaluate?"
            maxLength={500}
            className="w-full px-3 py-2.5 rounded-xl bg-amber-900/10 border border-amber-900/30 text-amber-100 text-sm placeholder:text-amber-700/40 focus:outline-none focus:border-orange-500/40 focus:bg-amber-900/15 transition"
          />
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-amber-300/60">
            Model <span className="text-orange-400">*</span>
          </label>
          <div className="space-y-1.5">
            {MODELS.map((m) => (
              <label
                key={m.value}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition
                  ${
                    model === m.value
                      ? "border-orange-500/40 bg-orange-500/8"
                      : "border-amber-900/25 bg-amber-900/5 hover:border-amber-800/40"
                  }
                `}
              >
                <input
                  type="radio"
                  name="model"
                  value={m.value}
                  checked={model === m.value}
                  onChange={() => setModel(m.value)}
                  className="accent-orange-500"
                />
                <div>
                  <p className="text-xs font-medium text-amber-200/80">
                    {m.label}
                  </p>
                  <p className="text-[10px] text-amber-600/40">{m.note}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Temperature */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-amber-300/60">
              Temperature
            </label>
            <span className="text-xs text-amber-400/60 font-mono">
              {temperature.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-[10px] text-amber-700/35">
            <span>0.0 — deterministic</span>
            <span>1.0 — creative</span>
          </div>
          <p className="text-[10px] text-amber-600/35">
            Keep low (0.1–0.3) for consistent scoring. Higher values introduce
            variance in rewards, which can destabilize training.
          </p>
        </div>

        {/* System prompt */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-amber-300/60">
              Evaluation rubric <span className="text-orange-400">*</span>
            </label>
            <span className="text-[10px] text-amber-700/35">
              {systemPrompt.length} chars
            </span>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            required
            rows={14}
            className="w-full px-3 py-2.5 rounded-xl bg-amber-900/10 border border-amber-900/30 text-amber-100 text-xs font-mono leading-relaxed placeholder:text-amber-700/40 focus:outline-none focus:border-orange-500/40 focus:bg-amber-900/15 transition resize-y"
            placeholder="Describe what a good response looks like, how to weigh different criteria, and what scores to assign in various cases..."
          />
          <p className="text-[10px] text-amber-600/35">
            This becomes the system prompt when the mentor scores student
            responses. Be specific — precise rubrics produce stable reward
            signals.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/40 border border-red-800/30 rounded-xl px-4 py-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Confirm delete */}
        {confirmDelete && (
          <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl px-4 py-3 space-y-3">
            <p className="text-xs text-amber-300/70">
              Delete &quot;{mentor?.name}&quot;? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-3 py-2 rounded-lg bg-red-900/40 border border-red-800/30 text-red-400 text-xs font-medium hover:bg-red-900/60 disabled:opacity-40 transition"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/20 text-amber-400/60 text-xs font-medium hover:bg-amber-900/40 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {!confirmDelete && (
        <div className="px-5 pb-5 pt-3 shrink-0 flex gap-2 border-t border-amber-900/20">
          <button
            type="submit"
            disabled={saving || !name.trim() || !systemPrompt.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-orange-600/70 hover:bg-orange-600/90 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create mentor"}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="px-4 py-2.5 rounded-xl bg-red-900/20 border border-red-800/20 text-red-400/70 text-sm font-medium hover:bg-red-900/40 disabled:opacity-40 transition"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </form>
  );
}
