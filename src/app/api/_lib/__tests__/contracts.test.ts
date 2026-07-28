import { describe, expect, test } from "bun:test";
import { architectureFromPath } from "../contracts";

describe("architectureFromPath", () => {
  test.each([
    ["architectures/ashfall/main.py", "ashfall"],
    ["/architectures/borealis/main.py/", "borealis"],
    ["architectures/new-architecture/main.py", "new-architecture"],
    ["architectures/v2_model/main.py", "v2_model"],
  ] as const)("resolves %s to %s", (path, expected) => {
    expect(architectureFromPath(path)).toBe(expected);
  });

  test.each([
    "architectures/ashfall",
    "architectures/ashfall/model.py",
    "architectures/ashfall/main.py.bak",
    "architectures/ashfall/ctm_10x.py",
    "architectures/../secret/main.py",
    "architectures/-invalid/main.py",
    "model/ctm.py",
    "",
  ])("rejects non-canonical path %s", (path) => {
    expect(architectureFromPath(path)).toBeNull();
  });
});
