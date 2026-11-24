import assert from "node:assert/strict";
import fs from "node:fs";
import { createDefaultGraderRegistry } from "@microsoft/vally";

const registry = createDefaultGraderRegistry();
const checks = JSON.parse(fs.readFileSync(0, "utf8"));
const failures = [];
for (const [stimulus, output, expected] of checks) {
  assert.ok(stimulus.graders.length, `${stimulus.name}: missing graders`);
  const results = await Promise.all(stimulus.graders.map(async ({ type, config }) => {
    const grader = registry.get(type);
    assert.ok(grader, `${stimulus.name}: unknown grader ${type}`);
    const trajectory = { output };
    const result = await grader.grade({ trajectory, config }, config);
    assert.notEqual(result.status, "error", `${stimulus.name}: ${result.evidence}`);
    assert.equal(typeof result.passed, "boolean", `${stimulus.name}: missing grader verdict`);
    return result;
  }));
  if (results.every(({ passed }) => passed) !== expected) {
    failures.push(`${stimulus.name}: expected ${expected} for ${JSON.stringify(output)}`);
  }
}
assert.equal(failures.length, 0, failures.join("\n"));
console.log(`OK: ${checks.length} native policy grader regressions.`);
