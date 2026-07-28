import { strict as assert } from "node:assert";
import { architecturePath } from "./architectures.js";

const cases = [
  ["ashfall", "architectures/ashfall/main.py"],
  ["borealis", "architectures/borealis/main.py"],
  ["new-architecture", "architectures/new-architecture/main.py"],
  [
    "architectures/new-architecture",
    "architectures/new-architecture/main.py",
  ],
  [
    "architectures/new-architecture/main.py",
    "architectures/new-architecture/main.py",
  ],
  ["/architectures/v2_model/", "architectures/v2_model/main.py"],
] as const;

for (const [name, expected] of cases) {
  assert.equal(architecturePath(name), expected);
}

assert.throws(
  () => architecturePath("  "),
  /architecture name is required/,
);

console.log("architecture command tests passed");
