const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const gradersModule = import("./native-eval-graders.mjs");
const yaml = require("js-yaml");
const root = path.resolve(__dirname, "..");
const migrationMap = JSON.parse(fs.readFileSync(
  path.join(root, "docs/evaluations-migration-map.json"),
  "utf8"
));

test("output text contract preserves strict trimmed length bounds and regex checks", async () => {
  const { registerGraders } = await gradersModule;
  const registry = { graders: new Map(), register(grader) {
    this.graders.set(grader.metadata.name, grader);
  } };
  registerGraders(registry);
  const grader = registry.graders.get("output-text-contract");
  const config = {
    minimumLengthExclusive: 15,
    maximumLengthExclusive: 500,
    mustMatch: "(?i)(client|module|coupling)",
    mustNotMatch: "(?i)(01-design|ready-for-review)",
  };
  const grade = (output) => grader.grade({ trajectory: { output }, config });

  assert.equal((await grade("  The module is isolated.  ")).passed, true);
  assert.equal((await grade(` ${"x".repeat(15)} `)).passed, false);
  assert.equal((await grade(` ${"x".repeat(500)} `)).passed, false);
  assert.equal((await grade("The module path is 01-design.md.")).passed, false);
  assert.equal((await grade("A short module.")).passed, false);
  assert.equal((await grader.grade({ trajectory: { output: "ok" }, config: {
    minimumLengthExclusive: 15,
    mustMatch: "[",
  } })).status, "error");
  assert.equal((await grader.grade({ trajectory: {}, config })).status, "error");
});

test("normalized source contracts preserve conjunction and conflicting-token behavior", async () => {
  const { registerGraders } = await gradersModule;
  const registry = { graders: new Map(), register(grader) {
    this.graders.set(grader.metadata.name, grader);
  } };
  registerGraders(registry);
  const grader = registry.graders.get("output-text-contract");
  const grade = (output, config) => grader.grade({ trajectory: { output }, config });
  const draftConfig = {
    removeCharacters: ["*", "_", "`"],
    mustMatch: "(?i)^DRAFT\\b",
    mustNotMatch: "(?i)\\b(?:and|then|also)\\s+(?:post|resolve)\\b",
  };
  assert.equal((await grade("DRAFT, then post the reply and resolve the thread.", draftConfig)).passed, false);
  assert.equal((await grade("DRAFT the PR after review.", draftConfig)).passed, true);

  const automationTokens = [
    "required path|classification|classified as|decision(?:[ -]table)? token(?: for this interaction)?|conclusion|selected path|response",
    "required path|classification|classified as|decision(?:[ -]table)? token(?: for the given actor metadata)?|conclusion|selected path|response",
  ];
  for (const phrase of automationTokens) {
    const config = {
      removeCharacters: ["*", "`"],
      mustMatch: `(?im)^[^\\S\\r\\n]*AUTOMATION_FLOW[^\\S\\r\\n]*\\r?$|\\b(?:${phrase})\\s*(?:is|:|as)?\\s*AUTOMATION_FLOW\\b`,
      mustNotMatch: `(?im)^[^\\S\\r\\n]*HUMAN_STOP[^\\S\\r\\n]*\\r?$|\\b(?:${phrase})\\s*(?:is|:|as)?\\s*HUMAN_STOP\\b`,
    };
    assert.equal((await grade("AUTOMATION_FLOW", config)).passed, true);
    assert.equal((await grade("AUTOMATION_FLOW\n` HUMAN_STOP `", config)).passed, false);
  }

  assert.equal((await grade(" medium ", {
    removeCharacters: ["`", "*", "_"],
    mustMatch: "(?i)^medium[.!]?$",
  })).passed, true);
  const noConfig = {
    removeCharacters: ["*", "_", "`"],
    mustMatch: "(?i)^no\\b[.!,:]?(?:\\s|$)",
    mustNotMatch: "(?im)^yes[.!,:]?\\s*$",
  };
  assert.equal((await grade("_No_", noConfig)).passed, true);
  assert.equal((await grade("_No_\n_Yes_", noConfig)).passed, false);
  const yesConfig = {
    removeCharacters: ["*", "_", "`"],
    mustMatch: "(?i)^yes\\b[.!,:]?(?:\\s|$)",
    mustNotMatch: "(?i)\\b(?:not authorized|cannot proceed|must (?:stay paused|wait for)|do not proceed|also (?:post|resolve|retry))\\b",
  };
  assert.equal((await grade("_Yes_", yesConfig)).passed, true);
  assert.equal((await grade("Yes, also resolve the thread.", yesConfig)).passed, false);
  assert.equal((await grade("**optional**", {
    removeCharacters: ["*", "_"],
    mustMatch: "(?i)^optional[.!]?$",
  })).passed, true);
});

