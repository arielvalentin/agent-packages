const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const yaml = require("js-yaml");
const { packages, configPath, patternFor, inventory, select, changedPaths, execute } =
  require("./run-affected-tests");

const root = path.resolve(__dirname, "..");
const configs = inventory(root);
const source = (name) => `packages/agent-defaults/.apm/skills/${name}/SKILL.md`;
const descriptions = (plan) => plan.runs.flatMap((run) => run.descriptions || []);
const totalSmoke = configs.flatMap((config) => config.cases.filter((item) => item.metadata?.suite === "smoke")).length;

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "selector-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function command(cwd, executable, args, env = {}) {
  const result = spawnSync(executable, args, {
    cwd, encoding: "utf8", env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function fixture(t, transform = (config) => config) {
  const directory = temporary(t);
  for (const name of packages) {
    const config = {
      providers: ["echo"], prompts: ["{{skill_content}}"],
      tests: [{ description: `${name} case`, metadata: { suite: "smoke" },
        vars: { skill_content: "file://../.apm/input.md" } }],
    };
    const filename = path.join(directory, configPath(name));
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.mkdirSync(path.join(directory, `packages/${name}/.apm`), { recursive: true });
    fs.writeFileSync(path.join(directory, `packages/${name}/.apm/input.md`), "input");
    fs.writeFileSync(filename, yaml.dump(transform(config, name)));
  }
  return directory;
}

test("real configs satisfy the declared-input closure contract", () => {
  for (const config of configs) assert.equal(config.unsupported, undefined, `${config.name}: ${config.unsupported}`);
  assert.equal(totalSmoke > 0, true);
});

test("every declared input selects exactly its smoke tier or non-smoke tier", () => {
  const inputs = new Set(configs.flatMap((config) => config.cases.flatMap((item) => [...item.inputs])));
  for (const input of inputs) {
    const matching = configs.flatMap((config) => config.cases.filter((item) => item.inputs.has(input)));
    const smoke = matching.filter((item) => item.metadata?.suite === "smoke");
    const expected = smoke.length ? smoke : matching;
    assert.deepEqual(new Set(descriptions(select([input], configs))), new Set(expected.map((item) => item.description)), input);
  }
});

test("cross-package companions, non-smoke tiers and unions are selected", () => {
  const companion = select([source("handoff-envelope")], configs);
  assert.ok(companion.runs.some((run) => run.name === "development-workflow"));
  const writing = select([source("writing-voice")], configs);
  assert.ok(writing.runs.length && writing.runs.every((run) => run.suite === "full"));
  assert.match(writing.reasons.join("\n"), /non-smoke/);
  const a = source("repository-access");
  const b = source("human-interaction-safeguard");
  assert.deepEqual(new Set(descriptions(select([a, b, a], configs))),
    new Set([...descriptions(select([a], configs)), ...descriptions(select([b], configs))]));
});

test("unknown, shared, personal-agent and empty changes fall back to baseline", () => {
  for (const change of [[], ["unknown.txt"], ["package.json"], ["package-lock.json"],
    ["script/run-affected-tests.js"], ["packages/personal-agents/.apm/agents/new.agent.md"]]) {
    assert.equal(descriptions(select(change, configs)).length, totalSmoke, String(change));
  }
});

test("coverage gaps fall back to package smoke; config edits select package smoke", () => {
  for (const change of [source("resolve-github-user"), "packages/agent-defaults/.apm/new.md",
    configPath("agent-defaults"), "packages/agent-defaults/tests/new.yaml"]) {
    const plan = select([change], configs);
    assert.deepEqual(plan.runs.map((run) => run.name), ["agent-defaults"]);
    assert.equal(plan.runs[0].descriptions.length, configs[0].cases.filter((item) => item.metadata?.suite === "smoke").length);
  }
  assert.match(select([source("resolve-github-user")], configs).reasons[0], /coverage gap/);
});

test("only explicit non-input allowlist can select nothing", () => {
  for (const change of ["README.md", "CHANGELOG.md", "docs/development.md",
    "packages/agent-defaults/README.md", ".github/workflows/ci.yml"]) {
    assert.equal(select([change], configs).runs.length, 0, change);
  }
  assert.equal(select(["docs/tool.js"], configs).runs.length, 4);
  assert.equal(select([".github/actions/eval-package/action.yml"], configs).runs.length, 4);
  assert.equal(select(["README.md", source("human-interaction-safeguard")], configs).runs.length, 1);
});

test("declared inputs take precedence over the non-input allowlist", (t) => {
  const directory = fixture(t, (config, name) => {
    if (name === packages[0]) config.tests[0].vars.skill_content = "file://../../../README.md";
    return config;
  });
  fs.writeFileSync(path.join(directory, "README.md"), "declared test input");
  const plan = select(["README.md"], inventory(directory));
  assert.deepEqual(descriptions(plan), ["agent-defaults case"]);
});

const unsupported = {
  glob: (c) => { c.tests[0].vars.skill_content = "file://../.apm/*.md"; },
  directory: (c) => { c.tests[0].vars.skill_content = "file://../.apm"; },
  missing: (c) => { c.tests[0].vars.skill_content = "file://missing.md"; },
  function: (c) => { c.tests[0].vars.skill_content += ":function"; },
  scheme: (c) => { c.tests[0].vars.skill_content = "https://example.com/input"; },
  scriptScheme: (c) => { c.tests[0].vars.skill_content = "python:input.py"; },
  externalTests: (c) => { c.tests = "file://tests.yaml"; },
  externalVars: (c) => { c.tests[0].vars = "file://vars.yaml"; },
  prompt: (c) => { c.prompts = ["file://prompt.txt"]; },
  provider: (c) => { c.providers = ["file://provider.js"]; },
  defaults: (c) => { c.defaultTest = { vars: { shared: "file://shared.md" } }; },
  assertionReference: (c) => { c.tests[0].assert = [{ type: "javascript", value: "file://assert.js" }]; },
  assertionRead: (c) => { c.tests[0].assert = [{ type: "javascript", value: "require('node:fs').readFileSync('input')" }]; },
  externalAssertion: (c) => { c.tests[0].assert = [{ type: "python", value: "open('input').read()" }]; },
  environmentRead: (c) => { c.tests[0].assert = [{ type: "javascript", value: "process.env.EXPECTED" }]; },
  duplicate: (c) => { c.tests.push(c.tests[0]); },
  externalProvider: (c) => { c.providers = ["python:provider.py"]; },
  caseExternalProvider: (c) => { c.tests[0].providers = ["https://example.com/provider"]; },
  caseExternalPrompt: (c) => { c.tests[0].prompts = ["external.txt"]; },
  defaultExternalProvider: (c) => { c.defaultTest = { providers: ["https://example.com/provider"] }; },
  defaultExternalPrompt: (c) => { c.defaultTest = { prompts: ["external.txt"] }; },
  externalPrompt: (c) => { c.prompts = ["prompt.txt"]; },
  templateImport: (c) => { c.prompts = ['{% include "external.txt" %} {{input}}']; },
  whitespaceTemplateImport: (c) => { c.prompts = ['{%- include "external.txt" %} {{input}}']; },
  plusTemplateImport: (c) => { c.prompts = ['{%+ include "external.txt" %} {{input}}']; },
  noSmoke: (c) => { c.tests[0].metadata.suite = "full"; },
  transform: (c) => { c.tests[0].options = { transform: "file://transform.js" }; },
};
for (const [name, change] of Object.entries(unsupported)) {
  test(`unsupported ${name} falls back with an explicit reason`, (t) => {
    const directory = fixture(t, (config, pkg) => {
      if (pkg === packages[0]) change(config);
      return config;
    });
    const data = inventory(directory);
    assert.ok(data[0].unsupported, name);
    const plan = select(["README.md"], data);
    assert.equal(plan.runs[0].name, packages[0]);
    assert.equal(plan.runs[0].descriptions, null);
    assert.match(plan.reasons.join("\n"), /fallback/);
  });
}

test("git change union includes index, worktree, rename origins, deletion, untracked and base commits", (t) => {
  const directory = temporary(t);
  const git = (...args) => command(directory, "git", args);
  git("init", "--quiet");
  for (const name of ["staged.md", "unstaged.md", "cancelled.md", "old name.md", "deleted.md"]) {
    fs.writeFileSync(path.join(directory, name), "before");
  }
  git("add", ".");
  function snapshot(parent) {
    const tree = git("write-tree").trim();
    const text = `tree ${tree}\n${parent ? `parent ${parent}\n` : ""}author Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\ntest fixture\n`;
    const result = spawnSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], {
      cwd: directory, encoding: "utf8", input: text,
    });
    assert.equal(result.status, 0, result.stderr);
    git("update-ref", "HEAD", result.stdout.trim());
  }
  snapshot();
  const base = git("rev-parse", "HEAD").trim();
  fs.writeFileSync(path.join(directory, "committed.md"), "committed");
  git("add", ".");
  snapshot(base);
  fs.writeFileSync(path.join(directory, "staged.md"), "staged");
  fs.writeFileSync(path.join(directory, "cancelled.md"), "index");
  git("add", ".");
  fs.writeFileSync(path.join(directory, "cancelled.md"), "before");
  fs.writeFileSync(path.join(directory, "unstaged.md"), "unstaged");
  git("mv", "old name.md", "new name.md");
  fs.unlinkSync(path.join(directory, "deleted.md"));
  fs.writeFileSync(path.join(directory, "untracked\nname.md"), "new");
  fs.writeFileSync(path.join(directory, ".gitignore"), "ignored.md\n");
  fs.writeFileSync(path.join(directory, "ignored.md"), "ignore");
  const expected = [".gitignore", "cancelled.md", "deleted.md", "new name.md", "old name.md",
    "staged.md", "unstaged.md", "untracked\nname.md"].sort();
  assert.deepEqual(changedPaths(directory), expected);
  assert.deepEqual(changedPaths(directory, base), [...expected, "committed.md"].sort());
  assert.throws(() => changedPaths(directory, "nonexistent-ref"), /git merge-base failed/);
  assert.throws(() => changedPaths(temporary(t)), /git diff failed/);
});

