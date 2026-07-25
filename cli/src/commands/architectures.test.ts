import { strict as assert } from "node:assert";
import { architecturePath } from "./architectures.js";

assert.equal(architecturePath("ctm"), "architectures/ctm");
assert.equal(
  architecturePath("experiments/ashfall/architectures/ctm"),
  "experiments/ashfall/architectures/ctm",
);
assert.equal(
  architecturePath("experiments/borealis/architectures/borealis"),
  "experiments/borealis/architectures/borealis",
);
assert.equal(architecturePath("/architectures/ctm/"), "architectures/ctm");
