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
  const companionFile = path.join(
    state.root,
    "packages/development-workflow/evals/development-workflow.eval.yaml"
  );
  fs.mkdirSync(path.dirname(companionFile), { recursive: true });
  const companionStimulus = structuredClone(state.stimuli[0]);
  companionStimulus.name = "development-workflow-case";
  delete companionStimulus.tags.diagnostic;
  companionStimulus.agent_environment.files[0].src =
    `../../agent-defaults/evals/fixtures/${fixtureName}`;
  fs.writeFileSync(
    companionFile,
    yaml.dump({ name: "development-workflow", stimuli: [companionStimulus] })
  );
  assert.deepEqual(validateNativeSuite(state.root, "development-workflow", "full").errors, []);
  fs.appendFileSync(path.join(state.root, source), "drift");
  for (const packageName of ["agent-defaults", "development-workflow"]) {
    assert.match(validateNativeSuite(state.root, packageName, "full").errors.join("\n"),
      /differs from its canonical composition/);
  }
  const untracked = path.join(state.root, "packages/agent-defaults/evals/fixtures/nested/untracked.md");
  fs.mkdirSync(path.dirname(untracked), { recursive: true });
  fs.writeFileSync(untracked, "untracked");
  companionStimulus.agent_environment.files[0].src =
    "../../agent-defaults/evals/fixtures/nested/untracked.md";
  fs.writeFileSync(
    companionFile,
    yaml.dump({ name: "development-workflow", stimuli: [companionStimulus] })
  );
  assert.match(validateNativeSuite(state.root, "development-workflow", "full").errors.join("\n"),
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
  const aggregateError = records([diagnosticNames[0]]);
  aggregateError[0].gradeResult.status = "error";
  const aggregateResult = validateRun(root, "agent-defaults", "full", aggregateError);
  assert.match(aggregateResult.errors.join("\n"), /grader execution error/);
  assert.equal(aggregateResult.diagnostics.length, 0);

  const successfulAggregate = records([diagnosticNames[0]]);
  successfulAggregate[0].gradeResult.status = "success";
  const successResult = validateRun(root, "agent-defaults", "full", successfulAggregate);
  assert.equal(successResult.errors.length, 0);
  assert.equal(successResult.diagnostics.length, 1);

  const emptyAggregateStatus = records([diagnosticNames[0]]);
  emptyAggregateStatus[0].gradeResult.status = "";
  assert.match(validateRun(root, "agent-defaults", "full", emptyAggregateStatus)
    .errors.join("\n"), /grader execution error/);

  const passingAggregateError = records();
  passingAggregateError[0].gradeResult.status = "error";
  assert.match(validateRun(root, "agent-defaults", "full", passingAggregateError)
    .errors.join("\n"), /grader execution error/);

  const malformedAggregate = records([diagnosticNames[0]]);
  malformedAggregate[0].gradeResult.status = 0;
  assert.match(validateRun(root, "agent-defaults", "full", malformedAggregate)
    .errors.join("\n"), /malformed grade result/);

  const graderError = records([diagnosticNames[0]]);
  graderError[0].gradeResult.details[0].status = "error";
  const graderResult = validateRun(root, "agent-defaults", "full", graderError);
  assert.match(graderResult.errors.join("\n"), /grader execution error/);
  assert.equal(graderResult.diagnostics.length, 0);

  const emptyGraderStatus = records([diagnosticNames[0]]);
  emptyGraderStatus[0].gradeResult.details[0].status = "";
  assert.match(validateRun(root, "agent-defaults", "full", emptyGraderStatus)
    .errors.join("\n"), /grader execution error/);

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

test("nested grader failures cannot contradict passing parents or become diagnostics", (t) => {
  const { root } = fixture(t);
  const passing = records();
  passing[0].gradeResult.details[0].details = [
    { graderType: "nested", passed: true, details: [{ graderType: "nested", passed: false }] },
  ];
  assert.match(validateRun(root, "agent-defaults", "full", passing).errors.join("\n"),
    /grade verdict contradicts/);

  const diagnostic = records([diagnosticNames[0]]);
  diagnostic[0].gradeResult.details[0].details = [{ graderType: "nested", passed: false }];
  const result = validateRun(root, "agent-defaults", "full", diagnostic);
  assert.match(result.errors.join("\n"), /failed required graders/);
  assert.equal(result.diagnostics.length, 0);

  const inconsistentDiagnostic = records([diagnosticNames[0]]);
  inconsistentDiagnostic[0].gradeResult.details[0].details = [
    { graderType: "nested", passed: true, details: [{ graderType: "nested", passed: false }] },
  ];
  assert.match(validateRun(root, "agent-defaults", "full", inconsistentDiagnostic)
    .errors.join("\n"), /grade verdict contradicts/);

  const failedParent = records([diagnosticNames[0]]);
  failedParent[0].gradeResult.details[0].details = [{ graderType: "nested", passed: true }];
  const validDiagnostic = validateRun(root, "agent-defaults", "full", failedParent);
  assert.deepEqual(validDiagnostic.errors, []);
  assert.equal(validDiagnostic.diagnostics.length, 1);
});

test("native completed and panel results retain their own nested verdict semantics", (t) => {
  const { root, stimuli, save } = fixture(t);
  stimuli[0].graders.push({ name: "completed-check", type: "completed", config: {} });
  stimuli[0].graders.push({ name: "panel-check", type: "panel", config: {} });
  stimuli[0].graders.push({ name: "command-check", type: "run-command", config: {} });
  stimuli[0].graders.push({ name: "metrics-check", type: "custom-metrics", config: {} });
  save();

  const completedDetails = [
    { name: "has-output", kind: "code", passed: true, score: 1, evidence: "Output exists." },
    { name: "no-errors", kind: "code", passed: true, score: 1, evidence: "No errors." },
    { name: "turn-completed", kind: "code", passed: true, score: 1, evidence: "A turn completed." },
  ];
  const panelJudge = (name, passed, score) => ({
    name: `panel/${name}`, kind: "llm", passed, score,
    evidence: `Judge ${name}.`, label: passed ? "correct" : "incorrect",
    metadata: { model: name },
  });
  const panelCriterion = {
    name: "panel/criterion/accuracy", kind: "llm", passed: true, score: 0.75,
    evidence: "Criterion consensus passed.", label: "correct",
    metadata: { criterion: "accuracy", required: true },
  };
  const configuredResult = (name, graderType, passed, details, extra = {}) => ({
    name, configuredName: name, graderType, kind: graderType === "completed" ? "code" : "llm",
    passed, score: passed ? 1 : 0, status: "success", details, ...extra,
  });
  const command = () => configuredResult("command-check", "run-command", true, [
    { name: "exit-code", kind: "code", passed: true, score: 1, evidence: "Exit code 0 as expected" },
  ]);
  const metrics = () => configuredResult("metrics-check", "custom-metrics", true, [
    { name: "requests", kind: "code", passed: true, score: 1, evidence: "Metric passed", label: "correct" },
  ]);

  const valid = records();
  valid[0].gradeResult.details.push(
    configuredResult("completed-check", "completed", true, structuredClone(completedDetails)),
    configuredResult("panel-check", "panel", true, [
      panelCriterion,
      panelJudge("judge-a", false, 0.4),
      panelJudge("judge-b", true, 0.9),
    ]),
    command(),
    metrics(),
  );
  assert.deepEqual(validateRun(root, "agent-defaults", "full", valid).errors, []);

  const failingPanelCriterion = structuredClone(valid);
  failingPanelCriterion[0].gradeResult.details[2].details[0].passed = false;
  assert.match(validateRun(root, "agent-defaults", "full", failingPanelCriterion).errors.join("\n"),
    /grade verdict contradicts/);
  const failingAdvisory = structuredClone(failingPanelCriterion);
  failingAdvisory[0].gradeResult.details[2].details[0].metadata.required = false;
  assert.deepEqual(validateRun(root, "agent-defaults", "full", failingAdvisory).errors, []);
  for (const metadata of [undefined, {}, { required: "true" }]) {
    const malformedCriterion = structuredClone(valid);
    malformedCriterion[0].gradeResult.details[2].details[0].metadata = metadata;
    assert.match(validateRun(root, "agent-defaults", "full", malformedCriterion).errors.join("\n"),
      /malformed nested grader result/);
  }

  const contradictoryAggregate = records();
  const failedCompletedDetails = structuredClone(completedDetails);
  failedCompletedDetails[1].passed = false;
  failedCompletedDetails[1].score = 0;
  contradictoryAggregate[0].gradeResult.details.push(
    configuredResult("completed-check", "completed", true, failedCompletedDetails),
    configuredResult("panel-check", "panel", true, [
      panelJudge("judge-a", true, 0.9),
      panelJudge("judge-b", true, 0.9),
    ]),
    command(),
    metrics(),
  );
  assert.match(validateRun(root, "agent-defaults", "full", contradictoryAggregate)
    .errors.join("\n"), /grade verdict contradicts/);

  const failedAggregateWithoutFailedDetails = records();
  failedAggregateWithoutFailedDetails[0].gradeResult.passed = false;
  failedAggregateWithoutFailedDetails[0].gradeResult.details[0].passed = false;
  failedAggregateWithoutFailedDetails[0].gradeResult.details.push(
    configuredResult("completed-check", "completed", false, structuredClone(completedDetails)),
    configuredResult("panel-check", "panel", true, [
      panelJudge("judge-a", true, 0.9),
      panelJudge("judge-b", true, 0.9),
    ]),
    command(),
    metrics(),
  );
  assert.match(validateRun(root, "agent-defaults", "full", failedAggregateWithoutFailedDetails)
    .errors.join("\n"), /grade verdict contradicts/);

  const panelExecutionError = records();
  const erroredJudge = { ...panelJudge("judge-a", false, 0), status: "error" };
  panelExecutionError[0].gradeResult.passed = false;
  panelExecutionError[0].gradeResult.details[0].passed = false;
  panelExecutionError[0].gradeResult.details.push(
    configuredResult("completed-check", "completed", true, structuredClone(completedDetails)),
    configuredResult("panel-check", "panel", false, [
      erroredJudge,
      panelJudge("judge-b", true, 0.9),
    ]),
    command(),
    metrics(),
  );
  const executionErrorResult = validateRun(root, "agent-defaults", "full", panelExecutionError);
  assert.match(executionErrorResult.errors.join("\n"), /grader execution error/);
  assert.equal(executionErrorResult.diagnostics.length, 0);

  const malformedPanel = records();
  malformedPanel[0].gradeResult.details.push(
    configuredResult("completed-check", "completed", true, structuredClone(completedDetails)),
    configuredResult("panel-check", "panel", true, [null]),
    command(),
    metrics(),
  );
  assert.match(validateRun(root, "agent-defaults", "full", malformedPanel)
    .errors.join("\n"), /malformed nested grader result/);
});

test("native skill aggregates require their children to agree in both directions", (t) => {
  const { root, stimuli, save } = fixture(t);
  const child = () => ({
    name: "skill", kind: "code", passed: true, score: 1, evidence: "Passed.",
    details: [{ name: "check", kind: "code", passed: true, score: 1, evidence: "Passed." }],
  });
  for (const type of ["spec-compliance", "valid-refs", "skill-size"]) {
    stimuli[0].graders.push({ name: "skill-check", type, config: {} });
    save();
    const make = () => {
      const items = records();
      items[0].gradeResult.details.push({
        configuredName: "skill-check", graderType: type, passed: true, details: [child()],
      });
      return items;
    };
    assert.deepEqual(validateRun(root, "agent-defaults", "full", make()).errors, []);
    const failingChild = make();
    failingChild[0].gradeResult.details[1].details[0].details[0].passed = false;
    assert.match(validateRun(root, "agent-defaults", "full", failingChild).errors.join("\n"),
      /grade verdict contradicts/);
    const failingParent = make();
    failingParent[0].gradeResult.passed = false;
    failingParent[0].gradeResult.details[1].passed = false;
    assert.match(validateRun(root, "agent-defaults", "full", failingParent).errors.join("\n"),
      /grade verdict contradicts/);
    stimuli[0].graders.pop();
  }
});

test("the same stimulus identity cannot enable diagnostics in another package", (t) => {
  const state = fixture(t);
  const target = "packages/development-workflow/evals/development-workflow.eval.yaml";
  fs.mkdirSync(path.join(state.root, "packages/development-workflow/evals"), { recursive: true });
  const stimulus = structuredClone(state.stimuli[0]);
  delete stimulus.tags.diagnostic;
  stimulus.agent_environment.files[0].src = `../../agent-defaults/${policyFile.split("/").slice(2).join("/")}`;
  fs.writeFileSync(path.join(state.root, target), yaml.dump({ name: "test-eval", stimuli: [stimulus] }));
  const failed = trial(stimulus.name, false);
  failed.evalFilePath = target;
  failed.itemId = `${target}::default::_::${stimulus.name}::trial-0`;
  const end = summary(false, 1);
  end.evals[0].evalFilePath = target;
  const result = validateRun(state.root, "development-workflow", "full", [failed, end]);
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
  const passingPrompt = promptRun();
  passingPrompt.rubric.passed = false;
  passingPrompt.rubric.score = 0;
  assert.deepEqual(validate(passingPrompt.items), []);

  const emptyCriterion = promptRun();
  emptyCriterion.rubric.name = "prompt/";
  assert.deepEqual(validate(emptyCriterion.items), []);

  const failingPrompt = promptRun();
  failingPrompt.grade.passed = false;
  failingPrompt.prompt.passed = false;
  failingPrompt.rubric.passed = false;
  assert.match(validate(failingPrompt.items).join("\n"), /failed required graders/);

  stimuli[0].graders.push({ name: "draft-only", type: "prompt", config: { scoring: "binary" } });
  save();
  const mixed = promptRun();
  const diagnostic = records([diagnosticNames[0]]);
  mixed.rubric.passed = false;
  mixed.rubric.score = 0;
  diagnostic[0].gradeResult.details.push(mixed.prompt);
  diagnostic.at(-2).gradeResult.details.push(promptRun().prompt);
  const mixedResult = validateRun(root, "agent-defaults", "full", diagnostic);
  assert.deepEqual(mixedResult.errors, []);
  assert.equal(mixedResult.diagnostics.length, 1);
  stimuli[0].graders.pop();
  save();

  for (const [mutate, expected] of [
    [({ rubric }) => { rubric.status = "error"; }, /grader execution error/],
    [({ rubric }) => { rubric.status = "error"; rubric.passed = false; }, /grader execution error/],
    [({ rubric }) => { rubric.name = "unexpected"; }, /malformed nested grader result/],
    [({ rubric }) => { rubric.configuredName = "draft-only"; }, /malformed nested grader result/],
    [({ rubric }) => { rubric.details = [{}]; }, /malformed nested grader result/],
    [({ grade, rubric }) => { grade.details[0].details = [rubric]; }, /malformed nested grader result/],
  ]) {
    const run = promptRun();
    mutate(run);
    assert.match(validate(run.items).join("\n"), expected);
  }
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
