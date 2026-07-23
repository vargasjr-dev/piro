// ── Core types shared across all benchmarks ───────────────────────────────────

export type TokenAccounting = "provider_usage" | "not_applicable";

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  tokenAccounting?: TokenAccounting;
}

export interface BenchmarkResult {
  score: number; // 0.0 → 1.0
  durationMs: number;
  costUsd: number; // total $ spent on API calls for this benchmark × target
  metadata: Record<string, unknown>;
}

/** Anything that can generate a response to a prompt */
export interface ModelAdapter {
  /** Human-readable model name shown in benchmark output. */
  name: string;
  /** Stable persisted identity, such as a model UUID or provider:model. */
  targetKey?: string;
  /** true = not a real model, results are noise */
  isStub?: boolean;
  generate(prompt: string): Promise<GenerateResult>;
  /** Generate one response per ordered invocation, preserving each boundary. */
  generateSequence?(inputs: string[]): Promise<GenerateResult>;
}

export interface BenchmarkContext {
  datasetR2Prefix?: string;
  episodes?: number;
}

export interface BenchmarkDef {
  name: string;
  run(
    model: ModelAdapter,
    context?: BenchmarkContext,
  ): Promise<BenchmarkResult>;
}
