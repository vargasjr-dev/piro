import { describe, expect, test } from "bun:test";
import {
  architectureFromPath,
  architectureFromTrainingMetadata,
} from "../contracts";

describe("architectureFromPath", () => {
  test.each([
    ["architectures/ashfall", "ashfall"],
    ["architectures/ashfall/ctm.py", "ashfall"],
    ["architectures/borealis/main.py", "borealis"],
    ["architectures/ctm", "ashfall"],
    ["architectures/ctm.py", "ashfall"],
    ["model/ctm.py", "ashfall"],
    ["/piro/ctm.py/", "ashfall"],
  ] as const)("resolves %s to %s", (path, expected) => {
    expect(architectureFromPath(path)).toBe(expected);
  });

  test.each(["architectures/unknown/main.py", "baseline-transformer", ""])(
    "rejects unsupported path %s",
    (path) => {
      expect(architectureFromPath(path)).toBeNull();
    },
  );
});

describe("architectureFromTrainingMetadata", () => {
  test("prefers a supported architecture path over config metadata", () => {
    expect(
      architectureFromTrainingMetadata(
        "architectures/borealis/main.py",
        JSON.stringify({ template: "ctm" }),
      ),
    ).toBe("borealis");
  });

  test.each([
    [JSON.stringify({ template: "ctm" }), "ashfall"],
    [JSON.stringify({ modelTemplate: "ctm-10x" }), "ashfall"],
    [JSON.stringify({ architecture: "borealis" }), "borealis"],
  ] as const)("resolves explicit config %s to %s", (configJson, expected) => {
    expect(architectureFromTrainingMetadata(null, configJson)).toBe(expected);
  });

  test.each([null, "not-json", JSON.stringify({ template: "unknown" })])(
    "rejects missing or unsupported config %s",
    (configJson) => {
      expect(architectureFromTrainingMetadata(null, configJson)).toBeNull();
    },
  );
});
