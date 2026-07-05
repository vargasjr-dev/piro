"use client";

import { useState, useEffect, useCallback } from "react";

interface SourceRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  r2Prefix: string | null;
  scriptR2Key: string | null;
  sampleCount: number | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  files: string[]; // paths relative to r2Prefix, e.g. ["data/train.jsonl", "data/test.jsonl"]
}

// ── File tree ─────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;   // relative to r2Prefix, e.g. "data/train.jsonl"
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    let level = root;
    let accumulated = "";

    for (let i = 0; i < parts.length; i++) {
      accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
      const isLast = i === parts.length - 1;
      let existing = level.find((n) => n.name === parts[i]);
      if (!existing) {
        existing = { name: parts[i], path: accumulated, isDir: !isLast, children: [] };
        level.push(existing);
      }
      level = existing.children;
    }
  }

  return root;
}

function FileIcon({ name }: { name: string }) {
  if (name.endsWith(".jsonl")) {
    return (
      <span className="text-[9px] font-bold text-amber-600/40 w-4 text-center">JL</span>
    );
  }
  if (name.endsWith(".json")) {
    return (
      <span className="text-[9px] font-bold text-amber-600/40 w-4 text-center">{"{}"}</span>
    );
  }
  if (name.endsWith(".py")) {
    return (
      <span className="text-[9px] font-bold text-violet-500/50 w-4 text-center">py</span>
    );
  }
  return (
    <span className="text-[9px] text-amber-700/30 w-4 text-center">f</span>
  );
}

function TreeRow({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 w-full text-left py-0.5 hover:text-amber-300 transition-colors"
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          <svg
            className={`w-3 h-3 text-amber-700/40 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-[11px] text-amber-500/50">{node.name}/</span>
        </button>
        {open && node.children.map((child) => (
          <TreeRow key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-1.5 w-full text-left py-0.5 transition-colors ${
        isSelected ? "text-amber-100" : "text-amber-500/50 hover:text-amber-300"
      }`}
      style={{ paddingLeft: `${depth * 12 + 12}px` }}
    >
      <FileIcon name={node.name} />
      <span className="text-[11px] font-mono">{node.name}</span>
    </button>
  );
}

// ── File viewer ───────────────────────────────────────────────────────────────

function FileViewer({ sourceId, filePath }: { sourceId: string; filePath: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setError(null);
    setContent(null);

    fetch(`/api/data-sources/${sourceId}/file?path=${encodeURIComponent(filePath)}`)
      .then((r) => r.json())
      .then((d: { content?: string; truncated?: boolean; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setContent(d.content ?? "");
        setTruncated(d.truncated ?? false);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [sourceId, filePath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <svg className="animate-spin w-4 h-4 text-amber-600/40" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-red-400/60 p-4">{error}</p>
    );
  }

  if (content === null) {
    return (
      <div className="flex items-center justify-center h-40 text-amber-700/30 text-xs">
        Select a file to view its contents
      </div>
    );
  }

  // Pretty-print JSON
  let display = content;
  if (filePath.endsWith(".json")) {
    try { display = JSON.stringify(JSON.parse(content), null, 2); } catch { /* leave raw */ }
  }

  return (
    <div className="relative">
      {truncated && (
        <div className="px-4 py-1.5 border-b border-amber-900/15 bg-amber-900/10">
          <p className="text-[10px] text-amber-600/40">Showing first 50 KB — file truncated</p>
        </div>
      )}
      <pre className="text-[11px] font-mono text-amber-300/60 p-4 overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)] whitespace-pre-wrap break-words leading-relaxed">
        {display}
      </pre>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = "files" | "script";

export default function SourceDetail({ source: initialSource }: { source: SourceRow }) {
  const [source, setSource] = useState<SourceRow>(initialSource);
  const [tab, setTab] = useState<Tab>("files");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const hasData = source.r2Prefix !== null && source.generatedAt !== null;
  const hasScript = source.scriptR2Key !== null;

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/data-sources/${source.id}/generate`, { method: "POST" });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? "Failed"); }
      // Reload page to pick up new files
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setGenerating(false);
    }
  }

  const tree = buildTree(source.files);

  // Auto-select first file
  useEffect(() => {
    if (source.files.length > 0 && !selectedPath) {
      const firstFile = source.files.find((f) => !f.endsWith("/"));
      if (firstFile) setSelectedPath(firstFile);
    }
  }, [source.files, selectedPath]);

  const filePath = tab === "script" ? "script.py" : selectedPath;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Meta row */}
      <div className="px-4 py-3 border-b border-amber-900/15 flex items-center gap-4 text-[11px] shrink-0 flex-wrap">
        {source.sampleCount !== null && (
          <span className="text-amber-600/40">
            <span className="font-mono text-amber-500/60">{source.sampleCount.toLocaleString()}</span> samples
          </span>
        )}
        <span className="text-amber-700/30">
          Created {new Date(source.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <span className="text-amber-700/30">
          Updated {new Date(source.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
        {source.generatedAt ? (
          <span className="text-amber-600/40">
            Generated {new Date(source.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
        ) : (
          <span className="text-amber-700/30 italic">Not yet generated</span>
        )}
        <div className="ml-auto">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-orange-500/30 bg-orange-500/10 text-[11px] font-semibold text-amber-200/80 hover:bg-orange-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {hasData ? "Re-generate" : "Generate"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-amber-900/15 shrink-0">
        {(["files", "script"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            disabled={t === "script" && !hasScript}
            className={`px-4 py-2 text-xs font-medium transition-colors capitalize ${
              tab === t
                ? "text-amber-100 border-b-2 border-orange-500/60"
                : "text-amber-600/40 hover:text-amber-400/60 border-b-2 border-transparent"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content: split pane for files, full width for script */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {tab === "files" && (
          <>
            {/* File tree */}
            <div className="w-48 shrink-0 border-r border-amber-900/15 overflow-y-auto py-2 px-1">
              {tree.length === 0 ? (
                <p className="text-[11px] text-amber-700/30 px-3 py-2">No files yet</p>
              ) : (
                tree.map((node) => (
                  <TreeRow
                    key={node.path}
                    node={node}
                    depth={1}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                  />
                ))
              )}
            </div>

            {/* File content */}
            <div className="flex-1 min-w-0 overflow-auto">
              <FileViewer sourceId={source.id} filePath={selectedPath ?? ""} />
            </div>
          </>
        )}

        {tab === "script" && (
          <div className="flex-1 min-w-0 overflow-auto">
            <FileViewer sourceId={source.id} filePath="script.py" />
          </div>
        )}
      </div>
    </div>
  );
}
