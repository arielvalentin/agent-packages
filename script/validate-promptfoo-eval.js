#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const [file, suite, configFile, shardArg] = process.argv.slice(2);
if (!file || !["smoke", "full"].includes(suite) || !configFile
  || (shardArg && !/^[1-4]$/.test(shardArg))) {
  console.error(
    "Usage: node script/validate-promptfoo-eval.js <eval.json> <smoke|full> <promptfoo-config> [1-4]"
  );
  process.exit(2);
}
const configPath = path.resolve(configFile);
const shard = shardArg || null;

let result;
try {
  result = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Unable to read valid Promptfoo results from ${file}: ${error.message}`);
  process.exit(1);
}

let config;
try {
  config = yaml.load(fs.readFileSync(configPath, "utf8"));
} catch (error) {
  console.error(`Unable to read valid Promptfoo config from ${configPath}: ${error.message}`);
  process.exit(1);
}

const rows = [
  result.results?.results,
  result.results?.outputs,
  result.results,
  result.outputs,
].find(Array.isArray) || [];

let invalid = false;
if (!rows.length) {
  console.error("No per-case rows in the eval output; refusing to report success.");
  invalid = true;
}

if (suite === "smoke") {
  const unexpected = rows.filter((row) => {
    const metadata = row?.testCase?.metadata || row?.metadata;
    return metadata?.suite !== "smoke";
  });
  if (unexpected.length) {
    console.error(`Smoke selection included ${unexpected.length} case(s) without suite=smoke metadata.`);
    invalid = true;
  }
}

if (shard) {
  const unexpected = rows.filter((row) => {
    const metadata = row?.testCase?.metadata || row?.metadata;
    return String(metadata?.shard) !== shard;
  });
  if (unexpected.length) {
    console.error(`Shard ${shard} results included ${unexpected.length} case(s) assigned to another shard.`);
    invalid = true;
  }
}

const contentKeys = ["skill_content", "companion_content", "review_mode_content"];
const lifecyclePath = path.resolve(
  __dirname, "../packages/agent-defaults/.apm/skills/pr-lifecycle/SKILL.md"
);
const lifecycleContent = fs.readFileSync(lifecyclePath, "utf8").trim();

function sourceContent(value) {
  if (typeof value !== "string") return "";
  if (!value.startsWith("file://")) return value;
  return fs.readFileSync(
    path.resolve(path.dirname(configPath), value.slice("file://".length)),
    "utf8"
  ).trim();
}

function normalizedVariable(value) {
  const resolved = typeof value === "string" && value.startsWith("file://")
    ? sourceContent(value)
    : value;
  return typeof resolved === "string" ? resolved.replace(/\n$/, "") : resolved;
}

function valuesFor(value) {
  return Array.isArray(value) ? value : [value];
}

function isLifecycleValue(value) {
  if (typeof value !== "string") return false;
  if (value.includes(lifecycleContent)) return true;
  if (!value.startsWith("file://")) return false;
  return path.resolve(path.dirname(configPath), value.slice("file://".length)) === lifecyclePath;
}

function testVars(testCase) {
  return testCase?.testCase?.vars || testCase?.vars || {};
}

function matchesExpectedCase(row, expected) {
  const rowDescription = row?.testCase?.description || row?.description;
  if (expected.description) return rowDescription === expected.description;
  const vars = testVars(row);
  return typeof expected.userInput === "string" && vars.user_input === expected.userInput;
}

function selectedProviders(testCase) {
  return testCase?.providers || config?.defaultTest?.providers || config?.providers || [];
}

function selectedPrompts(testCase) {
  return testCase?.prompts || config?.defaultTest?.prompts || config?.prompts || [];
}

function selectedChoice(selection, choices) {
  const index = choices.findIndex((choice) =>
    choice === selection
    || choice?.id === selection
    || choice?.label === selection
    || (typeof selection === "object" && selection !== null
      && choice?.id === selection.id && choice?.label === selection.label)
  );
  return {
    choice: index === -1 ? selection : choices[index],
    index,
  };
}

function asList(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function shardVariantKey(description, vars, varKeys, provider, promptIndex) {
  const variant = Object.fromEntries(varKeys.map((key) => {
    const value = vars?.[key];
    const normalize = normalizedVariable;
    const normalized = value === undefined
      ? null
      : Array.isArray(value) ? value.map(normalize) : normalize(value);
    return [key, normalized];
  }));
  const extraVars = Object.fromEntries(Object.keys(vars || {})
    .filter((key) => !varKeys.includes(key))
    .sort()
    .map((key) => [key, vars[key]]));
  return JSON.stringify({ description, variant, extraVars, provider, promptIndex });
}

if (shard) {
  const expectedRows = new Map();
  const expectedCases = (Array.isArray(config?.tests) ? config.tests : [])
    .filter((testCase) => suite !== "smoke" || testCase?.metadata?.suite === "smoke")
    .filter((testCase) => String(testCase?.metadata?.shard) === shard);
  const configuredProviders = asList(config?.providers);
  const configuredPrompts = asList(config?.prompts);
  const varKeys = [...new Set(expectedCases.flatMap((testCase) =>
    Object.keys(testCase?.vars || {})
  ))].sort();

  for (const testCase of expectedCases) {
    const description = typeof testCase?.description === "string" ? testCase.description : "";
    const vars = testCase?.vars || {};
    const arrayKeys = Object.keys(vars).filter((key) => Array.isArray(vars[key]));
    let variants = [vars];
    for (const key of arrayKeys) {
      variants = variants.flatMap((variant) => vars[key].map((value) => ({
        ...variant,
        [key]: value,
      })));
    }

    const providers = asList(selectedProviders(testCase));
    const prompts = asList(selectedPrompts(testCase));
    for (const variant of variants) {
      for (const providerSelection of providers) {
        const { choice: provider, index: providerIndex } =
          selectedChoice(providerSelection, configuredProviders);
        const providerIdentity = typeof provider === "object" && provider !== null
          ? { id: provider.id ?? null, label: provider.label ?? null }
          : { id: provider ?? null, label: provider ?? null };
        for (const promptSelection of prompts) {
          const { index: promptIndex } = selectedChoice(promptSelection, configuredPrompts);
          const globalPromptIndex = providerIndex < 0 || promptIndex < 0
            ? null
            : providerIndex * configuredPrompts.length + promptIndex;
          const key = shardVariantKey(
            description, variant, varKeys, providerIdentity, globalPromptIndex
          );
          expectedRows.set(key, (expectedRows.get(key) || 0) + 1);
        }
      }
    }
  }

  const actualRows = new Map();
  for (const row of rows) {
    const description = row?.testCase?.description || row?.description || "";
    const vars = { ...(row?.testCase?.vars || {}), ...(row?.vars || {}) };
    const actualVarKeys = [...new Set([...varKeys, ...Object.keys(vars)])].sort();
    const provider = {
      id: row?.provider?.id ?? null,
      label: row?.provider?.label ?? null,
    };
    const promptIndex = Number.isInteger(row?.promptIdx) ? row.promptIdx : null;
    const key = shardVariantKey(description, vars, actualVarKeys, provider, promptIndex);
    actualRows.set(key, (actualRows.get(key) || 0) + 1);
  }

  for (const [key, expectedCount] of expectedRows) {
    const actualCount = actualRows.get(key) || 0;
    if (actualCount !== expectedCount) {
      const { description, variant, provider, promptIndex } = JSON.parse(key);
      console.error(
        `Shard ${shard} expected ${expectedCount} result row(s) but received ${actualCount}: `
        + `${description || variant.user_input || "unnamed test case"} `
        + `(${provider.label || provider.id || "unknown provider"}, prompt ${promptIndex ?? "unknown"})`
      );
      invalid = true;
    }
  }
  for (const [key, actualCount] of actualRows) {
    if (!expectedRows.has(key)) {
      const { description, variant, provider, promptIndex } = JSON.parse(key);
      console.error(
        `Shard ${shard} returned ${actualCount} unexpected result row(s): `
        + `${description || variant.user_input || "unnamed test case"} `
        + `(${provider.label || provider.id || "unknown provider"}, prompt ${promptIndex ?? "unknown"})`
      );
      invalid = true;
    }
  }
}

const expectedLifecycleCases = (Array.isArray(config?.tests) ? config.tests : [])
  .filter((testCase) => suite !== "smoke" || testCase?.metadata?.suite === "smoke")
  .filter((testCase) => !shard || String(testCase?.metadata?.shard) === shard)
  .map((testCase) => ({
    description: typeof testCase?.description === "string" ? testCase.description : "",
    userInput: testCase?.vars?.user_input,
    keys: contentKeys.filter((key) => valuesFor(testCase?.vars?.[key]).some(isLifecycleValue)),
  }))
  .filter((testCase) => testCase.keys.length > 0);

const matchedRows = new Set();
for (const expected of expectedLifecycleCases) {
  const rowIndex = rows.findIndex((row, index) => {
    if (matchedRows.has(index) || !matchesExpectedCase(row, expected)) return false;
    const vars = testVars(row);
    return expected.keys.every((key) => valuesFor(vars[key]).some(isLifecycleValue));
  });
  if (rowIndex === -1) {
    const identity = expected.description || expected.userInput || "unnamed test case";
    console.error(`Missing lifecycle eval case from the selected ${suite} suite: ${identity}`);
    invalid = true;
  } else {
    matchedRows.add(rowIndex);
  }
}

const lifecycleRows = rows.filter((row) => contentKeys.some((key) =>
  valuesFor(testVars(row)[key]).some(isLifecycleValue)
));

function promptIncludes(rendered, content) {
  // Promptfoo trims file boundaries when rendering chat messages.
  content = content.trim();
  return rendered.includes(content)
    || rendered.includes(JSON.stringify(content).slice(1, -1));
}

for (const row of lifecycleRows) {
  const promptTokens = row.tokenUsage?.prompt;
  const outputReserve = 512;
  const contextWindow = 16384;
  const prompt = row.prompt?.raw;
  const vars = testVars(row);
  const providerLabel = row.provider?.label;
  if (!["skill-under-test", "policy-chat"].includes(providerLabel)) {
    console.error(
      `Unexpected provider for full PR-lifecycle test: `
      + `${row.description || row.testCase?.description || "?"} (${providerLabel || "unknown"})`
    );
    invalid = true;
  }
  if (typeof prompt !== "string") {
    console.error(`Missing rendered prompt for ${row.description || row.testCase?.description || "?"}.`);
    invalid = true;
  } else {
    for (const key of contentKeys) {
      for (const value of valuesFor(vars[key])) {
        const content = sourceContent(value);
        if (content && !promptIncludes(prompt, content)) {
          console.error(
            `Rendered lifecycle prompt omits ${key}: `
            + `${row.description || row.testCase?.description || "?"}`
          );
          invalid = true;
        }
      }
    }
  }
  if (!Number.isInteger(promptTokens) || promptTokens <= 0
    || promptTokens + outputReserve > contextWindow) {
    console.error(
      `Complete lifecycle prompt exceeds the 16K context budget: `
      + `${row.description || row.testCase?.description || "?"} `
      + `(prompt=${promptTokens ?? "unknown"}, reserve=${outputReserve}, context=${contextWindow})`
    );
    invalid = true;
  }
}

for (const row of rows.filter((item) => item && !item.success)) {
  console.log("FAIL: " + (row.description || row.testCase?.description || row.vars?.user_input || "?"));
  console.log("  source: " + JSON.stringify(row.testCase?.vars?.skill_content ?? row.vars?.skill_content ?? null).slice(0, 300));
  console.log("  provider: " + JSON.stringify(row.provider ?? null));
  console.log("  prompt: " + JSON.stringify(row.vars?.user_input || "").slice(0, 300));
  console.log("  output: " + JSON.stringify(row.response?.output || "").slice(0, 500));
  for (const component of row.gradingResult?.componentResults || []) {
    if (!component.pass) console.log("  reason: " + component.reason);
  }
}

if (invalid || rows.some((row) => row && !row.success)) {
  process.exitCode = 1;
}
