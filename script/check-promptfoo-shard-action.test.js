const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const yaml = require("js-yaml");

test("sharded eval action validates configuration before running Promptfoo", () => {
  const action = yaml.load(fs.readFileSync(".github/actions/eval-package/action.yml", "utf8"));
  const steps = action.runs.steps;
  const preflightIndex = steps.findIndex((step) =>
    step.run?.includes("node script/check-promptfoo-shards.js")
  );
  const evalIndex = steps.findIndex((step) => step.run?.includes("npx promptfoo eval"));

  assert.notEqual(preflightIndex, -1);
  assert.notEqual(evalIndex, -1);
  assert.ok(preflightIndex < evalIndex);
  assert.equal(steps[preflightIndex].if, "${{ inputs.shard != '' }}");
  assert.notEqual(steps[preflightIndex].continueOnError, true);
  assert.equal(steps[evalIndex].if, undefined);
  assert.notEqual(steps[evalIndex].continueOnError, true);
});
