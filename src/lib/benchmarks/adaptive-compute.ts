import type { BenchmarkDef, BenchmarkResult, ModelAdapter } from "./types";
import { SeededRng } from "./rng";

// ── Task generation ───────────────────────────────────────────────────────────

interface ArithmeticTask {
  prompt: string;
  answer: number;
  difficulty: "easy" | "hard";
}

type ArithOp = "+" | "-" | "*";

function applyOp(a: number, b: number, op: ArithOp | "//"): number {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  return Math.trunc(a / b); // integer division (//)
}

const EASY_OPS: (ArithOp | "//")[] = ["+", "-", "*", "//"];
const HARD_OPS: ArithOp[] = ["+", "-", "*"];

function makeEasyTask(rng: SeededRng): ArithmeticTask {
  const a = rng.randint(1, 20);
  const b = rng.randint(1, 20);
  const op = rng.choice(EASY_OPS);
  // avoid division by zero for //
  const safeB = op === "//" ? Math.max(b, 1) : b;
  const answer = applyOp(a, safeB, op);
  const expr = op === "//" ? `${a} // ${safeB}` : `${a} ${op} ${safeB}`;
  return {
    prompt: `What is ${expr}?\nResponse (integer only):`,
    answer,
    difficulty: "easy",
  };
}

function makeHardTask(rng: SeededRng): ArithmeticTask {
  const a = rng.randint(1, 10);
  const b = rng.randint(1, 10);
  const c = rng.randint(1, 10);
  const d = rng.randint(2, 5);
  const op1 = rng.choice(HARD_OPS);
  const op2 = rng.choice(HARD_OPS);

  const inner = a * b;
  const mid = applyOp(inner, c, op1);
  const answer = applyOp(mid, d, op2);

  const innerExpr = `${a} * ${b}`;
  const midExpr = `(${innerExpr}) ${op1} ${c}`;
  const expr = `(${midExpr}) ${op2} ${d}`;

  return {
    prompt: `What is ${expr}?\nResponse (integer only):`,
    answer,
    difficulty: "hard",
  };
}

function parseIntAnswer(text: string): number | null {
  const match = text.trim().match(/^-?\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return isNaN(n) ? null : n;
}

// ── Benchmark definition ──────────────────────────────────────────────────────

/**
 * AdaptiveCompute — easy (single-step arithmetic) vs hard (chained ops).
 *
 * Measures both accuracy and latency ratio (hard/easy) as a compute proxy.
 * Default: 10 easy + 10 hard tasks.
 */
export function makeAdaptiveCompute(opts?: {
  nEasy?: number;
  nHard?: number;
  seed?: number;
}): BenchmarkDef {
  const nEasy = opts?.nEasy ?? 10;
  const nHard = opts?.nHard ?? 10;
  const seed = opts?.seed ?? 42;

  const rng = new SeededRng(seed);
  const easyTasks = Array.from({ length: nEasy }, () => makeEasyTask(rng));
  const hardTasks = Array.from({ length: nHard }, () => makeHardTask(rng));

  return {
    name: "AdaptiveCompute",
    threshold: 0.6,

    async run(model: ModelAdapter): Promise<BenchmarkResult> {
      const start = Date.now();

      let easyCorrect = 0;
      const easyLatencies: number[] = [];
      const failureExamples: string[] = [];

      for (const task of easyTasks) {
        const t0 = Date.now();
        const response = await model.generate(task.prompt);
        easyLatencies.push(Date.now() - t0);
        const predicted = parseIntAnswer(response);
        if (predicted === task.answer) {
          easyCorrect++;
        } else if (failureExamples.length < 2) {
          failureExamples.push(
            `[easy] expected ${task.answer}, got "${response.slice(0, 40)}"`,
          );
        }
      }

      let hardCorrect = 0;
      const hardLatencies: number[] = [];

      for (const task of hardTasks) {
        const t0 = Date.now();
        const response = await model.generate(task.prompt);
        hardLatencies.push(Date.now() - t0);
        const predicted = parseIntAnswer(response);
        if (predicted === task.answer) {
          hardCorrect++;
        } else if (failureExamples.length < 3) {
          failureExamples.push(
            `[hard] expected ${task.answer}, got "${response.slice(0, 40)}"`,
          );
        }
      }

      const easyAccuracy = easyCorrect / easyTasks.length;
      const hardAccuracy = hardCorrect / hardTasks.length;
      const score = (easyAccuracy + hardAccuracy) / 2;

      const avgEasy =
        easyLatencies.reduce((a, b) => a + b, 0) / easyLatencies.length;
      const avgHard =
        hardLatencies.reduce((a, b) => a + b, 0) / hardLatencies.length;
      const latencyRatio = avgEasy > 0 ? avgHard / avgEasy : null;

      return {
        score,
        passed: score >= 0.6,
        threshold: 0.6,
        durationMs: Date.now() - start,
        metadata: {
          easy_correct: easyCorrect,
          easy_total: easyTasks.length,
          hard_correct: hardCorrect,
          hard_total: hardTasks.length,
          avg_easy_ms: Math.round(avgEasy),
          avg_hard_ms: Math.round(avgHard),
          latency_ratio: latencyRatio !== null ? Math.round(latencyRatio * 100) / 100 : null,
          failure_examples: failureExamples,
        },
      };
    },
  };
}

export const adaptiveCompute = makeAdaptiveCompute();
