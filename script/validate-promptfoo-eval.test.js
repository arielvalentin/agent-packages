const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const lifecyclePath = path.resolve("packages/agent-defaults/.apm/skills/pr-lifecycle/SKILL.md");
const lifecycleReferencePath = path.resolve(
  "packages/agent-defaults/.apm/skills/pr-lifecycle/references/readiness.md"
);
const lifecycleReference = fs.readFileSync(lifecycleReferencePath, "utf8");
const contentKeys = ["skill_content", "companion_content", "review_mode_content"];
const validatorPath = "script/validate-promptfoo-eval.js";

function makeConfig(directory, cases) {
  const configFile = path.join(directory, "promptfooconfig.yaml");
  fs.writeFileSync(configFile, JSON.stringify({ tests: cases }));
  return configFile;
}

function runValidator(configFile, suite, rows) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-eval-"));
  try {
    const file = path.join(directory, "eval.json");
    fs.writeFileSync(file, JSON.stringify({ results: rows }));
    return spawnSync(process.execPath, [
      validatorPath, file, suite, configFile,
    ], { encoding: "utf8" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function fixtureRow(key, {
  tokens = 9000, complete = true, expanded = false, trim = false,
} = {}) {
  const reference = `file://${lifecycleReferencePath}`;
  const vars = {
    skill_content: "Primary instructions",
    [key]: expanded ? lifecycleReference : [reference],
  };
  let prompt = complete ? Object.values(vars).flatMap(valuesFor).map(sourceContent).join("\n")
    : "Truncated instructions";
  if (trim) prompt = prompt.trim();
  return {
    success: true,
    testCase: {
      description: "lifecycle fixture",
      metadata: { suite: "smoke" },
      vars,
    },
    provider: { label: "policy-chat" },
    prompt: { raw: JSON.stringify([{ role: "system", content: prompt }]) },
    tokenUsage: { prompt: tokens },
  };
}

function valuesFor(value) {
  return Array.isArray(value) ? value : [value];
}

function sourceContent(value) {
  if (typeof value !== "string") return "";
  if (!value.startsWith("file://")) return value;
  return fs.readFileSync(
    path.resolve(path.dirname(validatorPath), value.slice("file://".length)),
    "utf8"
  );
}

function validateFixture(key, options) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-config-"));
  try {
    const configFile = makeConfig(directory, [{
      description: "lifecycle fixture",
      metadata: { suite: "smoke" },
      vars: { [key]: `file://${lifecycleReferencePath}` },
    }]);
    return runValidator(configFile, "smoke", [fixtureRow(key, options)]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

for (const key of contentKeys) {
  test(`${key} lifecycle content is checked in the rendered prompt and token budget`, () => {
    assert.equal(validateFixture(key).status, 0);
    assert.equal(validateFixture(key, { trim: true }).status, 0);
    const truncated = validateFixture(key, { complete: false });
    assert.equal(truncated.status, 1);
    assert.match(truncated.stderr, /Rendered lifecycle prompt omits/);
    for (const tokens of [15873, null, 0.5, 0, -1]) {
      const overBudget = validateFixture(key, { tokens });
      assert.equal(overBudget.status, 1);
      assert.match(overBudget.stderr, /16K context budget/);
    }
    assert.equal(validateFixture(key, { tokens: 15872 }).status, 0);
    const expanded = validateFixture(key, { expanded: true, complete: false });
    assert.equal(expanded.status, 1);
    assert.match(expanded.stderr, /Rendered lifecycle prompt omits/);
  });
}

function unrelatedRow(metadata = { suite: "smoke" }) {
  return {
    success: true,
    description: "unrelated test",
    testCase: { description: "unrelated test", metadata, vars: { skill_content: "Other instructions" } },
  };
}

test("development-workflow smoke results must include the companion lifecycle case", () => {
  const configFile = "packages/development-workflow/tests/promptfooconfig.yaml";
  const result = runValidator(configFile, "smoke", [unrelatedRow()]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing lifecycle eval case from the selected smoke suite: routing: ordinary requests default to implementer/);
});

test("agent-defaults results must include each selected lifecycle case", () => {
  const configFile = "packages/agent-defaults/tests/promptfooconfig.yaml";
  const result = runValidator(configFile, "smoke", [unrelatedRow()]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing lifecycle eval case from the selected smoke suite: pr-lifecycle: applies event eligibility only to Actions jobs/);
});

test("phase references are recognized as complete PR-lifecycle eval cases", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-config-"));
  try {
    const configFile = makeConfig(directory, [{
      description: "lifecycle reference fixture",
      metadata: { suite: "smoke" },
      vars: {
        companion_content: `file://${lifecycleReferencePath}`,
      },
    }]);
    const result = runValidator(configFile, "smoke", [unrelatedRow()]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing lifecycle eval case from the selected smoke suite: lifecycle reference fixture/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a lifecycle phase reference cannot replace the configured root skill", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-config-"));
  try {
    const configFile = makeConfig(directory, [{
      description: "lifecycle fixture",
      metadata: { suite: "smoke" },
      vars: { skill_content: `file://${lifecyclePath}` },
    }]);
    const row = fixtureRow("skill_content");
    const result = runValidator(configFile, "smoke", [row]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing lifecycle eval case from the selected smoke suite: lifecycle fixture/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("missing required lifecycle references fail closed", () => {
  const directory = fs.mkdtempSync(path.join(__dirname, "lifecycle-validator-"));
  try {
    const scriptDirectory = path.join(directory, "script");
    const lifecycleDirectory = path.join(
      directory, "packages/agent-defaults/.apm/skills/pr-lifecycle"
    );
    fs.mkdirSync(scriptDirectory, { recursive: true });
    fs.mkdirSync(lifecycleDirectory, { recursive: true });
    fs.copyFileSync(validatorPath, path.join(scriptDirectory, "validate-promptfoo-eval.js"));
    fs.writeFileSync(path.join(lifecycleDirectory, "SKILL.md"), "root instructions");

    const configFile = makeConfig(directory, []);
    const resultFile = path.join(directory, "eval.json");
    fs.writeFileSync(resultFile, JSON.stringify({ results: [unrelatedRow()] }));
    const result = spawnSync(process.execPath, [
      path.join(scriptDirectory, "validate-promptfoo-eval.js"),
      resultFile,
      "smoke",
      configFile,
    ], { encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unable to read required PR-lifecycle source/);
    assert.match(result.stderr, /readiness\.md/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("full development-workflow results must include every lifecycle case", () => {
  const configFile = "packages/development-workflow/tests/promptfooconfig.yaml";
  const result = runValidator(configFile, "full", [unrelatedRow({})]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /routing: ordinary requests default to implementer/);
  assert.match(result.stderr, /implementer: generates a repository-required title/);
});

test("configs and suites without lifecycle cases retain their existing behavior", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-config-"));
  try {
    const configFile = makeConfig(directory, [{
      description: "full-only lifecycle case",
      metadata: { suite: "full" },
      vars: { review_mode_content: `file://${lifecyclePath}` },
    }]);
    const result = runValidator(configFile, "smoke", [unrelatedRow()]);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  const configFile = "packages/coordinator/tests/promptfooconfig.yaml";
  const result = runValidator(configFile, "smoke", [unrelatedRow()]);
  assert.equal(result.status, 0, result.stderr);
});
