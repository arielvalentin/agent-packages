"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { packages, inventory, select, changedPaths, execute } = require("./run-affected-tests.js");

const root = path.resolve(__dirname, "..");
const configs = inventory(root);
test("native inventories match through a symlinked repository root", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "affected-root-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const alias = path.join(directory, "repository");
  fs.symlinkSync(root, alias, "junction");
  assert.deepEqual(inventory(alias), configs);
});

const allCases = configs.flatMap((config) =>
  config.cases.map((item) => ({ package: config.name, ...item }))
);
const selected = (plan) => new Set(plan.runs.flatMap((run) => run.stimuli));

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "affected-tests-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test("native inventories expose native file and skill inputs before selection", () => {
  assert.deepEqual(configs.map((config) => config.name), packages);
  assert.ok(allCases.length > 0);
  assert.ok(allCases.every((item) => item.inputs instanceof Set && item.directories instanceof Set));
});

test("combined fixtures select their canonical source inputs across packages", () => {
  const source = "packages/agent-defaults/.apm/instructions/repository-work.instructions.md";
  const matching = allCases.filter((item) =>
    item.package === "development-workflow" && item.inputs.has(source));
  assert.ok(matching.length > 0);
  const chosen = selected(select([source], configs));
  assert.ok(matching.some((item) => chosen.has(item.stimulus)));
});

test("declared native inputs select matching cases and package smoke fallbacks", () => {
  const inputs = new Set(allCases.flatMap((item) => [...item.inputs]));
  for (const input of inputs) {
    const matches = allCases.filter((item) => item.inputs.has(input));
    const smoke = matches.filter((item) => item.suite === "smoke");
    const expected = new Set((smoke.length ? smoke : matches).map((item) => item.stimulus));
    const owner = packages.find((name) =>
      input.startsWith(`packages/${name}/tests/`) || input.startsWith(`packages/${name}/evals/`)
    );
    if (owner) {
      allCases
        .filter((item) => item.package === owner && item.suite === "smoke")
        .forEach((item) => expected.add(item.stimulus));
    }
    assert.deepEqual(selected(select([input], configs)),
      expected, input);
  }
});

test("package test and nested eval fixture changes preserve owning smoke and cross-package matches", () => {
  const testFixture = "packages/agent-defaults/tests/fixture.md";
  const evalFixture = "packages/agent-defaults/evals/fixtures/context.md";
  const fixtureConfigs = [
    { name: "agent-defaults", cases: [{
      stimulus: "defaults-smoke", suite: "smoke", inputs: new Set(), directories: new Set(),
    }] },
    { name: "coordinator", cases: [{
      stimulus: "coordinator-fixture",
      suite: "smoke",
      inputs: new Set([testFixture, evalFixture]),
      directories: new Set(),
    }] },
    ...packages.slice(2).map((name) => ({ name, cases: [] })),
  ];
  for (const changed of [testFixture, evalFixture]) {
    const plan = select([changed], fixtureConfigs);
    assert.deepEqual(plan.runs.map((run) => [run.name, ...run.stimuli]), [
      ["agent-defaults", "defaults-smoke"],
      ["coordinator", "coordinator-fixture"],
    ]);
  }

  const unmapped = select(["packages/agent-defaults/evals/fixtures/unmapped.md"], fixtureConfigs);
  assert.deepEqual(unmapped.runs.map((run) => [run.name, ...run.stimuli]), [
    ["agent-defaults", "defaults-smoke"],
  ]);
});

test("directory inputs match descendants and uncovered files remain explicit smoke fallbacks", () => {
  const configsWithDirectory = [{
    name: "agent-defaults",
    cases: [{
      stimulus: "directory-consumer",
      suite: "smoke",
      inputs: new Set(),
      directories: new Set(["packages/agent-defaults/.apm/skills/example/"]),
    }],
  }];
  const match = select(["packages/agent-defaults/.apm/skills/example/README.md"], configsWithDirectory);
  assert.deepEqual(match.runs[0].stimuli, ["directory-consumer"]);

  const fallback = select(["packages/agent-defaults/.apm/unmapped.md"], configs);
  assert.deepEqual(fallback.runs.map((run) => run.name), ["agent-defaults"]);
  assert.match(fallback.reasons.join("\n"), /coverage gap/);
  assert.match(fallback.reasons.join("\n"), /does not establish coverage/);
});

test("shared inputs fall back to all smoke suites while allowlisted docs can select nothing", () => {
  const shared = select(["script/run-affected-tests.js"], configs);
  assert.deepEqual(shared.runs.map((run) => run.name), packages);
  assert.ok(shared.runs.every((run) => run.suite === "smoke"));

  const docs = select(["docs/development.md", "README.md"], configs);
  assert.deepEqual(docs.runs, []);
  assert.match(docs.reasons.join("\n"), /allowlisted/);

  const testConfig = select(["packages/coordinator/evals/coordinator.eval.yaml"], configs);
  assert.deepEqual(testConfig.runs.map((run) => run.name), ["coordinator"]);
  assert.equal(testConfig.runs[0].suite, "smoke");
});

test("unknown paths and empty changes use an all-package smoke fallback", () => {
  for (const plan of [select([], configs), select(["unknown.txt"], configs)]) {
    assert.deepEqual(plan.runs.map((run) => run.name), packages);
    assert.ok(plan.runs.every((run) => run.suite === "smoke"));
  }

  const knownFullInput = "packages/agent-defaults/.apm/skills/full-only/SKILL.md";
  const mixedConfigs = packages.map((name) => ({
    name,
    cases: [
      {
        stimulus: `${name}-smoke`,
        suite: "smoke",
        inputs: new Set(),
        directories: new Set(),
      },
      ...(name === "agent-defaults" ? [{
        stimulus: "full-match",
        suite: "full",
        inputs: new Set([knownFullInput]),
        directories: new Set(),
      }] : []),
    ],
  }));
  const combined = select([knownFullInput, "unknown.txt"], mixedConfigs);
  assert.deepEqual(combined.runs.map((run) => run.name), packages);
  assert.ok(combined.runs.every((run) => run.suite === "smoke"));
  assert.ok(combined.runs.every((run) => !run.stimuli.includes("full-match")));
});

test("Git change union includes staged, unstaged, renames, deletions, untracked, and base commits", (t) => {
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

test("execution isolates results per package and stops on the first failure", () => {
  const calls = [];
  const resultsDirectory = "affected-test-results";
  const status = execute(root, {
    runs: [
      { name: "agent-defaults", suite: "smoke", stimuli: ["case-1"] },
      { name: "coordinator", suite: "full", stimuli: ["case-2", "case-3"] },
    ],
  }, (executable, args, options) => {
    calls.push({ executable, args, options });
    return { status: calls.length === 1 ? 0 : 7 };
  }, {
    ...process.env,
    VALLY_RESULTS_DIR: resultsDirectory,
    AFFECTED_TESTS_TEST_ENV: "preserved",
  });
  assert.equal(status, 7);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].args.at(-1)), ["case-1"]);
  assert.deepEqual(JSON.parse(calls[1].args.at(-1)), ["case-2", "case-3"]);
  assert.equal(calls[0].options.env.VALLY_RESULTS_DIR, path.join(root, resultsDirectory, "agent-defaults"));
  assert.equal(calls[1].options.env.VALLY_RESULTS_DIR, path.join(root, resultsDirectory, "coordinator"));
  assert.equal(calls[0].options.env.AFFECTED_TESTS_TEST_ENV, "preserved");
});
