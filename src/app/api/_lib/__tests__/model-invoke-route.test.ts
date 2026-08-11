import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routeSource = readFileSync(
  fileURLToPath(new URL("../../models/[id]/invoke/route.ts", import.meta.url)),
  "utf8",
);

describe("model invoke route identity contract", () => {
  test("accepts both persisted UUIDs and model keys", () => {
    expect(routeSource).toContain(
      "or(eq(model.id, modelKey), eq(model.name, modelKey))",
    );
  });

  test("passes the resolved persisted model ID to inference", () => {
    expect(routeSource).toContain("modelId: visibleModel.id");
    expect(routeSource).toContain("visibleModel.id,");
  });
});