test("migrated normalization-sensitive cases use source-equivalent grader configs", async () => {
  const { registerGraders } = await gradersModule;
  const registry = { graders: new Map(), register(grader) {
    this.graders.set(grader.metadata.name, grader);
  } };
  registerGraders(registry);
  const cases = [
    ["agent-defaults", 350, [
      ["DRAFT, then post the reply and resolve the thread.", false],
      ["DRAFT the PR after review.", true],
    ]],
    ["agent-defaults", 333, [
      ["AUTOMATION_FLOW", true],
      ["AUTOMATION_FLOW\n` HUMAN_STOP `", false],
    ]],
    ["agent-defaults", 335, [
      ["AUTOMATION_FLOW", true],
      ["AUTOMATION_FLOW\n` HUMAN_STOP `", false],
      ["Decision token for this interaction: AUTOMATION_FLOW", true],
      ["AUTOMATION_FLOW\nDecision token for this interaction: HUMAN_STOP", false],
      ["AUTOMATION_FLOW\nDecision token for the given actor metadata is `HUMAN_STOP`", false],
    ]],
    ["agent-defaults", 404, [[" medium ", true]]],
    ["agent-defaults", 354, [
      ["**No**", true],
      [" No ", true],
      ["Yes", false],
    ]],
    ["agent-defaults", 358, [
      ["**No**", true],
      [" No ", true],
      ["No\n**Yes**", false],
      ["Yes", false],
    ]],
    ["agent-defaults", 308, [
      ["_No_", true],
      ["_No_\n_Yes_", false],
    ]],
    ["agent-defaults", 351, [
      ["_Yes_", true],
      ["Yes, also resolve the thread.", false],
    ]],
    ["development-workflow", 17, [["**optional**", true]]],
    ["development-workflow", 18, [["**Yes**", true]]],
    ["development-workflow", 19, [["**ask**", true]]],
  ];

  for (const [packageName, sourceCaseIndex, outputs] of cases) {
    const suite = migrationMap.suites[packageName];
    const spec = yaml.load(fs.readFileSync(path.join(root, suite.evalFile), "utf8"));
    const entries = migrationMap.cases.filter((entry) =>
      entry.package === packageName && entry.sourceCaseIndex === sourceCaseIndex
    );
    assert.ok(entries.length > 0, `${packageName} source case ${sourceCaseIndex}`);
    for (const entry of entries) {
      const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
      assert.equal(stimulus.graders.length, 1, entry.sourceDescription);
      const grader = stimulus.graders[0];
      assert.equal(grader.type, "output-text-contract", entry.sourceDescription);
      const registered = registry.graders.get(grader.type);
      for (const [output, expected] of outputs) {
        const result = await registered.grade({
          trajectory: { output },
          config: grader.config,
        });
        assert.equal(result.passed, expected,
          `${entry.sourceDescription}: ${JSON.stringify(output)}`);
      }
    }
  }
});

test("source output patterns apply only the requested source normalizations", async () => {
  const { registerGraders } = await gradersModule;
  const registry = { graders: new Map(), register(grader) {
    this.graders.set(grader.metadata.name, grader);
  } };
  registerGraders(registry);
  const grader = registry.graders.get("source-output-pattern");
  const grade = (output, config) => grader.grade({ trajectory: { output }, config });

  assert.equal((await grade(" **NO**\n", {
    pattern: "(?i)^no[.!]?$",
    trim: true,
    removeCharacters: ["*", "_", "`"],
  })).passed, true);
  assert.equal((await grade("`N+1 database queries`", {
    pattern: "(?i)^n\\s*\\+\\s*1(?:\\s+(?:database\\s+)?(?:quer(?:y|ies)(?:\\s+(?:pattern|problem))?|pattern|problem))?[.!]?$",
    trim: true,
    removeCharacters: ["*", "_", "`"],
  })).passed, true);
  assert.equal((await grade("N+1 query issue", {
    pattern: "(?i)^n\\s*\\+\\s*1(?:\\s+(?:database\\s+)?(?:quer(?:y|ies)(?:\\s+(?:pattern|problem))?|pattern|problem))?[.!]?$",
    trim: true,
    removeCharacters: ["*", "_", "`"],
  })).passed, false);
  assert.equal((await grade("NO", {
    pattern: "^no$",
    removeCharacters: ["*"],
  })).passed, false);
});

