import { describe, expect, test } from "bun:test";
import { architectureFromPath } from "../contracts";

describe("architectureFromPath", () => {
  test.each([
    ["architectures/ashfall/main.py", "ashfall"],
    ["/architectures/borealis/main.py/", "borealis"],
  ] as const)("resolves %s to %s", (path, expected) => {
    expect(architectureFromPath(path)).toBe(expected);
  });

  test.each([
    "architectures/ashfall",
    "architectures/ashfall/ctm.py",
    "architectures/ashfall/ctm_10x.py",
    "architectures/ctm.py",
    "model/ctm.py",
    "",
  ])("rejects non-entrypoint path %s", (path) => {
    expect(architectureFromPath(path)).toBeNull();
  });
});
