#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateNativeSuite } = require("./validate-native-evals.js");

const packages = ["agent-defaults", "coordinator", "development-workflow", "code-reviewers"];
const isSmoke = (test) => test.suite === "smoke";

function repositoryPath(root, baseFile, relative, label) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a nonempty repository-relative path.`);
  }
  const absolute = path.resolve(root, path.dirname(baseFile), relative);
  const result = path.relative(root, absolute).split(path.sep).join("/");
  if (result === ".." || result.startsWith("../") || path.isAbsolute(result)) {
    throw new Error(`${label} escapes the repository: ${relative}`);
  }
  return result;
}

function inputValues(value, callback) {
  if (typeof value === "string") callback(value);
  else if (Array.isArray(value)) value.forEach((item) => inputValues(item, callback));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => inputValues(item, callback));
  }
}

function inventory(root) {
  root = path.resolve(root);
  return packages.map((name) => {
    const preflight = validateNativeSuite(root, name, "full");
    if (preflight.errors.length) {
      throw new Error(`${name} native inventory is invalid:\n${preflight.errors.join("\n")}`);
    }
    const sourceConfig = preflight.suiteMap.sourceConfig;
    if (typeof sourceConfig !== "string" || !sourceConfig) {
      throw new Error(`${name} migration map has no source config path.`);
    }
    const stimuliByName = new Map(preflight.stimuli.map((stimulus) => [
      stimulus.name,
      stimulus,
    ]));
    const cases = preflight.expectedEntries.map((entry) => {
      const stimulus = stimuliByName.get(entry.targetStimulus);
      if (!stimulus) {
        throw new Error(`${entry.sourceDescription} has no native stimulus.`);
      }
      const inputs = new Set();
      const directories = new Set();
      inputValues(entry.sourceVariables, (value) => {
        if (value.startsWith("file://")) {
          inputs.add(repositoryPath(
            root,
            sourceConfig,
            value.slice("file://".length),
            `${entry.sourceDescription} source input`
          ));
        }
      });
      if (entry.nativeContextFixture) {
        inputs.add(repositoryPath(
          root,
          preflight.suiteMap.evalFile,
          entry.nativeContextFixture,
          `${entry.sourceDescription} native context fixture`
        ));
      }
      for (const file of stimulus.agent_environment?.files || []) {
        inputs.add(repositoryPath(
          root,
          preflight.suiteMap.evalFile,
          file.src,
          `${entry.sourceDescription} native file input`
        ));
      }
      for (const skill of stimulus.agent_environment?.skills || []) {
        const directory = repositoryPath(
          root,
          preflight.suiteMap.evalFile,
          skill,
          `${entry.sourceDescription} native skill input`
        );
        directories.add(directory.endsWith("/") ? directory : `${directory}/`);
      }
      return {
        description: entry.sourceDescription,
        stimulus: entry.targetStimulus,
        suite: entry.sourceSuite,
        inputs,
        directories,
      };
    });
    return { name, cases };
  });
}

function isPackageTestPath(changed, name) {
  return changed.startsWith(`packages/${name}/tests/`)
    || new RegExp(`^packages/${name}/evals/[^/]+\\.eval\\.ya?ml$`).test(changed);
}

function isPackageApMPath(changed, name) {
  return changed.startsWith(`packages/${name}/.apm/`);
}

function isAllowlistedNonInput(changed) {
  return /^(?:docs\/[^/].*\.md|README\.md|CHANGELOG\.md|packages\/[^/]+\/(?:README|CHANGELOG)\.md|\.github\/workflows\/[^/]+\.ya?ml)$/i
    .test(changed);
}

function select(changes, configs) {
  const selected = new Map(configs.map((config) => [config.name, new Set()]));
  const reasons = [];
  function addSmoke(config) {
    config.cases.filter(isSmoke).forEach((test) => selected.get(config.name).add(test.stimulus));
  }
  let useAllSmokeFallback = false;
  function allSmoke(reason) {
    useAllSmokeFallback = true;
    reasons.push(reason);
  }

  if (!changes.length) allSmoke("No local changes: all-package smoke fallback.");
  for (const changed of changes) {
    const owner = configs.find((config) => changed.startsWith(`packages/${config.name}/`));
    const packageTestPath = owner && isPackageTestPath(changed, owner.name);
    if (packageTestPath) {
      addSmoke(owner);
      reasons.push(`${changed}: package test/eval configuration -> owning package smoke.`);
    }

    const matches = configs.flatMap((config) => config.cases
      .filter((test) => test.inputs.has(changed)
        || [...test.directories].some((directory) =>
          changed === directory.slice(0, -1) || changed.startsWith(directory)))
      .map((test) => ({ package: config.name, test })));
    const smokeMatches = matches.filter(({ test }) => isSmoke(test));
    const chosen = smokeMatches.length ? smokeMatches : matches;
    if (chosen.length) {
      chosen.forEach(({ package: packageName, test }) => {
        selected.get(packageName).add(test.stimulus);
      });
      reasons.push(`${changed}: ${chosen.length} declared native input match(es) `
        + `${smokeMatches.length ? "in smoke" : "with no smoke coverage; selected full cases"}.`);
    } else if (owner && isPackageApMPath(changed, owner.name)) {
      addSmoke(owner);
      reasons.push(`${changed}: declared-input coverage gap -> owning package smoke fallback; `
        + "this does not establish coverage for the changed file.");
    } else if (isAllowlistedNonInput(changed)) {
      reasons.push(`${changed}: allowlisted documentation/workflow non-input.`);
    } else if (!packageTestPath) {
      allSmoke(`${changed}: unmapped/shared input -> all-package smoke fallback.`);
    }
  }

  if (useAllSmokeFallback) {
    selected.forEach((stimuli) => stimuli.clear());
    configs.forEach(addSmoke);
  }

  const runs = configs.flatMap((config) => {
    const stimuli = config.cases
      .filter((test) => selected.get(config.name).has(test.stimulus));
    if (!stimuli.length) return [];
    return [{
      name: config.name,
      suite: stimuli.every(isSmoke) ? "smoke" : "full",
      stimuli: stimuli.map((test) => test.stimulus),
    }];
  });
  return { changes, reasons, runs };
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.error?.message || result.stderr.trim()}`);
  }
  return result.stdout;
}

