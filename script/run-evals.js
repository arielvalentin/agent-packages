#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateNativeSuite } = require("./validate-native-evals.js");
const { findVallyResultsFile, resolveRunExitCode } = require("./vally-output.js");

const [packageName, suite] = process.argv.slice(2);
if (!packageName || !suite) {
  console.error("Usage: node script/run-evals.js <package> <smoke|full>");
  process.exit(2);
}

const root = path.resolve(__dirname, "..");
const preflight = validateNativeSuite(root, packageName, suite);
if (preflight.errors.length) {
  for (const error of preflight.errors) console.error(error);
  process.exit(1);
}

if (!["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]
  .some((name) => typeof process.env[name] === "string"
    && process.env[name].trim().length > 0)) {
  console.error("Copilot Evals requires COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN.");
  process.exit(1);
}

const outputDirectory = process.env.VALLY_RESULTS_DIR
  ? path.resolve(process.env.VALLY_RESULTS_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), `agent-packages-${packageName}-${suite}-`));
fs.mkdirSync(outputDirectory, { recursive: true });
if (fs.readdirSync(outputDirectory).length > 0) {
  console.error(`Refusing to run Vally in a non-empty results directory: ${outputDirectory}`);
  process.exit(1);
}

const evalFile = path.join(root, preflight.suiteMap.evalFile);
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
if (suite === "smoke") args.push("--tag", "suite=smoke");

console.log(`Running ${packageName} ${suite} with GitHub Copilot Evals (Vally).`);
console.log(`Results directory: ${outputDirectory}`);
const evaluation = spawnSync(vally, args, {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
if (evaluation.error) {
  console.error(`Unable to start Vally: ${evaluation.error.message}`);
  process.exit(1);
}

let resultsFile;
try {
  resultsFile = findVallyResultsFile(outputDirectory);
} catch (error) {
  console.error(`Unable to locate valid Vally results: ${error.message}`);
  process.exit(typeof evaluation.status === "number" ? evaluation.status || 1 : 1);
}
console.log(`Results: ${resultsFile}`);

const validation = spawnSync(process.execPath, [
  path.join(__dirname, "validate-native-evals.js"),
  "--results",
  packageName,
  suite,
  resultsFile,
], { cwd: root, env: process.env, stdio: "inherit" });
if (validation.error) {
  console.error(`Unable to validate Vally results: ${validation.error.message}`);
  process.exit(1);
}
process.exit(resolveRunExitCode(evaluation.status, validation.status));