test("symlink inputs outside the repository force package fallback", (t) => {
  const directory = fixture(t);
  const external = temporary(t);
  const input = path.join(directory, "packages/agent-defaults/.apm/input.md");
  fs.writeFileSync(path.join(external, "external.md"), "external");
  fs.unlinkSync(input);
  fs.symlinkSync(path.join(external, "external.md"), input);
  assert.match(inventory(directory)[0].unsupported, /not a repository file/);
});

test("internal symlink aliases cannot hide a changed declared input", (t) => {
  const directory = fixture(t);
  const input = path.join(directory, "packages/agent-defaults/.apm/input.md");
  fs.renameSync(input, `${input}.target`);
  fs.symlinkSync(`${input}.target`, input);
  assert.match(inventory(directory)[0].unsupported, /not a repository file/);
});

test("CLI rejects bad arguments and explicitly reports a nothing-to-run plan", (t) => {
  const directory = fixture(t);
  command(directory, "git", ["init", "--quiet"]);
  const gitdir = path.join(directory, ".git");
  const tree = command(directory, "git", ["mktree"], {});
  const commit = spawnSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], {
    cwd: directory, encoding: "utf8",
    input: `tree ${tree.trim()}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\nfixture\n`,
  });
  assert.equal(commit.status, 0, commit.stderr);
  command(directory, "git", ["update-ref", "HEAD", commit.stdout.trim()]);
  fs.writeFileSync(path.join(gitdir, "info/exclude"), "packages/\n");
  fs.writeFileSync(path.join(directory, "README.md"), "documentation");
  const cli = path.join(root, "script/run-affected-tests.js");
  const result = command(directory, process.execPath, [cli, "--dry-run"]);
  assert.match(result, /Nothing to run/);
  for (const args of [["--unknown"], ["--base"], ["--base", "--dry-run"]]) {
    const invalid = spawnSync(process.execPath, [cli, ...args], { cwd: directory, encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Usage:/);
  }
});

