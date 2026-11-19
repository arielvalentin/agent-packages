"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");
const { validateNativeSuite, validateRun, resolveRepositoryFile } = require("./validate-native-evals.js");
const { fixtureContent, fixtureSources, recipes } = require("./native-eval-fixtures.js");

const diagnosticNames = [63, 121, 164, 169, 189, 191, 211, 283]
  .map((index) => `agent-defaults-case-${String(index).padStart(3, "0")}-row-01`);
const names = [...diagnosticNames, "blocking-case"];
const evalFile = "packages/agent-defaults/evals/agent-defaults.eval.yaml";
const policyFile = "packages/agent-defaults/.apm/instructions/input.instructions.md";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-eval-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "packages/agent-defaults/evals"), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, policyFile)), { recursive: true });
  fs.writeFileSync(path.join(root, policyFile), "input");
  const stimuli = names.map((name, index) => ({
    name,
    tags: { suite: index === 1 ? "full" : "smoke", ...(index < 8 ? { diagnostic: "assertion-only" } : {}) },
    prompt: "Return ok.",
    agent_environment: { files: [{ src: "../.apm/instructions/input.instructions.md", dest: ".github/copilot-instructions.md" }] },
    graders: [{ name: `${name}-assertion`, type: "output-matches", config: { pattern: "ok" } }],
    simulation: { tool_overrides: { bash: { is_error: true } } },
  }));
  const spec = { name: "test-eval", stimuli };
  const save = () => fs.writeFileSync(path.join(root, evalFile), yaml.dump(spec));
  save();
  return { root, stimuli, spec, save };
}

function trial(name, passed = true) {
  return {
    type: "trial-result", evalName: "test-eval", evalFilePath: evalFile,
    variant: "default", itemId: `${evalFile}::default::_::${name}::trial-0`,
    stimulus: name, status: "success", durationMs: 1, trajectory: {},
    gradeResult: {
      passed, details: [{
        configuredName: `${name}-assertion`, graderType: "output-matches",
        passed, status: "success",
      }],
    },
  };
}

function summary(passed, count = names.length) {
  return {
    type: "run-summary", runId: "test", passed, hadExecutionErrors: false,
    evals: [{ name: "test-eval", evalFilePath: evalFile, variant: "default",
      passed, scoringApplied: true, stimuliRun: count, stimuliTotal: count, durationMs: 1 }],
  };
}

function records(failing = []) {
  return [...names.map((name) => trial(name, !failing.includes(name))), summary(!failing.length)];
}

test("canonical fixture recipes reproduce the checked-in compositions", () => {
  const root = path.resolve(__dirname, "..");
  assert.equal(Object.keys(recipes).length, 23);
  for (const fixture of Object.keys(recipes)) {
    for (const source of fixtureSources(fixture)) {
      assert.equal(path.posix.normalize(source), source);
      assert.ok(!source.startsWith("../") && !path.posix.isAbsolute(source));
    }
    assert.equal(fixtureContent(root, fixture, resolveRepositoryFile),
      fs.readFileSync(path.join(root, fixture), "utf8"), fixture);
  }
  assert.throws(() => fixtureContent(root, "unknown", resolveRepositoryFile), /provenance/);
});

test("native suite is authoritative and selects smoke by native tags", (t) => {
  const { root, stimuli } = fixture(t);
  const full = validateNativeSuite(root, "agent-defaults", "full");
  assert.deepEqual(full.errors, []);
  assert.deepEqual(full.selectedStimuli, stimuli);
  const smoke = validateNativeSuite(root, "agent-defaults", "smoke");
  assert.deepEqual(smoke.errors, []);
  assert.equal(smoke.selectedStimuli.length, names.length - 1);
  assert.equal(fs.existsSync(path.join(root, "docs/evaluations-migration-map.json")), false);
});

test("preflight rejects duplicate names, missing diagnostics, unsafe paths and executable shell", (t) => {
  const state = fixture(t);
  state.stimuli[0].name = state.stimuli[1].name;
  state.stimuli[2].agent_environment.files[0].src = "../../../../../../etc/passwd";
  state.stimuli[3].simulation.tool_overrides.bash.is_error = false;
  state.save();
  const errors = validateNativeSuite(state.root, "agent-defaults", "full").errors.join("\n");
  assert.match(errors, /duplicate/);
  assert.match(errors, /Missing approved diagnostic/);
  assert.match(errors, /unsafe/);
  assert.match(errors, /shell/);
});