test("draft PR command grader requires explicit repository targeting", async () => {
  const { isValidDraftCreateOutput } = await gradersModule;
  const passing = [
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" --body \"Details\"\n",
    "gh pr create --repo \"$(git remote get-url origin | sed -E 's#^(https?://[^/]+/|ssh://[^/]+/|[^@]+@[^:]+:)([^/]+/[^/]+)(\\.git)?$#\\2#')\" "
      + "--draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo owner/repo --head feature --draft "
      + "--title \"fix: handle null\" --body \"Details\"",
    "GH   PR   CREATE --REPO owner/repo --BODY=\"Details\" --TITLE='fix(parser): handle null' --DRAFT",
    "gh pr create --repo owner/repo --draft --title 'feat: $(literal)' --body 'Details'",
    "gh pr create --repo owner/repo \\\n  --draft --title \"feat: support continuations\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title=\"test: cover edge cases\" --body=\"Details\"",
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" "
      + "--body 'First line\ngh pr create is literal; `so is this`'",
  ];
  const failing = [
    "I will open a pull request after review.",
    "gh pr create --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --draft --title \"feat: add parser\" --body \"Details --repo owner/repo\"",
    "gh pr create --draft --title \"feat: add parser\" --body \"Details\" # --repo owner/repo",
    "gh pr create --repo = owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title = 'fix: handle null' --body 'Details'",
    "gh pr create --repo \"owner/repo\"#suffix --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo ../repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo owner/.. --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title 'fix: handle null' --body 'Details' '",
    "gh pr create > --repo owner/repo --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo \"\" --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo \"$GH_REPO\" --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"feat: $(id)\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" --body \"Details $(id)\"",
    "gh pr create --repo owner/repo --head \"$(id)\" --draft "
      + "--title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"feat: `id`\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title `feat: add parser` --body \"Details\"",
    "gh pr create --repo owner/repo --title \"feat: add parser\" --body \"Details\" # --draft",
    "gh pr create --repo owner/repo --draft --body \"Details\" # --title \"feat: add parser\"",
    "gh pr create --repo owner/repo --draft --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo owner/repo --drafted --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body \"Details\" --repo \"$GH_REPO\"",
    "gh pr create --repo \"owner/repo\"$(printf suffix) --draft "
      + "--title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin)\" --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -E "
      + "'s#^git@github.com:##; s#^https://github.com/##; s#\\.git$##')\" "
      + "--draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -E "
      + "'s#(git@github.com:|https://github.com/)##; s#\\.git$##')\" "
      + "--draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -E 's#.*#attacker/repo#')\" "
      + "--draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -E 'e printf owner/repo')\" --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -E 's#.*#attacker/repo#;e printf x')\" --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo | echo owner/repo --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"feat: add one\" --body \"Details\"; "
      + "gh pr create --title \"not conventional\"",
    "gh pr create --repo owner/repo --draft --title \"feat: add one\" --body \"Details\" && "
      + "gh pr create --repo owner/repo --draft --title \"fix: add two\" --body \"More details\"",
    "gh pr create --repo owner/repo --draft --title \"feat: add one\" --body \"Details\"; echo done",
    "gh pr create --repo owner/repo --draft --title \"feat: add one\" --body \"Details\"\necho injected",
    "gh pr create --repo owner/repo --draft --title \"feat: add one\" --body \"Details\" # comment\necho injected",
    "gh pr create --repo owner/repo --draft --title 'feat: add parser' "
      + "--body Details\\ #; echo injected",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body \"Details\" # comment" + String.fromCharCode(92) + "\necho injected",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body \"Details\" " + String.fromCharCode(92)
      + "\n# comment" + String.fromCharCode(92) + "\necho injected",
    "gh pr create --repo " + String.fromCharCode(96) + "owner/repo"
      + String.fromCharCode(96) + " --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body \"Details\" " + String.fromCharCode(92),
    "gh pr create --repo 'owner/repo" + String.fromCharCode(92)
      + "\nfoo' --draft --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"feat: add one\" --body \"Details\" > /tmp/output",
    "gh pr create --repo owner/repo --draft --title \"feat: add one\" --body \"Details\" | cat",
    "gh pr create --repo owner/repo --draft --title \"feat: hi\" --body foo\\\"; echo injected",
    "gh pr create --repo owner/repo --title \"feat: hi\" --body Details\\ --draft",
    "gh pr create --title \"feat: hi\" --body Details\\ --repo owner/repo --draft",
    "gh pr create --repo owner/repo --draft --title \"feat: hi\" --body \"Details\"\\\\\n echo injected",
    "Prose before `gh pr create --repo owner/repo --draft --title 'feat: add parser' --body 'Details'`.",
    "gh pr create --draft --title \"WIP feat: add parser\" --body \"Details\"",
    "gh pr create --draft --title \"<type>: add parser\" --body \"Details\"",
    "gh pr create --draft --title \"feat: add parser\"",
    "gh pr create --draft --body \"Details\"",
    "gh pr create --draft --title \"feat: add parser\" --body \"\"",
    "gh pr create --drafted --title \"feat: add parser\" --body \"Details\"",
    "gh pr create --draft --title \"feat: add one\" --body \"Details\"; "
      + "gh pr create --draft --title \"bad title\" --body \"More details\"",
    "gh pr create --repo \"$(gh repo view --json nameWithOwner -q .nameWithOwner)\" "
      + "--draft --title \"fix: handle null\" --body \"Details\"",
  ];

  for (const output of passing) {
    assert.equal(isValidDraftCreateOutput(output), true, output);
  }
  for (const output of failing) {
    assert.equal(isValidDraftCreateOutput(output), false, output);
  }
});

test("draft PR command grader reports malformed input as an error", async () => {
  const { registerGraders } = await gradersModule;
  const registry = { graders: new Map(), register(grader) {
    this.graders.set(grader.metadata.name, grader);
  } };
  registerGraders(registry);
  const grader = registry.graders.get("draft-pr-create-command");
  assert.equal((await grader.grade({
    trajectory: { output: "gh pr create --repo owner/repo --draft --title 'feat: x' --body 'details'" },
    config: {},
  })).passed, true);
  assert.equal((await grader.grade({
    trajectory: { output: "gh pr create" },
    config: { unsafe: true },
  })).status, "error");
});