function changedPaths(root, base) {
  const outputs = [
    git(root, ["diff", "--cached", "--name-only", "--no-renames", "-z"]),
    git(root, ["diff", "--name-only", "--no-renames", "-z"]),
    git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ];
  if (base) {
    const ancestor = git(root, ["merge-base", "HEAD", base]).trim();
    outputs.push(git(root, ["diff", "--name-only", "--no-renames", "-z", ancestor, "HEAD"]));
  }
  return [...new Set(outputs.flatMap((output) => output.split("\0").filter(Boolean)))].sort();
}

function execute(root, plan, spawn = spawnSync, env = process.env) {
  for (const run of plan.runs) {
    const args = [path.join(root, "script/run-evals.js"), run.name, run.suite];
    if (run.stimuli) args.push("--stimuli", JSON.stringify(run.stimuli));
    const options = { cwd: root, stdio: "inherit" };
    if (env.VALLY_RESULTS_DIR) {
      options.env = {
        ...env,
        VALLY_RESULTS_DIR: path.join(path.resolve(root, env.VALLY_RESULTS_DIR), run.name),
      };
    }
    const result = spawn(process.execPath, args, options);
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

function main(args) {
  let base;
  let dryRun = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--dry-run") dryRun = true;
    else if (args[index] === "--base" && args[index + 1] && !args[index + 1].startsWith("-")) {
      base = args[++index];
    } else {
      throw new Error("Usage: npm run test:affected -- [--dry-run] [--base <ref>]");
    }
  }
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  const plan = select(changedPaths(root, base), inventory(root));
  for (const reason of plan.reasons) console.log(reason);
  for (const run of plan.runs) {
    console.log(`${run.name}: ${run.stimuli.length} selected ${run.suite} stimulus/stimuli`);
  }
  if (!plan.runs.length) console.log("Nothing to run: all changed paths are explicitly classified non-inputs.");
  if (dryRun) console.log(JSON.stringify(plan, null, 2));
  return dryRun ? 0 : execute(root, plan);
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { packages, inventory, select, changedPaths, execute, main };
