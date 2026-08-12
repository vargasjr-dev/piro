import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routeSource = readFileSync(
  fileURLToPath(new URL("../../admin/models/[id]/route.ts", import.meta.url)),
  "utf8",
);

describe("admin model delete route", () => {
  test("requires admin request authentication", () => {
    expect(routeSource).toContain("if (!requestAuth)");
    expect(routeSource).toContain("if (!requestAuth.isAdmin)");
    expect(routeSource).toContain("status: 401");
    expect(routeSource).toContain("status: 403");
  });

  test("cleans model weights before deleting the model row", () => {
    expect(routeSource).toContain("r2DeletePrefix(found.weightsR2Key)");
    expect(routeSource).toContain("await db.delete(model)");
  });
});