test("patterned shell overrides require a failing default", (t) => {
  const validState = fixture(t);
  validState.stimuli[8].simulation.tool_overrides.bash = {
    patterns: [{ match: "^safe$", output: "Synthetic success" }],
    default: { output: "Blocked", is_error: true },
  };
  validState.save();
  assert.deepEqual(validateNativeSuite(validState.root, "agent-defaults", "full").errors, []);

  const invalidDefaults = [
    undefined,
    { output: "Unblocked default", is_error: false },
  ];

  for (const defaultOverride of invalidDefaults) {
    const state = fixture(t);
    state.stimuli[8].simulation.tool_overrides.bash = {
      is_error: true,
      patterns: [{ match: ".*", output: "Synthetic success" }],
      ...(defaultOverride ? { default: defaultOverride } : {}),
    };
    state.save();
    const errors = validateNativeSuite(state.root, "agent-defaults", "full").errors;
    assert.deepEqual(errors, ["blocking-case does not block shell command execution."]);
  }
});

test("preflight rejects unauthorized diagnostic tags and malformed or duplicate graders", (t) => {
  const state = fixture(t);
  state.stimuli[8].tags.diagnostic = "assertion-only";
  state.stimuli[0].graders.push({ ...state.stimuli[0].graders[0] });
  state.save();
  const errors = validateNativeSuite(state.root, "agent-defaults", "full").errors.join("\n");
  assert.match(errors, /diagnostic metadata/);
  assert.match(errors, /duplicate Vally grader/);
});

test("repository file resolution rejects traversal, symlinks, and directories", (t) => {
  const { root } = fixture(t);
  assert.throws(() => resolveRepositoryFile(root, root, "../outside", "test"), /escapes/);
  assert.throws(() => resolveRepositoryFile(root, root, "packages", "test"), /regular file/);
  fs.symlinkSync(path.join(root, policyFile), path.join(root, "link"));
  assert.throws(() => resolveRepositoryFile(root, root, "link", "test"), /symbolic link/);
});

test("preflight accepts only policy inputs and the workspace instruction destination", (t) => {
  const state = fixture(t);
  fs.writeFileSync(path.join(state.root, "packages/agent-defaults/notes.md"), "not eval input");
  state.stimuli[0].agent_environment.files[0].src = "../notes.md";
  state.stimuli[1].agent_environment.files[0].dest = ".github/other.md";
  state.save();
  const errors = validateNativeSuite(state.root, "agent-defaults", "full").errors.join("\n");
  assert.match(errors, /Native source is not an APM policy file or managed fixture/);
  assert.match(errors, /Native destination must be the workspace instructions file/);
});

test("native fixture drift is rejected through aliases and cross-package inputs", (t) => {
  const state = fixture(t);
  const fixtureName = "context-98344ee1e43a2e4a.md";
  const repositoryRoot = path.resolve(__dirname, "..");
  const source = "packages/agent-defaults/.apm/skills/human-interaction-safeguard/SKILL.md";
  const nativeFixture = `packages/agent-defaults/evals/fixtures/${fixtureName}`;
  for (const file of [source, nativeFixture]) {
    fs.mkdirSync(path.dirname(path.join(state.root, file)), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, file), path.join(state.root, file));
  }
  state.stimuli[0].agent_environment.files[0].src = `./fixtures/${fixtureName}`;
  state.save();
  assert.deepEqual(validateNativeSuite(state.root, "agent-defaults", "full").errors, []);
  const coordinatorFile = path.join(state.root, "packages/coordinator/evals/coordinator.eval.yaml");
  fs.mkdirSync(path.dirname(coordinatorFile), { recursive: true });
  const coordinatorStimulus = structuredClone(state.stimuli[0]);
  coordinatorStimulus.name = "coordinator-case";
  delete coordinatorStimulus.tags.diagnostic;
  coordinatorStimulus.agent_environment.files[0].src =
    `../../agent-defaults/evals/fixtures/${fixtureName}`;
  fs.writeFileSync(coordinatorFile, yaml.dump({ name: "coordinator", stimuli: [coordinatorStimulus] }));
  assert.deepEqual(validateNativeSuite(state.root, "coordinator", "full").errors, []);
  fs.appendFileSync(path.join(state.root, source), "drift");
  for (const packageName of ["agent-defaults", "coordinator"]) {
    assert.match(validateNativeSuite(state.root, packageName, "full").errors.join("\n"),
      /differs from its canonical composition/);
  }
  const untracked = path.join(state.root, "packages/agent-defaults/evals/fixtures/nested/untracked.md");
  fs.mkdirSync(path.dirname(untracked), { recursive: true });
  fs.writeFileSync(untracked, "untracked");
  coordinatorStimulus.agent_environment.files[0].src =
    "../../agent-defaults/evals/fixtures/nested/untracked.md";
  fs.writeFileSync(coordinatorFile, yaml.dump({ name: "coordinator", stimuli: [coordinatorStimulus] }));
  assert.match(validateNativeSuite(state.root, "coordinator", "full").errors.join("\n"),
    /Missing fixture provenance/);
});

