import { strict as assert } from "node:assert";
import { estimateTraining } from "./training.js";

const shortRun = estimateTraining(250, 1.5);
assert.equal(shortRun.estimatedRuntimeSeconds, 375);
assert.equal(shortRun.estimatedBilledSeconds, 375);
assert.equal(shortRun.gpu, "T4");
assert.equal(shortRun.costBasis, "modal_standard_estimate");

const cappedRun = estimateTraining(5000, 1.5);
assert.equal(cappedRun.estimatedRuntimeSeconds, 7500);
assert.equal(cappedRun.estimatedBilledSeconds, 3000);
assert.equal(cappedRun.deadlineSeconds, 3000);
