#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const { fixtureContent, isManagedFixture, isPolicyInput } = require("./native-eval-fixtures.js");

const PACKAGES = new Set([
  "agent-defaults",
  "development-workflow",
  "code-reviewers",
]);
const GRADER_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_GRADER_NAME_LENGTH = 60;
const DIAGNOSTIC_ASSERTION_GRADER_TYPES = new Set([
  "output-contains",
  "output-matches",
  "output-not-matches",
]);
const DIAGNOSTICS = new Map([
  ["agent-defaults-case-063-row-01", "skill-gates: policy configuration requires review"],
  ["agent-defaults-case-121-row-01", "writing-voice: PR output shows value without issue or routine-check noise"],
  ["agent-defaults-case-164-row-01", "tech-research: requires evidence and one synthesis"],
  ["agent-defaults-case-169-row-01", "tech-research: hands off durable synthesis without re-querying"],
  ["agent-defaults-case-189-row-01", "pr-lifecycle: breaking changes use the optional ! marker"],
  ["agent-defaults-case-191-row-01", "pr-lifecycle: rejects a 73-character Conventional PR title"],
  ["agent-defaults-case-283-row-01", "pr-lifecycle: keeps feedback routing read only"],
]);

function readYaml(file) {
  return yaml.load(fs.readFileSync(file, "utf8"));
}

function resolveRepositoryFile(root, baseDirectory, filePath, label) {
  if (typeof filePath !== "string" || !filePath || path.isAbsolute(filePath)) {
    throw new Error(`${label} must be a non-empty repository-relative path.`);
  }
  const repositoryRoot = fs.realpathSync(root);
  const realBase = fs.realpathSync(baseDirectory);
  const baseRelative = path.relative(repositoryRoot, realBase);
  if (baseRelative.startsWith("..") || path.isAbsolute(baseRelative)) {
    throw new Error(`${label} base directory is outside the repository.`);
  }
  const target = path.resolve(realBase, filePath);
  const relative = path.relative(repositoryRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the repository.`);
  }
  let current = repositoryRoot;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic link.`);
    }
  }
  if (!fs.statSync(current).isFile()) {
    throw new Error(`${label} is not a regular file.`);
  }
  const realTarget = fs.realpathSync(current);
  const realRelative = path.relative(repositoryRoot, realTarget);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error(`${label} resolves outside the repository.`);
  }
  return realTarget;
}

function blocksShellCommands(override) {
  if (!override || typeof override !== "object") return false;
  if ("patterns" in override) {
    return Array.isArray(override.patterns)
      && override.default?.is_error === true;
  }
  return override.is_error === true;
}

