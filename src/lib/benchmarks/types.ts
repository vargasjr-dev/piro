// ── Core types shared across all benchmarks ───────────────────────────────────

export interface BenchmarkResult {
  score: number;                        // 0.0 → 1.0
  passed: boolean;                      // score >= threshold
  threshold: number;
  durationMs: number;
  metadata: Record<string, unknown>;
}

/** Anything that can generate a response to a prompt */
export interface ModelAdapter {
  /** "gpt-4o-mini" | "gpt-4o" | "piro-student" */
  name: string;
  generate(prompt: string): Promise<string>;
}

export interface BenchmarkDef {
  name: string;
  threshold: number;
  run(model: ModelAdapter): Promise<BenchmarkResult>;
}
