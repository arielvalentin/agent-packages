#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateNativeSuite } = require("./validate-native-evals.js");
const { findVallyResultsFile, resolveRunExitCode } = require("./vally-output.js");

function selectedEvalSpec(preflight, stimulusNames) {
  if (!Array.isArray(stimulusNames) || !stimulusNames.length
    || stimulusNames.some((name) => typeof name !== "string" || !name)
    || new Set(stimulusNames).size !== stimulusNames.length) {
    throw new Error("Selected stimuli must be a nonempty array of unique names.");
  }
  const expectedNames = new Set(preflight.selectedStimuli.map((stimulus) => stimulus.name));
  if (stimulusNames.some((name) => !expectedNames.has(name))) {
    throw new Error("Selected stimuli must belong to the validated suite.");
  }
  const selected = new Set(stimulusNames);
  const stimuli = preflight.selectedStimuli.filter((stimulus) => selected.has(stimulus.name));
  if (stimuli.length !== selected.size) {
    throw new Error("Selected stimuli do not match the native eval inventory.");
  }
  return { ...preflight.evalSpec, stimuli };
}

function parseArgs(args) {
  const [packageName, suite, ...options] = args;
  if (!packageName || !suite) {
    throw new Error("Usage: node script/run-evals.js <package> <smoke|full> [--stimuli <JSON array>]");
  }
  if (!options.length) return { packageName, suite };
  if (options.length !== 2 || options[0] !== "--stimuli") {
    throw new Error("Usage: node script/run-evals.js <package> <smoke|full> [--stimuli <JSON array>]");
  }
  return { packageName, suite, stimulusNames: JSON.parse(options[1]) };
}

function main(args, spawn = spawnSync) {
  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const { packageName, suite, stimulusNames } = parsed;
  const root = path.resolve(__dirname, "..");
  const preflight = validateNativeSuite(root, packageName, suite);
  if (preflight.errors.length) {
    for (const error of preflight.errors) console.error(error);
    return 1;
  }
  let evalSpec;
  if (stimulusNames !== undefined) {
    try {
      evalSpec = selectedEvalSpec(preflight, stimulusNames);
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }
  if (!["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]
    .some((name) => typeof process.env[name] === "string"
      && process.env[name].trim().length > 0)) {
    console.error("Copilot Evals requires COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN.");
    return 1;
  }

  const outputDirectory = process.env.VALLY_RESULTS_DIR
    ? path.resolve(process.env.VALLY_RESULTS_DIR)
    : fs.mkdtempSync(path.join(os.tmpdir(), `agent-packages-${packageName}-${suite}-`));
  fs.mkdirSync(outputDirectory, { recursive: true });
  if (fs.readdirSync(outputDirectory).length > 0) {
    console.error(`Refusing to run Vally in a non-empty results directory: ${outputDirectory}`);
    return 1;
  }

  let evalFile = preflight.evalPath;
  let temporaryEvalFile;
  if (evalSpec) {
    temporaryEvalFile = path.join(
      path.dirname(preflight.evalPath),
      `.affected-${process.pid}-${crypto.randomUUID()}.eval.yaml`
    );
    try {
      fs.writeFileSync(temporaryEvalFile, JSON.stringify(evalSpec), { flag: "wx" });
      evalFile = temporaryEvalFile;
    } catch (error) {
      fs.rmSync(temporaryEvalFile, { force: true });
      console.error(`Unable to write selected Vally eval specification: ${error.message}`);
      return 1;
    }
  }

  try {
    const vally = path.join(root, "node_modules/.bin/vally");
    const args = [
      "eval",
      "--eval-spec",
      evalFile,
      "--output-dir",
      outputDirectory,
      "--workers",
      "1",
      "--runs",
      "1",
      "--max-retries",
      "0",
      "--grader-plugin",
      path.join(__dirname, "native-eval-graders.mjs"),
    ];
    if (typeof process.env.VALLY_MODEL === "string" && process.env.VALLY_MODEL.trim()) {
      args.push("--model", process.env.VALLY_MODEL.trim());
      console.log(`Evaluation model: ${process.env.VALLY_MODEL.trim()}`);
    }
    if (suite === "smoke") args.push("--tag", "suite=smoke");

    console.log(`Running ${packageName} ${suite} with GitHub Copilot Evals (Vally).`);
    if (stimulusNames) console.log(`Selected ${stimulusNames.length} native stimuli.`);
    console.log(`Results directory: ${outputDirectory}`);
    const evaluation = spawn(vally, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    if (evaluation.error) {
      console.error(`Unable to start Vally: ${evaluation.error.message}`);
      return 1;
    }

    let resultsFile;
    try {
      resultsFile = findVallyResultsFile(outputDirectory);
    } catch (error) {
      console.error(`Unable to locate valid Vally results: ${error.message}`);
      return typeof evaluation.status === "number" ? evaluation.status || 1 : 1;
    }
    console.log(`Results: ${resultsFile}`);

    const validatorArgs = [
      path.join(__dirname, "validate-native-evals.js"),
      "--results",
      packageName,
      suite,
      resultsFile,
    ];
    if (stimulusNames) {
      validatorArgs.push("--stimuli", JSON.stringify(stimulusNames), "--eval-file", evalFile);
    }
    const validation = spawn(process.execPath, validatorArgs, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    if (validation.error) {
      console.error(`Unable to validate Vally results: ${validation.error.message}`);
      return 1;
    }
    return resolveRunExitCode(evaluation.status, validation.status);
  } finally {
    if (temporaryEvalFile) fs.rmSync(temporaryEvalFile, { force: true });
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, parseArgs, selectedEvalSpec };
