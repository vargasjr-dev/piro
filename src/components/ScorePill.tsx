/**
 * ScorePill — color-coded score badge used on benchmark result rows.
 *
 * Thresholds:
 *   ≥ 0.8  → green  (passing)
 *   ≥ 0.4  → amber  (partial)
 *   < 0.4  → red    (failing)
 *
 * Colors are intentionally vivid so the pass/fail signal is immediately
 * readable on both desktop and mobile, even in a dense result list.
 */
export default function ScorePill({ score }: { score: number }) {
  const cls =
    score >= 0.8
      ? "text-emerald-300 border-emerald-500/50 bg-emerald-900/35"
      : score >= 0.4
        ? "text-amber-300 border-amber-500/45 bg-amber-900/30"
        : "text-red-400 border-red-500/50 bg-red-900/30";

  return (
    <span
      className={`inline-flex items-center text-xs font-mono font-semibold px-2 py-0.5 rounded-lg border ${cls}`}
    >
      {score.toFixed(3)}
    </span>
  );
}
