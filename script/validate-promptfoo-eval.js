#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const [file, suite, configFile] = process.argv.slice(2);
if (!file || !["smoke", "full"].includes(suite) || !configFile) {
  console.error("Usage: node script/validate-promptfoo-eval.js <eval.json> <smoke|full> <promptfoo-config>");
  process.exit(2);
}
const configPath = path.resolve(configFile);

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
  );
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

const expectedLifecycleCases = (Array.isArray(config?.tests) ? config.tests : [])
  .filter((testCase) => suite !== "smoke" || testCase?.metadata?.suite === "smoke")
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