function validate(t, rows, suite = "smoke", expected) {
  const directory = temporary(t);
  const file = path.join(directory, "eval.json");
  fs.writeFileSync(file, JSON.stringify({ results: { results: rows } }));
  const args = [path.join(root, "script/validate-promptfoo-eval.js"), file, suite];
  if (expected !== undefined) {
    const wanted = path.join(directory, "expected.json");
    fs.writeFileSync(wanted, JSON.stringify(expected));
    args.push(wanted);
  }
  return spawnSync(process.execPath, args, { encoding: "utf8" });
}
const row = (description = "case", success = true, smoke = true) => ({
  success, testCase: { description, metadata: smoke ? { suite: "smoke" } : {} },
});

test("validator preserves existing invocations and enforces exact selected descriptions", (t) => {
  assert.equal(validate(t, [row()]).status, 0);
  assert.equal(validate(t, [row("case", true, false)], "full").status, 0);
  for (const rows of [[], [row("case", false)], [row("case", true, false)]]) {
    assert.equal(validate(t, rows).status, 1);
  }
  assert.equal(validate(t, [row(), row()], "smoke", ["case"]).status, 0);
  for (const [rows, expected] of [[[row()], ["missing"]], [[row(), row("extra")], ["case"]],
    [[row()], []], [[row()], ["case", "missing"]]]) {
    assert.equal(validate(t, rows, "smoke", expected).status, 1);
  }
});

