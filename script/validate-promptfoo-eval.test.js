const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { loadApiProviders } = require("promptfoo");
const yaml = require("js-yaml");

const lifecyclePath = path.resolve("packages/agent-defaults/.apm/skills/pr-lifecycle/SKILL.md");
const lifecycle = fs.readFileSync(lifecyclePath, "utf8");
const contentKeys = ["skill_content", "companion_content", "review_mode_content"];
const validatorPath = "script/validate-promptfoo-eval.js";

function makeConfig(directory, cases) {
  const configFile = path.join(directory, "promptfooconfig.yaml");
  fs.writeFileSync(configFile, JSON.stringify({
    providers: [
      { id: "ollama:chat:llama3.2:3b", label: "policy-chat" },
      { id: "ollama:other:3b", label: "policy-chat-alt" },
    ],
    prompts: [
      { id: "policy-chat", raw: "{{user_input}}" },
      { id: "policy-chat-alt", raw: "Alternate: {{user_input}}" },
    ],
    defaultTest: { providers: ["policy-chat"], prompts: ["policy-chat"] },
    tests: cases,
  }));
  return configFile;
}

function runValidator(configFile, suite, rows, shard) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-eval-"));
  try {
    const file = path.join(directory, "eval.json");
    fs.writeFileSync(file, JSON.stringify({ results: rows }));
    return spawnSync(process.execPath, [
      validatorPath, file, suite, configFile, ...(shard ? [shard] : []),
    ], { encoding: "utf8" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function runValidatorWithFile(configFile, file) {
  return spawnSync(process.execPath, [
    validatorPath, file, "smoke", configFile,
  ], { encoding: "utf8" });
}

function fixtureRow(key, {
  tokens = 9000, complete = true, expanded = false, trim = false, shard = 1,
} = {}) {
  const reference = `file://${lifecyclePath}`;
  const vars = {
    skill_content: "Primary instructions",
    [key]: expanded ? lifecycle : [reference],
    user_input: "selected input",
  };
  let prompt = complete ? Object.values(vars).map((value) =>
    Array.isArray(value) ? lifecycle : value
  ).join("\n") : "Truncated instructions";
  if (trim) prompt = prompt.trim();
  return {
    success: true,
    testCase: {
      description: "lifecycle fixture",
      metadata: { suite: "smoke", shard },
      vars,
    },
    provider: { id: "ollama:chat:llama3.2:3b", label: "policy-chat" },
    prompt: { raw: JSON.stringify([{ role: "system", content: prompt }]) },
    promptIdx: 0,
    tokenUsage: { prompt: tokens },
  };
}

function validateFixture(key, options) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-config-"));
  try {
    const configFile = makeConfig(directory, [{
      description: "lifecycle fixture",
      metadata: { suite: "smoke" },
      vars: { [key]: `file://${lifecyclePath}` },
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

test("missing and empty result files fail closed", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "empty-eval-"));
  try {
    const configFile = makeConfig(directory, []);
    const missingFile = runValidatorWithFile(configFile, path.join(directory, "missing.json"));
    assert.equal(missingFile.status, 1);
    assert.match(missingFile.stderr, /Unable to read valid Promptfoo results/);

    const zeroByteFile = path.join(directory, "zero-byte.json");
    fs.writeFileSync(zeroByteFile, "");
    const zeroByteResults = runValidatorWithFile(configFile, zeroByteFile);
    assert.equal(zeroByteResults.status, 1);
    assert.match(zeroByteResults.stderr, /Unable to read valid Promptfoo results/);

    const emptyFile = path.join(directory, "empty.json");
    fs.writeFileSync(emptyFile, JSON.stringify({ results: { results: [] } }));
    const emptyResults = runValidatorWithFile(configFile, emptyFile);
    assert.equal(emptyResults.status, 1);
    assert.match(emptyResults.stderr, /No per-case rows in the eval output/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("failed result rows keep the validator exit status nonzero", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "failed-eval-"));
  try {
    const configFile = makeConfig(directory, []);
    const failed = runValidator(configFile, "smoke", [{
      success: false,
      description: "failed fixture",
      testCase: { description: "failed fixture", metadata: { suite: "smoke" } },
      response: { output: "model failure" },
    }]);
    assert.equal(failed.status, 1);
    assert.match(failed.stdout, /FAIL: failed fixture/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

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

test("sharded results include every selected lifecycle case and no other shard", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-config-"));
  try {
    const whitespaceFile = path.join(directory, "rendered-content.md");
    fs.writeFileSync(whitespaceFile, "\n  file instructions \n");
    const configFile = makeConfig(directory, [
      {
        description: "selected lifecycle fixture",
        metadata: { suite: "smoke", shard: 1 },
        vars: { skill_content: `file://${lifecyclePath}`, user_input: "selected input" },
      },
      {
        description: "other lifecycle fixture",
        metadata: { suite: "smoke", shard: 2 },
        vars: { skill_content: `file://${lifecyclePath}` },
      },
      {
        description: "selected non-lifecycle fixture",
        metadata: { suite: "smoke", shard: 1 },
        vars: { user_input: "non-lifecycle case" },
      },
      {
        description: "expanded fixture",
        metadata: { suite: "smoke", shard: 1 },
        vars: {
          skill_content: `file://${lifecyclePath}`,
          user_input: ["first input", "second input"],
        },
      },
      {
        description: "provider-prompt fixture",
        metadata: { suite: "smoke", shard: 1 },
        providers: ["policy-chat", "policy-chat-alt"],
        prompts: ["policy-chat", "policy-chat-alt"],
        vars: { user_input: "combo input" },
      },
      {
        description: "trimmed file fixture",
        metadata: { suite: "smoke", shard: 1 },
        vars: { skill_content: `file://${whitespaceFile}`, user_input: "file input" },
      },
      {
        description: "multiline fixture",
        metadata: { suite: "smoke", shard: 1 },
        vars: { user_input: "line one\nline two\n" },
      },
      {
        description: "double-newline fixture",
        metadata: { suite: "smoke", shard: 1 },
        vars: { user_input: "line one\nline two\n\n" },
      },
    ]);
    const selected = fixtureRow("skill_content");
    selected.testCase.description = "selected lifecycle fixture";
    selected.testCase.vars.skill_content = `file://${lifecyclePath}`;
    const nonLifecycle = {
      success: true,
      testCase: {
        description: "selected non-lifecycle fixture",
        metadata: { suite: "smoke", shard: 1 },
        vars: { user_input: "non-lifecycle case" },
      },
      provider: { id: "ollama:chat:llama3.2:3b", label: "policy-chat" },
      promptIdx: 0,
    };
    const expandedRows = ["first input", "second input"].map((userInput) => {
      const row = fixtureRow("skill_content");
      row.testCase.description = "expanded fixture";
      row.testCase.vars.skill_content = `file://${lifecyclePath}`;
      row.testCase.vars.user_input = userInput;
      return row;
    });
    const comboRows = [
      { provider: { id: "ollama:chat:llama3.2:3b", label: "policy-chat" }, promptIdx: 0 },
      { provider: { id: "ollama:chat:llama3.2:3b", label: "policy-chat" }, promptIdx: 1 },
      { provider: { id: "ollama:other:3b", label: "policy-chat-alt" }, promptIdx: 2 },
      { provider: { id: "ollama:other:3b", label: "policy-chat-alt" }, promptIdx: 3 },
    ].map(({ provider, promptIdx }) => ({
      success: true,
      testCase: {
        description: "provider-prompt fixture",
        metadata: { suite: "smoke", shard: 1 },
        vars: { user_input: "combo input" },
      },
      provider,
      promptIdx,
    }));
    const normalizedRows = [
      {
        description: "trimmed file fixture",
        vars: { skill_content: "file instructions", user_input: "file input" },
      },
      {
        description: "multiline fixture",
        vars: { user_input: "line one\nline two\n" },
      },
      {
        description: "double-newline fixture",
        vars: { user_input: "line one\nline two\n\n" },
      },
    ].map(({ description, vars }) => ({
      success: true,
      testCase: { description, metadata: { suite: "smoke", shard: 1 }, vars },
      provider: { id: "ollama:chat:llama3.2:3b", label: "policy-chat" },
      promptIdx: 0,
    }));
    const selectedRows = [selected, nonLifecycle, ...expandedRows, ...comboRows, ...normalizedRows];
    const result = runValidator(configFile, "smoke", selectedRows, "1");
    assert.equal(result.status, 0, result.stderr);

    const missingCase = runValidator(configFile, "smoke", [...selectedRows.filter(
      (row) => row.testCase.description !== "expanded fixture"
    ), expandedRows[0]], "1");
    assert.equal(missingCase.status, 1);
    assert.match(missingCase.stderr, /expected 1 result row\(s\) but received 0: expanded fixture/);

    const duplicate = runValidator(configFile, "smoke", [...selectedRows, expandedRows[0]], "1");
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /expected 1 result row\(s\) but received 2: expanded fixture/);

    const wrongScalar = {
      ...selected,
      testCase: {
        ...selected.testCase,
        vars: { ...selected.testCase.vars, user_input: "wrong input" },
      },
    };
    const scalarMismatch = runValidator(configFile, "smoke", [
      wrongScalar, ...selectedRows.filter((row) => row !== selected),
    ], "1");
    assert.equal(scalarMismatch.status, 1);
    assert.match(scalarMismatch.stderr, /expected 1 result row\(s\) but received 0: selected lifecycle fixture/);

    const providerPromptMismatch = runValidator(configFile, "smoke", [
      ...selectedRows.filter((row) => row !== comboRows[3]), comboRows[0],
    ], "1");
    assert.equal(providerPromptMismatch.status, 1);
    assert.match(providerPromptMismatch.stderr, /policy-chat-alt, prompt 3/);

    const unexpectedRow = {
      success: true,
      testCase: {
        description: "unexpected fixture",
        metadata: { suite: "smoke", shard: 1 },
        vars: { user_input: "unexpected input" },
      },
    };
    const unexpected = runValidator(configFile, "smoke", [
      selected, nonLifecycle, ...expandedRows, unexpectedRow,
    ], "1");
    assert.equal(unexpected.status, 1);
    assert.match(unexpected.stderr, /returned 1 unexpected result row\(s\): unexpected fixture/);

    const wrongShard = fixtureRow("skill_content", { shard: 2 });
    wrongShard.testCase.description = "selected lifecycle fixture";
    const rejected = runValidator(configFile, "smoke", [
      wrongShard, nonLifecycle, ...expandedRows,
    ], "1");
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /results included 1 case\(s\) assigned to another shard/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("sharded row validation normalizes unlabeled providers like Promptfoo results", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "promptfoo-provider-config-"));
  try {
    for (const providerConfig of [
      "ollama:chat:llama3.2:3b",
      { id: "ollama:chat:llama3.2:3b" },
    ]) {
      const configFile = path.join(directory, "promptfooconfig.yaml");
      fs.writeFileSync(configFile, JSON.stringify({
        providers: [providerConfig],
        prompts: [{ id: "policy-chat", raw: "{{user_input}}" }],
        defaultTest: {
          providers: ["ollama:chat:llama3.2:3b"],
          prompts: ["policy-chat"],
        },
        tests: [{
          description: "unlabeled provider fixture",
          metadata: { suite: "smoke", shard: 1 },
          vars: { user_input: "selected input" },
        }],
      }));
      const result = runValidator(configFile, "smoke", [{
        success: true,
        testCase: {
          description: "unlabeled provider fixture",
          metadata: { suite: "smoke", shard: 1 },
          vars: { user_input: "selected input" },
        },
        provider: { id: "ollama:chat:llama3.2:3b", label: "" },
        promptIdx: 0,
      }], "1");
      assert.equal(result.status, 0, result.stderr);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("configured agent-defaults provider IDs match Promptfoo's loaded identities", async () => {
  const configFile = "packages/agent-defaults/tests/promptfooconfig.yaml";
  const config = yaml.load(fs.readFileSync(configFile, "utf8"));
  const loaded = await loadApiProviders(config.providers, {
    basePath: path.dirname(path.resolve(configFile)),
  });
  assert.deepEqual(
    loaded.map((provider) => provider.id()),
    config.providers.map((provider) => provider.id)
  );
});

test("sharded row validation follows Promptfoo string-first array expansion", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "promptfoo-array-config-"));
  try {
    const cases = [
      { description: "numeric-first", vars: { dimension: [1, 2] } },
      { description: "object-first", vars: { dimension: [{ value: "a" }, { value: "b" }] } },
      { description: "empty", vars: { dimension: [] } },
    ].map(({ description, vars }) => ({
      description,
      metadata: { suite: "smoke", shard: 1 },
      vars,
    }));
    const configFile = makeConfig(directory, cases);
    const rows = cases.map((testCase) => ({
      success: true,
      testCase,
      provider: { id: "ollama:chat:llama3.2:3b", label: "policy-chat" },
      promptIdx: 0,
    }));
    const result = runValidator(configFile, "smoke", rows, "1");
    assert.equal(result.status, 0, result.stderr);
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
