#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const yaml = require("js-yaml");

const packages = ["agent-defaults", "coordinator", "development-workflow", "code-reviewers"];
const configPath = (name) => `packages/${name}/tests/promptfooconfig.yaml`;
const isSmoke = (test) => test.metadata?.suite === "smoke";
const patternFor = (descriptions) =>
  `^(?:${descriptions.map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`;

function strings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

function inventory(root) {
  return packages.map((name) => {
    const file = configPath(name);
    try {
      const config = yaml.load(fs.readFileSync(path.join(root, file), "utf8"));
      if (!config || !Array.isArray(config.tests) || !config.tests.length) {
        throw new Error("tests must be a nonempty inline array");
      }
      const { tests, ...shared } = config;
      if (Object.keys(shared).some((key) => !["description", "providers", "prompts", "defaultTest"].includes(key)) ||
          Object.keys(config.defaultTest || {}).some((key) => !["providers", "prompts"].includes(key))) {
        throw new Error("unrecognized shared configuration may load external inputs");
      }
      if (strings(shared).some((text) => text.includes("file://"))) {
        throw new Error("file references outside tests are unsupported");
      }
      if (!Array.isArray(config.providers) || config.providers.some((provider) => {
        const id = typeof provider === "string" ? provider : provider?.id;
        return typeof id !== "string" || !/^(?:echo|ollama:(?:chat:)?[a-z0-9._:-]+)$/i.test(id);
      }) || !Array.isArray(config.prompts) || config.prompts.some((prompt) => {
        const raw = typeof prompt === "string" ? prompt : prompt?.raw;
        return typeof raw !== "string" || !raw.includes("{{") ||
          /{[%#][-+]?\s*(?:include|import|from|extends)\b/.test(raw);
      })) {
        throw new Error("external providers or prompts are unsupported");
      }
      const providerAliases = new Set(config.providers.flatMap((provider) =>
        typeof provider === "string" ? [provider] : [provider.id, provider.label].filter(Boolean)));
      const promptAliases = new Set(config.prompts.flatMap((prompt) =>
        typeof prompt === "string" ? [prompt] : [prompt.id].filter(Boolean)));
      function validOverrides(overrides, known) {
        return overrides === undefined || (Array.isArray(overrides) &&
          overrides.every((alias) => typeof alias === "string" && known.has(alias)));
      }
      if (!validOverrides(config.defaultTest?.providers, providerAliases) ||
          !validOverrides(config.defaultTest?.prompts, promptAliases)) {
        throw new Error("default overrides must reference declared local providers/prompts");
      }
      const descriptions = new Set();
      const cases = tests.map((test) => {
        if (!test || typeof test !== "object" || typeof test.description !== "string" ||
            !test.description || descriptions.has(test.description)) {
          throw new Error("cases require unique nonempty descriptions");
        }
        descriptions.add(test.description);
        if (!validOverrides(test.providers, providerAliases) ||
            !validOverrides(test.prompts, promptAliases)) {
          throw new Error("case overrides must reference declared local providers/prompts");
        }
        if (Object.keys(test).some((key) =>
          !["description", "vars", "metadata", "assert", "providers", "prompts"].includes(key))) {
          throw new Error("unrecognized case configuration may load external inputs");
        }
        const { vars, ...outsideVars } = test;
        if (vars !== undefined && (!vars || typeof vars !== "object" || Array.isArray(vars))) {
          throw new Error("test vars must be an inline mapping");
        }
        if (strings(outsideVars).some((text) => text.includes("file://"))) {
          throw new Error("file references outside test vars are unsupported");
        }
        const assertions = [...(config.defaultTest?.assert || []), ...(test.assert || [])];
        if (assertions.some((assertion) =>
          !["javascript", "icontains", "contains", "not-contains"].includes(assertion.type))) {
          throw new Error("assertion type may load external inputs");
        }
        if (assertions.some((assertion) =>
          assertion.type === "javascript" &&
          /\b(?:require|import|fs|readFileSync|readFile|process|fetch)\b/.test(String(assertion.value)))) {
          throw new Error("JavaScript assertions with external inputs are unsupported");
        }
        const inputs = new Set();
        for (const [key, value] of Object.entries(vars || {})) {
          if (typeof value !== "string" &&
              !(Array.isArray(value) && value.every((item) => typeof item === "string"))) {
            throw new Error("only scalar strings or string arrays are supported vars");
          }
          for (const text of strings(value)) {
            if (text.includes("file://") && !text.startsWith("file://")) {
              throw new Error("embedded file reference is unsupported");
            }
            if (!text.startsWith("file://")) {
              if (key !== "user_input" && /^[a-z][a-z0-9+.-]*:/i.test(text)) {
                throw new Error("non-file input scheme is unsupported");
              }
              continue;
            }
            const relative = text.slice(7);
            if (!relative || /[*?[\]{}:]|[\r\n]/.test(relative)) {
              throw new Error(`unsupported file reference: ${text}`);
            }
            const absolute = path.resolve(root, path.dirname(file), relative);
            const source = path.relative(root, absolute).split(path.sep).join("/");
            const resolved = path.relative(fs.realpathSync(root), fs.realpathSync(absolute));
            if (source.startsWith("../") || path.isAbsolute(source) ||
                resolved.startsWith(`..${path.sep}`) || path.isAbsolute(resolved) ||
                resolved.split(path.sep).join("/") !== source ||
                !fs.statSync(absolute).isFile()) {
              throw new Error(`input is not a repository file: ${text}`);
            }
            inputs.add(source);
          }
        }
        return { ...test, inputs };
      });
      if (!cases.some(isSmoke)) throw new Error("package has no smoke-tagged cases");
      return { name, file, cases };
    } catch (error) {
      return { name, file, cases: [], unsupported: error.message };
    }
  });
}

function select(changes, configs) {
  const selected = new Map(configs.map((config) => [config.name, new Set()]));
  const fallback = new Set();
  const reasons = [];
  function smoke(config) {
    if (config.unsupported) fallback.add(config.name);
    else config.cases.filter(isSmoke).forEach((test) => selected.get(config.name).add(test.description));
  }
  function baseline(reason) {
    configs.forEach(smoke);
    reasons.push(reason);
  }
  for (const config of configs) {
    if (config.unsupported) {
      fallback.add(config.name);
      reasons.push(`${config.name}: package smoke fallback: ${config.unsupported}`);
    }
  }
  if (!changes.length) baseline("No local changes: all-package smoke fallback.");
  for (const changed of changes) {
    const owner = configs.find((config) => changed.startsWith(`packages/${config.name}/`));
    if (owner && changed.startsWith(`packages/${owner.name}/tests/`)) {
      smoke(owner);
      reasons.push(`${changed}: package test configuration -> package smoke.`);
      continue;
    }
    const matches = configs.flatMap((config) => config.cases
      .filter((test) => test.inputs.has(changed)).map((test) => ({ config, test })));
    const smokeMatches = matches.filter(({ test }) => isSmoke(test));
    const chosen = smokeMatches.length ? smokeMatches : matches;
    if (chosen.length) {
      chosen.forEach(({ config, test }) => selected.get(config.name).add(test.description));
      reasons.push(`${changed}: ${chosen.length} ${smokeMatches.length ? "smoke" : "non-smoke (no smoke coverage)"} definition(s).`);
    } else if (owner && changed.startsWith(`packages/${owner.name}/.apm/`)) {
      smoke(owner);
      reasons.push(`${changed}: coverage gap -> owning package smoke fallback.`);
    } else if (/^(?:docs\/[^/].*\.md|README\.md|CHANGELOG\.md|packages\/[^/]+\/(?:README|CHANGELOG)\.md|\.github\/workflows\/[^/]+\.ya?ml)$/.test(changed)) {
      reasons.push(`${changed}: explicitly allowlisted non-input documentation/workflow.`);
    } else {
      baseline(`${changed}: unmapped/shared input -> all-package smoke fallback.`);
    }
  }
  const runs = configs.flatMap((config) => {
    if (fallback.has(config.name)) return [{ name: config.name, file: config.file, suite: "smoke", descriptions: null }];
    const descriptions = config.cases.filter((test) => selected.get(config.name).has(test.description))
      .map((test) => test.description);
    if (!descriptions.length) return [];
    return [{
      name: config.name, file: config.file, descriptions,
      suite: config.cases.filter((test) => selected.get(config.name).has(test.description)).every(isSmoke)
        ? "smoke" : "full",
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

function execute(root, plan, noCache, spawn = spawnSync) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "affected-tests-"));
  try {
    for (const [index, run] of plan.runs.entries()) {
      const output = path.join(temporary, `${index}.json`);
      const args = ["--no-install", "promptfoo", "eval", "--config", run.file, "--output", output];
      if (run.suite === "smoke") args.push("--filter-metadata", "suite=smoke");
      if (run.descriptions) args.push("--filter-pattern", patternFor(run.descriptions));
      if (noCache) args.push("--no-cache");
      const evaluation = spawn("npx", args, { cwd: root, stdio: "inherit" });
      if (evaluation.error) throw evaluation.error;
      let validationStatus = 1;
      if (!fs.existsSync(output) || !fs.statSync(output).size) {
        console.error("Promptfoo did not produce eval results; refusing to report success.");
      } else {
        const validatorArgs = ["script/validate-promptfoo-eval.js", output, run.suite];
        if (run.descriptions) {
          const expected = path.join(temporary, `${index}-expected.json`);
          fs.writeFileSync(expected, JSON.stringify(run.descriptions));
          validatorArgs.push(expected);
        }
        const validation = spawn(process.execPath, validatorArgs, { cwd: root, stdio: "inherit" });
        if (validation.error) throw validation.error;
        validationStatus = validation.status ?? 1;
      }
      const status = evaluation.status ?? 1;
      if (status !== 0 || validationStatus !== 0) return status || validationStatus;
    }
    return 0;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function main(args) {
  let base;
  let dryRun = false;
  let noCache = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--dry-run") dryRun = true;
    else if (args[index] === "--no-cache") noCache = true;
    else if (args[index] === "--base" && args[index + 1] && !args[index + 1].startsWith("-")) {
      base = args[++index];
    } else throw new Error("Usage: npm run test:affected -- [--dry-run] [--no-cache] [--base <ref>]");
  }
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  const plan = select(changedPaths(root, base), inventory(root));
  for (const reason of plan.reasons) console.log(reason);
  for (const run of plan.runs) {
    console.log(`${run.name}: ${run.descriptions?.length ?? "all"} ${run.suite} definition(s)`);
  }
  if (!plan.runs.length) console.log("Nothing to run: all changed paths are explicitly classified non-inputs.");
  if (dryRun) console.log(JSON.stringify(plan, null, 2));
  return dryRun ? 0 : execute(root, plan, noCache);
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { packages, configPath, patternFor, inventory, select, changedPaths, execute };