test("runner preserves eval failure, validator failure, missing output and launch errors", (t) => {
  const plan = { runs: [{ name: "test", file: "config.yaml", suite: "smoke", descriptions: ["case"] }] };
  for (const [evalStatus, validatorStatus, expected] of [[7, 0, 7], [0, 4, 4], [0, 0, 0]]) {
    const calls = [];
    assert.equal(execute(root, plan, true, (exe, args) => {
      calls.push([exe, args]);
      if (exe === "npx") {
        fs.writeFileSync(args[args.indexOf("--output") + 1], "{}");
        return { status: evalStatus };
      }
      return { status: validatorStatus };
    }), expected);
    assert.ok(calls[0][1].includes("--no-cache"));
    assert.ok(calls[0][1].includes("--filter-metadata"));
    assert.ok(calls[0][1].includes("--filter-pattern"));
    assert.equal(calls.length, 2);
  }
  assert.equal(execute(root, plan, false, () => ({ status: 0 })), 1);
  assert.equal(execute(root, plan, false, () => ({ status: null, signal: "SIGTERM" })), 1);
  assert.throws(() => execute(root, plan, false, () => ({ error: new Error("launch failed") })), /launch failed/);
  assert.equal(execute(root, { runs: [] }, false, () => assert.fail()), 0);
});

test("locked Promptfoo echo contract: anchored escaped descriptions, metadata intersection and variable expansion", (t) => {
  assert.equal(require("../node_modules/promptfoo/package.json").version, "0.125.1");
  const directory = temporary(t);
  const realDescriptions = configs.flatMap((config) => config.cases.map((item) => item.description));
  const selected = [...realDescriptions, "metacharacters: ^ $ . * + ? ( ) [ ] { } | \\"];
  const tests = selected.map((description) => ({
    description, metadata: { suite: "smoke" }, vars: { input: ["one", "two"] },
    assert: [{ type: "is-json" }],
  }));
  tests.push({ description: `prefix ${selected[0]}`, metadata: { suite: "smoke" }, vars: { input: "extra" } });
  tests.push({ description: selected[0], metadata: { suite: "full" }, vars: { input: "non-smoke" } });
  const config = path.join(directory, "config.yaml");
  const output = path.join(directory, "eval.json");
  fs.writeFileSync(config, yaml.dump({ providers: ["echo"], prompts: ['{"input":"{{input}}"}'], tests }));
  command(root, process.execPath, ["node_modules/promptfoo/dist/src/main.js", "eval",
    "--config", config, "--filter-pattern", patternFor(selected),
    "--filter-metadata", "suite=smoke", "--output", output, "--no-cache",
    "--no-progress-bar"], {
    PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE_CHECK: "1",
    PROMPTFOO_CONFIG_DIR: directory,
  });
  const result = JSON.parse(fs.readFileSync(output, "utf8"));
  const rows = result.results.results;
  assert.equal(rows.length, selected.length * 2);
  assert.ok(rows.every((item) => item.success && item.testCase.metadata.suite === "smoke"));
  assert.deepEqual(new Set(rows.map((item) => item.testCase.description)), new Set(selected));
});
