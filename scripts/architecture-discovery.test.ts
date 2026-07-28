import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { discoverArchitectureEntrypoints } from "./architecture-discovery";

describe("discoverArchitectureEntrypoints", () => {
  test("finds only sorted canonical main.py entrypoints", () => {
    const root = mkdtempSync(join(tmpdir(), "piro-architectures-"));
    mkdirSync(join(root, "zeta"));
    mkdirSync(join(root, "alpha"));
    mkdirSync(join(root, "missing"));
    mkdirSync(join(root, "nested", "not-an-architecture"), { recursive: true });
    writeFileSync(join(root, "zeta", "main.py"), "# zeta");
    writeFileSync(join(root, "alpha", "main.py"), "# alpha");
    writeFileSync(join(root, "missing", "model.py"), "# not canonical");
    writeFileSync(
      join(root, "nested", "not-an-architecture", "main.py"),
      "# too deep",
    );

    expect(discoverArchitectureEntrypoints(root)).toEqual([
      join(root, "alpha", "main.py"),
      join(root, "zeta", "main.py"),
    ]);
  });
});
