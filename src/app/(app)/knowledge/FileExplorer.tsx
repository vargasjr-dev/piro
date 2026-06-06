"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ---- Tree building ----

interface TreeNode {
  name: string;
  path: string; // full path from root e.g. "data/github/owner/repo"
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "data", path: "data", isDir: true, children: [] };

  for (const p of paths) {
    // paths come in as "data/github/owner/repo/commits/sha.md"
    const parts = p.split("/").filter(Boolean);
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");

      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: childPath, isDir: !isLast, children: [] };
        node.children.push(child);
      }
      if (!isLast) node = child;
    }
  }

  // Sort: dirs first, then files, alpha within each group
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

// ---- Icons ----

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={open ? "text-amber-400" : "text-amber-600/70"}>
      {open ? (
        <path d="M2 6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v1H2V6zm0 4h20v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8z" />
      ) : (
        <path d="M2 6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      )}
    </svg>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop() ?? "";
  const color =
    ext === "md" ? "text-amber-400/60" :
    ext === "json" ? "text-yellow-400/60" :
    "text-amber-400/40";
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={color}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      className={`text-amber-600/50 transition-transform duration-100 ${open ? "rotate-90" : ""}`}>
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- Provider color accent ----
function providerAccent(name: string): string {
  if (name === "github") return "text-slate-300";
  if (name === "email") return "text-red-400/80";
  if (name === "telegram") return "text-sky-400/80";
  return "text-amber-200/70";
}

// ---- Tree node renderer ----

function TreeNodeRow({
  node,
  depth,
  defaultOpen,
}: {
  node: TreeNode;
  depth: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const isProviderDir = depth === 1; // data/github, data/email, etc.
  const nameColor = isProviderDir ? providerAccent(node.name) : "text-amber-200/70";
  const indent = depth * 16;

  if (!node.isDir) {
    const label = node.name.replace(/\.md$/, "");
    return (
      <div
        className="flex items-center gap-1.5 py-[3px] px-2 rounded hover:bg-amber-900/20 cursor-default group"
        style={{ paddingLeft: `${indent + 8}px` }}
        title={node.path}
      >
        <FileIcon name={node.name} />
        <span className="text-xs text-amber-400/50 truncate group-hover:text-amber-300/60 transition-colors">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 py-[3px] px-2 rounded hover:bg-amber-900/20 transition-colors"
        style={{ paddingLeft: `${indent}px` }}
      >
        <ChevronIcon open={open} />
        <FolderIcon open={open} />
        <span className={`text-xs font-medium truncate ${nameColor}`}>
          {node.name}
        </span>
        {node.children.length > 0 && (
          <span className="ml-auto text-[10px] text-amber-600/40 pr-1">
            {node.children.length}
          </span>
        )}
      </button>
      {open && node.children.map((child) => (
        <TreeNodeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          defaultOpen={false}
        />
      ))}
    </div>
  );
}

// ---- Main component ----

export default function FileExplorer({ integrationCount }: { integrationCount: number }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      if (!res.ok) throw new Error("Failed to load files");
      const data = (await res.json()) as { paths: string[] };
      setPaths(data.paths);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Re-fetch when the page regains focus (after a sync)
  useEffect(() => {
    const handler = () => fetchFiles();
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [fetchFiles]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-amber-400/40 text-sm py-8 px-2">
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
        </svg>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400/70 text-sm py-4 px-2">{error}</div>
    );
  }

  if (paths.length === 0) {
    return (
      <div className="border border-dashed border-amber-900/30 rounded-2xl p-12 flex flex-col items-center text-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-900/20 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-600/50">
            <path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="text-amber-200/40 text-sm font-medium mb-1">/data is empty</p>
          <p className="text-amber-400/25 text-xs max-w-xs">
            {integrationCount === 0
              ? "Connect an integration above, then hit Sync."
              : "Hit Sync on a connected integration to start filling your workspace."}
          </p>
        </div>
      </div>
    );
  }

  const tree = buildTree(paths);

  return (
    <div className="rounded-2xl border border-amber-900/25 bg-[#0e0a05] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-900/20">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-amber-500/60 font-medium">/data</span>
          <span className="text-xs text-amber-600/30">·</span>
          <span className="text-xs text-amber-600/40">{paths.length.toLocaleString()} files</span>
        </div>
        <button
          onClick={() => { setLoading(true); fetchFiles(); }}
          className="text-[10px] text-amber-600/40 hover:text-amber-400/60 transition-colors px-2 py-1 rounded hover:bg-amber-900/20"
        >
          ↻ refresh
        </button>
      </div>

      {/* Tree */}
      <div className="py-2 px-1 font-mono">
        {tree.children.map((child) => (
          <TreeNodeRow
            key={child.path}
            node={child}
            depth={1}
            defaultOpen={true}
          />
        ))}
      </div>
    </div>
  );
}
