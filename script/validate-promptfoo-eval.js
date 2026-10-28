#!/usr/bin/env node

const fs = require("node:fs");

const [file, suite] = process.argv.slice(2);
if (!file || !["smoke", "full"].includes(suite)) {
  console.error("Usage: node script/validate-promptfoo-eval.js <eval.json> <smoke|full>");
  process.exit(2);
}

let result;
try {
  result = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Unable to read valid Promptfoo results from ${file}: ${error.message}`);
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
  const unexpected = rows.filter((row) => row?.testCase?.metadata?.suite !== "smoke");
  if (unexpected.length) {
    console.error(`Smoke selection included ${unexpected.length} case(s) without suite=smoke metadata.`);
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