function validateNativeSuite(root, packageName, suite) {
  const errors = [];
  if (!PACKAGES.has(packageName)) errors.push(`Unknown package: ${packageName}`);
  if (!["smoke", "full"].includes(suite)) errors.push(`Unknown suite: ${suite}`);
  if (errors.length) return { errors };

  const suiteMap = { evalFile: `packages/${packageName}/evals/${packageName}.eval.yaml` };

  let evalPath;
  let evalSpec;
  try {
    evalPath = resolveRepositoryFile(root, root, suiteMap.evalFile, "Native eval file");
    evalSpec = readYaml(evalPath);
  } catch (error) {
    return { errors: [...errors, `Unable to read native eval: ${error.message}`] };
  }
  const stimuli = evalSpec?.stimuli;
  if (!Array.isArray(stimuli)) {
    errors.push(`${suiteMap.evalFile} has no stimuli array.`);
    return { errors };
  }
  const seen = new Set();
  const checkedFixtures = new Set();
  for (const stimulus of stimuli) {
    if (!stimulus || typeof stimulus.name !== "string" || !stimulus.name || seen.has(stimulus.name)) {
      errors.push(`Invalid or duplicate native stimulus name: ${stimulus?.name}`);
      continue;
    }
    seen.add(stimulus.name);
    if (!["smoke", "full"].includes(stimulus.tags?.suite)) {
      errors.push(`${stimulus.name} has an invalid suite tag.`);
    }
    const approvedDiagnostic = packageName === "agent-defaults" && DIAGNOSTICS.has(stimulus.name);
    if ((stimulus.tags?.diagnostic !== undefined || approvedDiagnostic)
      && (!approvedDiagnostic || stimulus.tags?.diagnostic !== "assertion-only")) {
      errors.push(`${stimulus.name} has invalid diagnostic metadata.`);
    }
    if (typeof stimulus.prompt !== "string" || !stimulus.prompt.trim()) {
      errors.push(`${stimulus.name} has no prompt.`);
    }
    if (!Array.isArray(stimulus.graders) || !stimulus.graders.length) {
      errors.push(`${stimulus.name} has no graders.`);
    } else {
      const graderNames = new Set();
      for (const grader of stimulus.graders) {
        if (typeof grader.name !== "string" || !GRADER_NAME_PATTERN.test(grader.name)
          || grader.name.length > MAX_GRADER_NAME_LENGTH || graderNames.has(grader.name)
          || typeof grader.type !== "string" || !grader.type) {
          errors.push(`${stimulus.name} has an invalid or duplicate Vally grader name or type.`);
        }
        graderNames.add(grader.name);
      }
    }
    if (!blocksShellCommands(stimulus.simulation?.tool_overrides?.bash)) {
      errors.push(`${stimulus.name} does not block shell command execution.`);
    }
    for (const file of stimulus.agent_environment?.files || []) {
      try {
        const filePath = resolveRepositoryFile(root, path.dirname(evalPath), file.src, `${stimulus.name} native file`);
        if (file.dest !== ".github/copilot-instructions.md") {
          throw new Error("Native destination must be the workspace instructions file.");
        }
        const fixture = path.relative(fs.realpathSync(root), filePath).split(path.sep).join("/");
        const managed = isManagedFixture(fixture);
        if (!managed && !isPolicyInput(fixture)) {
          throw new Error("Native source is not an APM policy file or managed fixture.");
        }
        if (managed && !checkedFixtures.has(fixture)) {
          checkedFixtures.add(fixture);
          if (fs.readFileSync(filePath, "utf8") !== fixtureContent(root, fixture, resolveRepositoryFile)) {
            errors.push(`${fixture} differs from its canonical composition.`);
          }
        }
      } catch (error) {
        errors.push(`${stimulus.name} has an unsafe or invalid native file: ${error.message}`);
      }
    }
    for (const skill of stimulus.agent_environment?.skills || []) {
      try {
        const skillFile = resolveRepositoryFile(root, path.dirname(evalPath), path.join(skill, "SKILL.md"), `${stimulus.name} skill`);
        if (!isPolicyInput(path.relative(fs.realpathSync(root), skillFile).split(path.sep).join("/"))) {
          throw new Error("Native skill is not an APM policy skill.");
        }
      } catch (error) {
        errors.push(`${stimulus.name} has an unsafe or invalid skill: ${error.message}`);
      }
    }
  }
  if (packageName === "agent-defaults") {
    for (const name of DIAGNOSTICS.keys()) {
      if (!seen.has(name)) errors.push(`Missing approved diagnostic: ${name}`);
    }
  }
  const selectedStimuli = stimuli
    .filter((stimulus) => stimulus && (suite === "full" || stimulus.tags?.suite === "smoke"));
  if (!selectedStimuli.length) errors.push(`${packageName} ${suite} has no native stimuli.`);
  const expectedEntries = selectedStimuli.map((stimulus) => ({
    targetStimulus: stimulus.name,
    sourceDescription: DIAGNOSTICS.get(stimulus.name) || stimulus.name,
    diagnostic: packageName === "agent-defaults" && DIAGNOSTICS.has(stimulus.name),
    assertionGraders: stimulus.graders || [],
  }));
  return { errors, suiteMap, evalSpec, evalPath, stimuli, selectedStimuli, expectedEntries };
}

function validateTrialItemId(record) {
  if (typeof record.itemId !== "string"
    || typeof record.evalFilePath !== "string"
    || typeof record.variant !== "string"
    || typeof record.stimulus !== "string") {
    return false;
  }
  const prefix = `${record.evalFilePath}::${record.variant}::`;
  if (!record.itemId.startsWith(prefix)) return false;
  const identity = record.itemId.slice(prefix.length).split("::");
  if (identity.length !== 3) return false;
  const [model, stimulus, trial] = identity;
  return model.length > 0
    && stimulus === record.stimulus
    && trial === "trial-0"
    && (record.model === undefined || model === record.model)
    && (record.trialIndex === undefined || record.trialIndex === 0)
    && (record.totalTrials === undefined || record.totalTrials === 1);
}

