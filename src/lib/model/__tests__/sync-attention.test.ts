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
  test("forward_SingleEmbedding_ReturnsValueDimVector", () => {
    const attn = new SyncAttention({
      nNeurons: 4, embedDim: 8, queryDim: 4, valueDim: 6,
    });
    const ctx = attn.forward(identitySync(4), [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    expect(ctx).toHaveLength(6);
  });

  test("forward_MultipleEmbeddings_ReturnsValueDimVector", () => {
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
  test("forward_SameInputTwice_ReturnsSameOutput", () => {
    const attn = new SyncAttention({
      nNeurons: 3, embedDim: 4, queryDim: 4, valueDim: 4,
    });
    const sync = identitySync(3);
    const emb = [1, 2, 3, 4];
    const a = attn.forward(sync, emb);
    const b = attn.forward(sync, emb);
    expect(a).toEqual(b);
  });

  test("forward_SameSeedTwoInstances_ReturnsSameOutput", () => {
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
  test("forward_IdenticalEmbeddings_ContextEqualsProjectedValue", () => {
    // When all embeddings are identical, softmax weights are all 1/seqLen
    // and the context = W_v · emb (since the weighted sum is just the value itself)
    const attn = new SyncAttention({
      nNeurons: 2, embedDim: 3, queryDim: 3, valueDim: 3,
    });
    const emb = [1, 2, 3];
    const singleCtx = attn.forward(identitySync(2), emb);
    const twoSameCtx = attn.forward(identitySync(2), [emb, emb]);
    // Both should produce the same context (uniform attention over identical values)
    for (let i = 0; i < singleCtx.length; i++) {
      expect(twoSameCtx[i]).toBeCloseTo(singleCtx[i], 6);
    }
  });
});

// ── Sync matrix sensitivity ───────────────────────────────────────────────────

describe("SyncAttention — sync matrix sensitivity", () => {
  test("forward_DifferentSyncMatrices_ProduceDifferentContexts", () => {
    // With a single embedding, softmax([score]) = [1.0] always — the sync
    // matrix has no effect. We need multiple, distinct embeddings so that
    // the attention weights (derived from the query) actually shift the mix.
    const attn = new SyncAttention({
      nNeurons: 3, embedDim: 4, queryDim: 4, valueDim: 4,
    });
    const embeddings = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ];
    const ctxIdentity = attn.forward(identitySync(3), embeddings);
    const ctxUniform  = attn.forward(uniformSync(3), embeddings);
    // Different query (from sync) → different attention weights → different mix of values
    const same = ctxIdentity.every((v, i) => Math.abs(v - ctxUniform[i]) < 1e-9);
    expect(same).toBe(false);
  });

  test("forward_SingleVsWrappedEmbedding_SameResult", () => {
    // Passing a flat vector vs [[...]] should produce the same output
    const attn = new SyncAttention({
      nNeurons: 2, embedDim: 4, queryDim: 4, valueDim: 4,
    });
    const sync = identitySync(2);
    const emb = [1, 2, 3, 4];
    const flat   = attn.forward(sync, emb);
    const nested = attn.forward(sync, [emb]);
    expect(flat).toEqual(nested);
  });
});
