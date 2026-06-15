/**
 * Seeded PRNG — Mulberry32.
 * Deterministic across runs; seed is a 32-bit unsigned integer.
 *
 * Intentionally does NOT try to match Python's random.Random (which uses
 * Mersenne Twister + a non-deterministic hash seed by default).  The goal
 * is stable TypeScript-side reproducibility, not cross-language equivalence.
 */
export class SeededRng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Float in [0, 1) */
  private next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [lo, hi] inclusive */
  randint(lo: number, hi: number): number {
    return Math.floor(this.next() * (hi - lo + 1)) + lo;
  }

  /** Pick one element at random */
  choice<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick n distinct elements (Fisher-Yates partial shuffle) */
  sample<T>(arr: readonly T[], n: number): T[] {
    const copy = [...arr];
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(this.next() * (copy.length - i));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }
}

/** Convenience: derive a child seed from a parent seed + a string tag */
export function childSeed(parent: number, tag: string): number {
  let h = parent;
  for (let i = 0; i < tag.length; i++) {
    h = (Math.imul(31, h) + tag.charCodeAt(i)) >>> 0;
  }
  return h;
}