test("all approved assertion failures are non-blocking, but required failures block", (t) => {
  const { root } = fixture(t);
  for (const name of diagnosticNames) {
    const result = validateRun(root, "agent-defaults", "full", records([name]));
    assert.deepEqual(result.errors, [], name);
    assert.equal(result.diagnostics.length, 1, name);
  }
  assert.match(validateRun(root, "agent-defaults", "full", records(["blocking-case"]))
    .errors.join("\n"), /failed required graders/);
});

test("trial and summary identities must bind to the planned eval", (t) => {
  const { root, stimuli } = fixture(t);
  const unrelatedEvalFile = "packages/agent-defaults/evals/unrelated.eval.yaml";
  fs.writeFileSync(path.join(root, unrelatedEvalFile), yaml.dump({
    name: "test-eval",
    stimuli,
  }));

  const unrelatedTrials = records();
  for (const record of unrelatedTrials.filter((item) => item.type === "trial-result")) {
    record.evalFilePath = unrelatedEvalFile;
    record.itemId = `${unrelatedEvalFile}::${record.variant}::_::${record.stimulus}::trial-0`;
  }
  assert.match(validateRun(root, "agent-defaults", "full", unrelatedTrials)
    .errors.join("\n"), /planned identity/);

  const unexpectedTrialName = records();
  unexpectedTrialName[0].evalName = "unrelated-eval";
  assert.match(validateRun(root, "agent-defaults", "full", unexpectedTrialName)
    .errors.join("\n"), /planned identity/);

  const unrelatedSummary = records();
  unrelatedSummary.at(-1).evals[0].evalFilePath = unrelatedEvalFile;
  assert.match(validateRun(root, "agent-defaults", "full", unrelatedSummary)
    .errors.join("\n"), /summary eval identity/);

  const unexpectedSummaryName = records();
  unexpectedSummaryName.at(-1).evals[0].name = "unrelated-eval";
  assert.match(validateRun(root, "agent-defaults", "full", unexpectedSummaryName)
    .errors.join("\n"), /summary eval identity/);
});

test("grader and run execution errors block diagnostic assertion failures", (t) => {
  const { root } = fixture(t);
  const graderError = records([diagnosticNames[0]]);
  graderError[0].gradeResult.details[0].status = "error";
  const graderResult = validateRun(root, "agent-defaults", "full", graderError);
  assert.match(graderResult.errors.join("\n"), /grader execution error/);
  assert.equal(graderResult.diagnostics.length, 0);

  const runError = records([diagnosticNames[0]]);
  runError.at(-1).hadExecutionErrors = true;
  const runResult = validateRun(root, "agent-defaults", "full", runError);
  assert.match(runResult.errors.join("\n"), /run-summary reports execution errors/);
  assert.equal(runResult.diagnostics.length, 1);

  const evalError = records([diagnosticNames[0]]);
  evalError.at(-1).evals[0].hadExecutionErrors = true;
  assert.match(validateRun(root, "agent-defaults", "full", evalError)
    .errors.join("\n"), /eval-summary reports execution errors/);
});