function validateRun(root, packageName, suite, records) {
  const preflight = validateNativeSuite(root, packageName, suite);
  const errors = [...preflight.errors];
  const diagnostics = [];
  if (errors.length) return { errors, diagnostics };

  if (!Array.isArray(records) || !records.length) {
    return { errors: ["Vally result stream is empty."], diagnostics };
  }
  const trialRecords = records.filter((record) => record?.type === "trial-result");
  const summaryRecords = records.filter((record) => record?.type === "run-summary");
  if (summaryRecords.length !== 1) {
    errors.push(`Expected one run-summary record, received ${summaryRecords.length}.`);
  }

  const expectedByName = new Map(preflight.expectedEntries.map((entry) => [
    entry.targetStimulus,
    entry,
  ]));
  const expectedEvalFilePath = path.resolve(root, preflight.suiteMap.evalFile);
  const expectedEvalName = preflight.evalSpec.name;
  const stimuliByName = new Map(preflight.selectedStimuli.map((stimulus) => [
    stimulus.name,
    stimulus,
  ]));
  const resultCounts = new Map();
  const trialVariants = new Set();
  for (const record of trialRecords) {
    if (!record || typeof record !== "object" || typeof record.stimulus !== "string"
      || !record.stimulus) {
      errors.push("Vally trial result has no stimulus identity.");
      continue;
    }
    if (!validateTrialItemId(record)
      || path.resolve(root, record.evalFilePath) !== expectedEvalFilePath
      || record.evalName !== expectedEvalName) {
      errors.push(`${record.stimulus} Vally itemId does not match its planned identity.`);
      continue;
    }
    trialVariants.add(record.variant);
    resultCounts.set(record.stimulus, (resultCounts.get(record.stimulus) || 0) + 1);
    const entry = expectedByName.get(record.stimulus);
    const stimulus = stimuliByName.get(record.stimulus);
    if (!entry || !stimulus) {
      errors.push(`Unexpected Vally stimulus result: ${record.stimulus}`);
      continue;
    }
    if (record.status !== "success") {
      errors.push(`${record.stimulus} did not complete successfully.`);
      continue;
    }
    const grade = record.gradeResult;
    if (!grade || typeof grade !== "object" || Array.isArray(grade)
      || typeof grade.passed !== "boolean" || !Array.isArray(grade.details)
      || (grade.status !== undefined && typeof grade.status !== "string")) {
      errors.push(`${record.stimulus} has a missing or malformed grade result.`);
      continue;
    }
    const expectedGraders = stimulus.graders;
    const binaryPromptGraders = new Set(expectedGraders
      .filter((grader) => grader.type === "prompt"
        && grader.config?.scoring === "binary" && grader.config?.threshold === 1)
      .map((grader) => grader.name));
    const actualGraders = grade.details.filter((grader) =>
      grader && typeof grader === "object" && !Array.isArray(grader)
    );
    const actualCounts = new Map();
    for (const grader of actualGraders) {
      if (typeof grader.configuredName === "string") {
        actualCounts.set(
          grader.configuredName,
          (actualCounts.get(grader.configuredName) || 0) + 1
        );
      }
    }
    if (actualGraders.length !== grade.details.length
      || expectedGraders.length !== actualGraders.length
      || expectedGraders.some(({ name, type }) =>
        actualCounts.get(name) !== 1
          || actualGraders.find((grader) => grader.configuredName === name)?.graderType !== type
          || typeof actualGraders.find((grader) => grader.configuredName === name)?.passed !== "boolean"
      )
      || actualGraders.some((grader) =>
        !expectedGraders.some(({ name }) => name === grader.configuredName)
          || typeof grader.passed !== "boolean"
      )) {
      errors.push(`${record.stimulus} grader results do not match its configured grader set.`);
      continue;
    }

    const nestedGraders = [];
    const pending = actualGraders.map((grader) => ({
      grader,
      parent: grade,
      grandparent: null,
      nativeContext: null,
      allPassContext: false,
    }));
    let malformedNestedGrade = false;
    let contradictoryNestedGrade = false;
    let executionError = grade.status !== undefined && grade.status !== "success";
    const allPassAggregates = [];
    const binaryPromptAggregates = [];
    while (pending.length) {
      const { grader, parent, grandparent, nativeContext, allPassContext } = pending.pop();
      const rubricLeaf = grandparent === grade && parent.graderType === "prompt";
      const panelDetail = nativeContext === "panel"
        || (grandparent === grade && parent.graderType === "panel");
      const panelCriterion = grandparent === grade && parent.graderType === "panel"
        && typeof grader?.name === "string" && grader.name.startsWith("panel/criterion/");
      const validNativeDetail = grader && typeof grader === "object" && !Array.isArray(grader) && (rubricLeaf
        ? grader.kind === "llm" && typeof grader.name === "string"
          && grader.name.startsWith("prompt/")
          && Number.isFinite(grader.score) && grader.score >= 0 && grader.score <= 1
          && grader.graderType === undefined && grader.configuredName === undefined
          && grader.details === undefined
        : typeof grader.name === "string" && typeof grader.evidence === "string"
          && (grader.kind === "code" || grader.kind === "llm")
          && Number.isFinite(grader.score) && grader.score >= 0 && grader.score <= 1
          && !grader.name.startsWith("prompt/")
          && (!panelDetail || (grader.kind === "llm" && grader.name.startsWith("panel/")))
          && grader.configuredName === undefined);
      if (!grader || typeof grader !== "object" || Array.isArray(grader)
        || typeof grader.passed !== "boolean"
        || (grader.details !== undefined && !Array.isArray(grader.details))
        || (panelCriterion && (!grader.metadata || typeof grader.metadata !== "object"
          || Array.isArray(grader.metadata) || typeof grader.metadata.required !== "boolean"))
        || (parent !== grade && (rubricLeaf || panelDetail || grader.graderType === undefined
          ? !validNativeDetail
          : typeof grader.graderType !== "string" || grader.configuredName !== undefined))) {
        malformedNestedGrade = true;
        break;
      }
      if (parent === grade && binaryPromptGraders.has(grader.configuredName)) {
        if (!Array.isArray(grader.details) || grader.details.length === 0) {
          malformedNestedGrade = true;
          break;
        }
        binaryPromptAggregates.push(grader);
      }
      if (grader.status !== undefined && typeof grader.status !== "string") {
        malformedNestedGrade = true;
        break;
      }
      if (grader.status !== undefined && grader.status !== "success") executionError = true;
      if (!rubricLeaf && !panelDetail && parent.passed && !grader.passed) {
        contradictoryNestedGrade = true;
      }
      if (panelCriterion && parent.passed && grader.metadata.required && !grader.passed) {
        contradictoryNestedGrade = true;
      }
      if (parent !== grade && !rubricLeaf && !panelDetail) {
        nestedGraders.push(grader);
      }
      const allPass = allPassContext || (parent === grade
        && ["completed", "spec-compliance", "valid-refs", "skill-size"].includes(grader.graderType));
      if (allPass && Array.isArray(grader.details)) {
        allPassAggregates.push(grader);
      }
      for (const child of grader.details || []) {
        pending.push({
          grader: child,
          parent: grader,
          grandparent: parent,
          nativeContext: nativeContext || (parent === grade && grader.graderType === "panel"
            ? "panel" : null),
          allPassContext: allPass,
        });
      }
    }
    if (malformedNestedGrade) {
      errors.push(`${record.stimulus} contains a malformed nested grader result.`);
      continue;
    }
    if (executionError) {
      errors.push(`${record.stimulus} grader execution error.`);
      continue;
    }
    if (binaryPromptAggregates.some((grader) =>
      grader.passed !== grader.details.every((detail) => detail.passed)
    )) {
      errors.push(`${record.stimulus} binary prompt grader verdict contradicts its rubric results.`);
      continue;
    }
    if (allPassAggregates.some((grader) =>
      grader.passed !== grader.details.every((detail) => detail.passed)
    )) {
      errors.push(`${record.stimulus} grade verdict contradicts its failed grader results.`);
      continue;
    }
    if (contradictoryNestedGrade) {
      errors.push(`${record.stimulus} grade verdict contradicts its failed grader results.`);
      continue;
    }

    const failedGraders = actualGraders.filter((grader) => grader.passed === false);
    if (grade.passed && failedGraders.length) {
      errors.push(`${record.stimulus} grade verdict contradicts its failed grader results.`);
      continue;
    }
    if (!grade.passed && !failedGraders.length) {
      errors.push(`${record.stimulus} grade failed without a failed grader result.`);
      continue;
    }
    if (grade.passed) continue;
    const assertionTypes = new Map((entry.assertionGraders || []).map((grader) => [
      grader.name,
      grader.type,
    ]));
    const diagnosticOnly = packageName === "agent-defaults"
      && entry.diagnostic === true
      && DIAGNOSTICS.has(entry.targetStimulus)
      && failedGraders.length > 0
      && !nestedGraders.some((grader) => grader.passed === false)
      && failedGraders.every((grader) => assertionTypes.has(grader.configuredName)
        && assertionTypes.get(grader.configuredName) === grader.graderType
        && DIAGNOSTIC_ASSERTION_GRADER_TYPES.has(grader.graderType));
    if (!diagnosticOnly) {
      errors.push(`${record.stimulus} failed required graders: ${
        failedGraders.map((grader) => grader.configuredName || grader.name).join(", ")
      }`);
      continue;
    }
    diagnostics.push({
      stimulus: record.stimulus,
      description: entry.sourceDescription,
      failedGraders: failedGraders.map((grader) => grader.configuredName),
    });
  }

  for (const [name, entry] of expectedByName) {
    const count = resultCounts.get(name) || 0;
    if (count !== 1) errors.push(`${entry.sourceDescription} expected one result for ${name}; received ${count}.`);
  }
  for (const [name, count] of resultCounts) {
    if (count !== 1) errors.push(`Duplicate result for ${name}: ${count}.`);
  }

  const [summary] = summaryRecords;
  if (summary) {
    if (summary.hadExecutionErrors) {
      errors.push("Vally run-summary reports execution errors.");
    }
    if (!Array.isArray(summary.evals) || summary.evals.length !== 1
      || !summary.evals[0] || typeof summary.evals[0] !== "object") {
      errors.push("Vally run-summary has no single eval result count.");
    } else {
      const evalSummary = summary.evals[0];
      if (evalSummary.name !== expectedEvalName
        || typeof evalSummary.evalFilePath !== "string"
        || path.resolve(root, evalSummary.evalFilePath) !== expectedEvalFilePath) {
        errors.push("Vally run-summary eval identity does not match the planned native eval.");
      }
      if (evalSummary.hadExecutionErrors) {
        errors.push("Vally eval-summary reports execution errors.");
      }
      if (trialVariants.size === 0 || !trialVariants.has(evalSummary.variant)
        || [...trialVariants].some((variant) => variant !== evalSummary.variant)) {
        errors.push("Vally run-summary variant does not match its trial results.");
      }
      const stimuliSkipped = evalSummary.stimuliSkipped === undefined
        ? 0
        : evalSummary.stimuliSkipped;
      if (evalSummary.stimuliRun !== preflight.expectedEntries.length
        || evalSummary.stimuliTotal !== preflight.stimuli.length
        || stimuliSkipped !== 0) {
        errors.push(
          `Vally run-summary count mismatch (ran ${evalSummary.stimuliRun}; expected ${preflight.expectedEntries.length}; total ${evalSummary.stimuliTotal}; expected total ${preflight.stimuli.length}; skipped ${stimuliSkipped}).`
        );
      }
    }
  }
  return { errors, diagnostics };
}

