interface Item {
  id: string;
  provider: string;
  itemType: string;
  content: string;
  itemCreatedAt: Date | null;
}

interface Props {
  items: Item[];
  totalItems: number;
}

const providerBadge: Record<string, string> = {
  github: "bg-slate-800/60 text-slate-300 border border-slate-700/30",
  gmail: "bg-red-900/30 text-red-300/80 border border-red-800/20",
  telegram: "bg-sky-900/30 text-sky-300/80 border border-sky-800/20",
};

const typeBadge: Record<string, string> = {
  commit: "●",
  pr: "⬡",
  email: "◈",
  message: "◆",
};

export default function KnowledgeItems({ items, totalItems }: Props) {
  if (totalItems === 0) {
    return (
      <div className="border border-dashed border-amber-900/30 rounded-2xl p-12 text-center">
        <p className="text-amber-400/40 text-sm">
          Connect an account above and hit <span className="text-amber-400/70">Sync</span> to start building your knowledge base.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-amber-400/60 uppercase tracking-widest">
          Recent items
        </h2>
        {totalItems > items.length && (
          <span className="text-xs text-amber-400/40">
            showing {items.length} of {totalItems.toLocaleString()}
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-amber-900/20 overflow-hidden">
        {items.map((item, i) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 px-5 py-4 ${
              i < items.length - 1 ? "border-b border-amber-900/15" : ""
            } hover:bg-amber-900/10 transition-colors`}
          >
            {/* Provider badge */}
            <span
              className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-mono ${
                providerBadge[item.provider] ?? "bg-amber-900/30 text-amber-300/60"
              }`}
            >
              {typeBadge[item.itemType] ?? "◉"} {item.itemType}
            </span>

            {/* Content */}
            <p className="text-sm text-amber-200/70 leading-relaxed flex-1 min-w-0 truncate">
              {item.content}
            </p>

            {/* Date */}
            {item.itemCreatedAt && (
              <span className="shrink-0 text-xs text-amber-400/30 ml-2">
                {formatDate(new Date(item.itemCreatedAt))}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
