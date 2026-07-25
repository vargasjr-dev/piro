import { strict as assert } from "node:assert";
import { architecturePath } from "./architectures.js";

assert.equal(architecturePath("ctm"), "architectures/ctm");
assert.equal(architecturePath("/architectures/ctm/"), "architectures/ctm");
