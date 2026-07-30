import { describe, expect, test } from "bun:test";
import {
  encodeRepositoryFile,
  huggingFaceMigrationRequestSchema,
  modelPrefix,
} from "~/lib/huggingface-migration";

describe("Hugging Face migration request", () => {
  test("accepts a repository id and pinned revision", () => {
    const result = huggingFaceMigrationRequestSchema.safeParse({
      model: "google/gemma-3-270m",
      revision: "9b0cfec892e2bc2afd938c98eabe4e4a7b1e0ca1",
    });

    expect(result.success).toBe(true);
  });

  test("rejects path traversal in a model id", () => {
    const result = huggingFaceMigrationRequestSchema.safeParse({
      model: "../private/secret",
      revision: "main",
    });

    expect(result.success).toBe(false);
  });
});

test("modelPrefix_UsesStablePrivateStorageLayout", () => {
  expect(modelPrefix("google/gemma-3-270m", "main")).toBe(
    "models/google--gemma-3-270m/main",
  );
});

test("encodeRepositoryFile_PreservesDirectoriesAndEscapesSegments", () => {
  expect(encodeRepositoryFile("tokenizer files/tokenizer.json")).toBe(
    "tokenizer%20files/tokenizer.json",
  );
});