function parseJsonl(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.length > 0);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL record on line ${index + 1}: ${error.message}`);
    }
  });
}

function main(argv) {
  const [mode, packageName, suite, file, ...optionArgs] = argv;
  if (!["--check", "--results"].includes(mode) || !packageName || !suite
    || (mode === "--results" && !file)
    || optionArgs.length) {
    console.error("Usage: node script/validate-native-evals.js --check <package> <smoke|full>");
    console.error("   or: node script/validate-native-evals.js --results <package> <smoke|full> <results.jsonl>");
    return 2;
  }
  const root = path.resolve(__dirname, "..");
  try {
    if (mode === "--check") {
      const result = validateNativeSuite(root, packageName, suite);
      for (const error of result.errors) console.error(error);
      if (!result.errors.length) {
        console.log(`${packageName} ${suite}: ${result.expectedEntries.length} native stimuli validated.`);
      }
      return result.errors.length ? 1 : 0;
    }
    const result = validateRun(root, packageName, suite, parseJsonl(file));
    for (const error of result.errors) console.error(error);
    for (const diagnostic of result.diagnostics) {
      console.log(`DIAGNOSTIC ASSERTION FAILURE (non-blocking): ${diagnostic.description}`);
      console.log(`  graders: ${diagnostic.failedGraders.join(", ")}`);
    }
    if (!result.errors.length && !result.diagnostics.length) {
      console.log(`${packageName} ${suite}: all required native stimuli passed.`);
    }
    return result.errors.length ? 1 : result.diagnostics.length ? 10 : 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {
  parseJsonl,
  resolveRepositoryFile,
  validateNativeSuite,
  validateRun,
};
