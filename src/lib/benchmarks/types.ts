// ── Core types shared across all benchmarks ───────────────────────────────────

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface BenchmarkResult {
  score: number;                        // 0.0 → 1.0
  durationMs: number;
  costUsd: number;                      // total $ spent on API calls for this benchmark × target
  metadata: Record<string, unknown>;
}

/** Anything that can generate a response to a prompt */
export interface ModelAdapter {
  /** "gpt-4o-mini" | "gpt-4o" | "piro-student" */
  name: string;
  /** true = not a real model, results are noise */
  isStub?: boolean;
  generate(prompt: string): Promise<GenerateResult>;
}

export interface BenchmarkDef {
  name: string;
  run(model: ModelAdapter): Promise<BenchmarkResult>;
}
