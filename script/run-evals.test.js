"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { validateNativeSuite } = require("./validate-native-evals.js");
const { parseArgs, selectedEvalSpec, selectionArgs } = require("./run-evals.js");

const root = path.resolve(__dirname, "..");

test("selected eval specs retain shared native config and exact stimulus definitions", () => {
  const preflight = validateNativeSuite(root, "agent-defaults", "full");
  assert.deepEqual(preflight.errors, []);
  const names = preflight.expectedEntries.slice(0, 2).map((entry) => entry.targetStimulus);
  const spec = selectedEvalSpec(preflight, names);
  assert.equal(spec.name, preflight.evalSpec.name);
  assert.deepEqual(spec.defaults, preflight.evalSpec.defaults);
  assert.deepEqual(spec.scoring, preflight.evalSpec.scoring);
  assert.deepEqual(spec.stimuli, preflight.stimuli.filter((item) => names.includes(item.name)));
});

test("selected eval specs reject empty, duplicate, and unmapped selections", () => {
  const preflight = validateNativeSuite(root, "agent-defaults", "smoke");
  assert.deepEqual(preflight.errors, []);
  const name = preflight.expectedEntries[0].targetStimulus;
  assert.throws(() => selectedEvalSpec(preflight, []), /nonempty/);
  assert.throws(() => selectedEvalSpec(preflight, [name, name]), /unique/);
  assert.throws(() => selectedEvalSpec(preflight, ["unknown-stimulus"]), /validated suite/);
});

test("selected eval specs use the selected native inventory rather than source rows", () => {
  const smoke = { name: "smoke", tags: { suite: "smoke" } };
  const full = { name: "full", tags: { suite: "full" } };
  const preflight = {
    evalSpec: { name: "example" },
    stimuli: [smoke, full],
    selectedStimuli: [smoke],
  };
  assert.deepEqual(selectedEvalSpec(preflight, ["smoke"]).stimuli, [smoke]);
  assert.throws(() => selectedEvalSpec(preflight, ["full"]), /validated suite/);
});

test("runner accepts only a JSON stimulus list after the package and suite", () => {
  assert.deepEqual(parseArgs(["agent-defaults", "smoke"]), {
    packageName: "agent-defaults",
    suite: "smoke",
  });
  assert.deepEqual(parseArgs(["agent-defaults", "full", "--stimuli", '["case-1"]']), {
    packageName: "agent-defaults",
    suite: "full",
    stimulusNames: ["case-1"],
  });
  assert.throws(() => parseArgs(["agent-defaults"]), /Usage/);
  assert.throws(() => parseArgs(["agent-defaults", "smoke", "--unknown"]), /Usage/);
  assert.throws(() => parseArgs(["agent-defaults", "smoke", "--stimuli", "{"]), /JSON/);
});

test("runner uses configured package suites unless selecting specific stimuli", () => {
  assert.deepEqual(selectionArgs("agent-defaults", "smoke", "/eval.yaml"), [
    "--suite",
    "agent-defaults-smoke",
  ]);
  assert.deepEqual(selectionArgs("development-workflow", "full", "/eval.yaml"), [
    "--suite",
    "development-workflow-full",
  ]);
  assert.deepEqual(selectionArgs("agent-defaults", "full", "/selected.eval.yaml", ["case-1"]), [
    "--eval-spec",
    "/selected.eval.yaml",
  ]);
});
