import { strict as assert } from "node:assert";
import { architecturePath } from "./architectures.js";

assert.equal(architecturePath("ctm"), "architectures/ashfall/ctm.py");
assert.equal(architecturePath("ashfall/ctm"), "architectures/ashfall/ctm.py");
assert.equal(architecturePath("ctm-10x"), "architectures/ashfall/ctm_10x.py");
assert.equal(architecturePath("/architectures/ashfall/ctm/"), "architectures/ashfall/ctm.py");
assert.equal(architecturePath("/architectures/ashfall/ctm.py/"), "architectures/ashfall/ctm.py");