test("a diagnostic cannot hide a contradictory required grader failure", (t) => {
  const { root } = fixture(t);
  const items = records([diagnosticNames[0], "blocking-case"]);
  const requiredResult = items.find((item) =>
    item.type === "trial-result" && item.stimulus === "blocking-case"
  );
  requiredResult.gradeResult.passed = true;

  const result = validateRun(root, "agent-defaults", "full", items);
  assert.match(result.errors.join("\n"), /grade verdict contradicts/);
  assert.equal(result.diagnostics.length, 1);
});

test("the same stimulus identity cannot enable diagnostics in another package", (t) => {
  const state = fixture(t);
  const target = "packages/coordinator/evals/coordinator.eval.yaml";
  fs.mkdirSync(path.join(state.root, "packages/coordinator/evals"), { recursive: true });
  const stimulus = structuredClone(state.stimuli[0]);
  delete stimulus.tags.diagnostic;
  stimulus.agent_environment.files[0].src = `../../agent-defaults/${policyFile.split("/").slice(2).join("/")}`;
  fs.writeFileSync(path.join(state.root, target), yaml.dump({ name: "test-eval", stimuli: [stimulus] }));
  const failed = trial(stimulus.name, false);
  failed.evalFilePath = target;
  failed.itemId = `${target}::default::_::${stimulus.name}::trial-0`;
  const end = summary(false, 1);
  end.evals[0].evalFilePath = target;
  const result = validateRun(state.root, "coordinator", "full", [failed, end]);
  assert.equal(result.diagnostics.length, 0);
  assert.match(result.errors.join("\n"), /failed required graders/);
});

test("configured prompt graders count once regardless of their rubric leaves", (t) => {
  const { root, stimuli, save } = fixture(t);
  const stimulus = stimuli.at(-1);
  stimulus.rubric = ["Only ask to draft."];
  stimulus.graders.push({ name: "draft-only", type: "prompt", config: { scoring: "binary" } });
  save();

  function promptRun() {
    const items = records();
    const grade = items.at(-2).gradeResult;
    const rubric = {
      name: "prompt/Only ask to draft.", kind: "llm", passed: true,
      score: 1, evidence: "Only a draft was requested.", label: "correct",
    };
    const prompt = {
      name: "draft-only", configuredName: "draft-only", graderType: "prompt",
      kind: "llm", passed: true, score: 1, details: [rubric],
    };
    grade.details.push(prompt);
    return { items, grade, prompt, rubric };
  }
  const validate = (items) => validateRun(root, "agent-defaults", "full", items).errors;
  assert.deepEqual(validate(promptRun().items), []);
});

test("result inventory requires expected identities, configured graders, one result each, and no skips", (t) => {
  const { root } = fixture(t);
  const cases = [
    {
      label: "missing stimulus",
      mutate: (items) => items.splice(0, 1),
    },
    {
      label: "duplicate stimulus",
      mutate: (items) => items.unshift(items[0]),
    },
    {
      label: "unexpected stimulus identity",
      mutate: (items) => {
        items[0].stimulus = "unexpected";
        items[0].itemId = `${evalFile}::default::_::unexpected::trial-0`;
      },
    },
    {
      label: "mismatched result identity",
      mutate: (items) => { items[0].itemId += "-wrong"; },
    },
    {
      label: "missing grade",
      mutate: (items) => { items[0].gradeResult = null; },
    },
    {
      label: "missing configured grader",
      mutate: (items) => { items[0].gradeResult.details = []; },
    },
    {
      label: "configured grader missing verdict",
      mutate: (items) => { delete items[0].gradeResult.details[0].passed; },
    },
    {
      label: "unexpected configured grader",
      mutate: (items) => {
        items[0].gradeResult.details[0].configuredName = "unexpected";
      },
    },
    {
      label: "skipped stimulus",
      mutate: (items) => { items[0].status = "skipped"; },
    },
    {
      label: "incorrect expected count",
      mutate: (items) => { items.at(-1).evals[0].stimuliRun--; },
    },
    {
      label: "skipped summary count",
      mutate: (items) => { items.at(-1).evals[0].stimuliSkipped = 1; },
    },
    {
      label: "summary variant mismatch",
      mutate: (items) => { items.at(-1).evals[0].variant = "other"; },
    },
  ];
  for (const { label, mutate } of cases) {
    const items = records();
    mutate(items);
    assert.ok(validateRun(root, "agent-defaults", "full", items).errors.length, label);
  }
});
