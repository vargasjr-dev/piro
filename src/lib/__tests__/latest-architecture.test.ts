import { describe, expect, it } from "bun:test";
import { getCurrentPiroArchitecture } from "~/lib/latest-architecture";

describe("getCurrentPiroArchitecture", () => {
  it("resolves the Ashfall architecture track as the current model", () => {
    expect(getCurrentPiroArchitecture()).toEqual({
      architecture: "ashfall",
      architecturePath: "architectures/ashfall/main.py",
      label: "Piro · Ashfall",
    });
  });
});
