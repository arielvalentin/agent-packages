const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const fs = require("node:fs");
const yaml = require("js-yaml");

const script = "script/check-eval-shard-result.sh";

test("aggregate job checks out the helper before running it", () => {
  const workflow = yaml.load(fs.readFileSync(".github/workflows/eval-agent-defaults.yml", "utf8"));
  const steps = workflow.jobs.eval.steps;
  const checkoutIndex = steps.findIndex((step) =>
    step.uses === "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
  );
  const helperIndex = steps.findIndex((step) => step.run?.includes(script));
  assert.ok(fs.existsSync(script));
  assert.notEqual(checkoutIndex, -1);
  assert.ok(helperIndex > checkoutIndex);
});

test("aggregate accepts only a successful shard matrix", () => {
  for (const result of ["failure", "cancelled", "skipped", "timed_out", "action_required"]) {
    const rejected = spawnSync("bash", [script, result], { encoding: "utf8" });
    assert.equal(rejected.status, 1, `${result}: ${rejected.stdout}${rejected.stderr}`);
    assert.match(rejected.stdout, new RegExp(`completed with '${result}'`));
  }

  const success = spawnSync("bash", [script, "success"], { encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr);
});
