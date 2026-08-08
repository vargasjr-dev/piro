import { describe, expect, test } from "bun:test";
import {
  formatArchitecturePath,
  formatDate,
  formatSourcePath,
} from "../training-run-admin";

describe("training run admin display helpers", () => {
  test("formatDate_should_use_eastern_time_when_given_utc_timestamp", () => {
    expect(formatDate(new Date("2026-08-08T16:00:00.000Z"))).toBe(
      "Aug 8, 2026, 12:00 PM EDT",
    );
  });

  test("formatSourcePath_should_remove_experiment_prefix", () => {
    expect(
      formatSourcePath("experiments/ashfall/sources/owner-policy-worlds"),
    ).toBe("sources/owner-policy-worlds");
  });

  test("formatArchitecturePath_should_show_architecture_name", () => {
    expect(formatArchitecturePath("architectures/borealis/main.py")).toBe(
      "borealis",
    );
  });
});
