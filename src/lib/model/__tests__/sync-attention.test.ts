import { describe, expect, test } from "bun:test";
import { SyncAttention } from "../sync-attention";

// ── Helpers ───────────────────────────────────────────────────────────────────

function identitySync(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}

function uniformSync(n: number, v = 0.5): number[][] {
  return Array.from({ length: n }, () => Array(n).fill(v));
}

// ── Output shape ──────────────────────────────────────────────────────────────

describe("SyncAttention — output shape", () => {
  test("single embedding returns value-dim vector", () => {
    const attn = new SyncAttention({
      nNeurons: 4, embedDim: 8, queryDim: 4, valueDim: 6,
    });
    const ctx = attn.forward(
      identitySync(4),
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    );
    expect(ctx).toHaveLength(6);
  });

  test("multiple embeddings returns value-dim vector", () => {
    const attn = new SyncAttention({
      nNeurons: 3, embedDim: 4, queryDim: 4, valueDim: 5,
    });
    const embeddings = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
    const ctx = attn.forward(identitySync(3), embeddings);
    expect(ctx).toHaveLength(5);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("SyncAttention — determinism", () => {
  test("same input twice returns same output", () => {
    const attn = new SyncAttention({
      nNeurons: 3, embedDim: 4, queryDim: 4, valueDim: 4,
    });
    const sync = identitySync(3);
    const emb = [1, 2, 3, 4];
    expect(attn.forward(sync, emb)).toEqual(attn.forward(sync, emb));
  });

  test("same seed produces identical weights", () => {
    const cfg = { nNeurons: 3, embedDim: 4, queryDim: 4, valueDim: 4 };
    const a = new SyncAttention(cfg, 99);
    const b = new SyncAttention(cfg, 99);
    const sync = identitySync(3);
    const emb = [1, 2, 3, 4];
    expect(a.forward(sync, emb)).toEqual(b.forward(sync, emb));
  });
});

// ── Uniform-attention property ─────────────────────────────────────────────────

describe("SyncAttention — uniform attention", () => {
  test("identical embeddings produce context equal to single", () => {
    // When all embeddings are identical, softmax weights are all 1/seqLen
    // and the weighted sum of the values equals the value itself.
    const attn = new SyncAttention({
      nNeurons: 2, embedDim: 3, queryDim: 3, valueDim: 3,
    });
    const emb = [1, 2, 3];
    const single = attn.forward(identitySync(2), emb);
    const two = attn.forward(identitySync(2), [emb, emb]);
    for (let i = 0; i < single.length; i++) {
      expect(two[i]).toBeCloseTo(single[i], 6);
    }
  });
});

// ── Sync matrix sensitivity ───────────────────────────────────────────────────

describe("SyncAttention — sync matrix sensitivity", () => {
  test("different sync matrices produce different contexts", () => {
    // With a single embedding, softmax([score]) = [1.0] always.
    // Need multiple distinct embeddings so attention weights shift the mix.
    const attn = new SyncAttention({
      nNeurons: 3, embedDim: 4, queryDim: 4, valueDim: 4,
    });
    const embeddings = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ];
    const ctxIdentity = attn.forward(identitySync(3), embeddings);
    const ctxUniform = attn.forward(uniformSync(3), embeddings);
    const same = ctxIdentity.every((v, i) => Math.abs(v - ctxUniform[i]) < 1e-9);
    expect(same).toBe(false);
  });

  test("flat vs wrapped embedding produces same result", () => {
    const attn = new SyncAttention({
      nNeurons: 2, embedDim: 4, queryDim: 4, valueDim: 4,
    });
    const sync = identitySync(2);
    const emb = [1, 2, 3, 4];
    expect(attn.forward(sync, emb)).toEqual(attn.forward(sync, [emb]));
  });
});
