import { describe, expect, it } from "bun:test";
import { modelIdSchema } from "~/lib/model-identifiers";

describe("modelIdSchema", () => {
  it("normalizes valid model IDs", () => {
    expect(modelIdSchema.parse("  Borealis-Pelican-Floor ")).toBe(
      "borealis-pelican-floor",
    );
  });

  it.each(["short", "piro-model", "PIRO-private", "borealis-global"])(
    "rejects reserved or too-short ID %s",
    (value) => {
      expect(modelIdSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects malformed separators", () => {
    expect(modelIdSchema.safeParse("borealis--pelican").success).toBe(false);
    expect(modelIdSchema.safeParse("borealis pelican").success).toBe(false);
  });
});
