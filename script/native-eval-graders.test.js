const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const gradersModule = import("./native-eval-graders.mjs");
const yaml = require("js-yaml");
const root = path.resolve(__dirname, "..");
const outputMatchesModule = import(
  "../node_modules/@microsoft/vally/dist/graders/static/output-matches-grader.js"
);
const outputContainsModule = import(
  "../node_modules/@microsoft/vally/dist/graders/static/output-contains-grader.js"
);
const vallySimulationModule = import("../node_modules/@microsoft/vally/dist/executor/simulation.js");
const vallySimulationControllerModule = import(
  "../node_modules/@microsoft/vally/dist/executor/simulation-controller.js"
);

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

test("case 367 disclosure grader rejects model-identifier additions", () => {
  const spec = yaml.load(fs.readFileSync(
    path.join(root, "packages/agent-defaults/evals/agent-defaults.eval.yaml"),
    "utf8"
  ));
  const stimulus = spec.stimuli.find((item) =>
    item.name === "agent-defaults-case-367-row-01"
  );
  const configuredGrader = stimulus.graders.find((item) =>
    item.type === "output-matches"
  );
  assert.ok(configuredGrader);
  const pattern = new RegExp(configuredGrader.config.pattern);

  for (const output of ["> _AI Assisted._", "  > _AI Assisted._  \n"]) {
    assert.equal(pattern.test(output), true, JSON.stringify(output));
  }
  for (const output of [
    "> _AI Assisted._\nModel identifier: [redacted]",
    "> _AI Assisted._ (model identifier withheld)",
    "> _AI Assisted._\nInternal model details omitted.",
    "AI Assisted.",
  ]) {
    assert.equal(pattern.test(output), false, JSON.stringify(output));
  }
});

test("native normalization-sensitive cases use their configured graders", async () => {
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
    ["development-workflow", 6, [["_repository_", true], ["default", false]]],
    ["development-workflow", 14, [
      ["`${ARTIFACTS_DIR}/01-design.md`", true],
      ["${ARTIFACTS_DIR}/02-design.md", false],
    ]],
    ["code-reviewers", 11, [["n*o", true], ["yes", false]]],
    ["code-reviewers", 12, [["**n_o**", true], ["no, maybe yes", false]]],
    ["code-reviewers", 14, [
      ["`N+1 database queries`", true],
      ["N+1 query issue", false],
    ]],
    ["code-reviewers", 16, [["`perf-reviewer`", true], ["perf-reviewer extra", false]]],
  ];

  for (const [packageName, caseIndex, outputs] of cases) {
    const spec = yaml.load(fs.readFileSync(
      path.join(root, "packages", packageName, "evals", `${packageName}.eval.yaml`), "utf8"
    ));
    const stimuli = spec.stimuli.filter((item) =>
      Number(item.tags?.source_case) === caseIndex
    );
    assert.ok(stimuli.length > 0, `${packageName} case ${caseIndex}`);
    for (const stimulus of stimuli) {
      assert.equal(stimulus.graders.length, 1, stimulus.name);
      const grader = stimulus.graders[0];
      assert.equal(grader.type, "output-text-contract", stimulus.name);
      const registered = registry.graders.get(grader.type);
      for (const [output, expected] of outputs) {
        const result = await registered.grade({
          trajectory: { output },
          config: grader.config,
        });
        assert.equal(result.passed, expected,
          `${stimulus.name}: ${JSON.stringify(output)}`);
      }
    }
  }
});

test("simple source tokens use the built-in output matcher", async () => {
  const { OutputMatchesGrader } = await outputMatchesModule;
  const grader = new OutputMatchesGrader();
  const spec = yaml.load(fs.readFileSync(
    path.join(root, "packages/development-workflow/evals/development-workflow.eval.yaml"),
    "utf8"
  ));
  const cases = [
    [1, " \timplementer\r\n"],
    [2, " No. \n"],
    [3, "\nask_user "],
    [4, " proceed "],
    [8, " PROCEED.\n"],
    [9, " proceed \n"],
    [10, " No "],
  ];
  for (const [sourceCase, output] of cases) {
    const stimulus = spec.stimuli.find((item) =>
      Number(item.tags?.source_case) === sourceCase
    );
    assert.ok(stimulus, `development-workflow case ${sourceCase}`);
    const configured = stimulus.graders[0];
    assert.equal(configured.type, "output-matches", stimulus.name);
    const result = await grader.grade({
      trajectory: { output },
      config: configured.config,
    });
    assert.equal(result.passed, true, stimulus.name);
  }
  const noToken = spec.stimuli.find((item) =>
    Number(item.tags?.source_case) === 2
  ).graders[0];
  assert.equal((await grader.grade({
    trajectory: { output: "**No**" },
    config: noToken.config,
  })).passed, false);
  assert.equal((await grader.grade({
    trajectory: { output: "ASK_USER." },
    config: spec.stimuli.find((item) =>
      Number(item.tags?.source_case) === 3
    ).graders[0].config,
  })).passed, false);
});

test("case 211 requires the selected-SHA token", async () => {
  const { OutputMatchesGrader } = await outputMatchesModule;
  const grader = new OutputMatchesGrader();
  const spec = yaml.load(fs.readFileSync(
    path.join(root, "packages/agent-defaults/evals/agent-defaults.eval.yaml"),
    "utf8"
  ));
  const stimulus = spec.stimuli.find((item) =>
    item.name === "agent-defaults-case-211-row-01"
  );
  assert.match(stimulus.prompt, /full PR lifecycle/);
  assert.match(stimulus.prompt, /do not perform GitHub polling/);
  assert.equal(stimulus.rubric, undefined);
  assert.deepEqual(stimulus.graders.map((item) => item.type), ["output-matches"]);
  const configured = stimulus.graders[0];
  assert.equal(configured.config.pattern, "^COMMIT_CHECKS$");

  for (const [output, expected] of [
    ["COMMIT_CHECKS", true],
    ["PR_SUMMARY", false],
    ["poll check-run and commit-status APIs for the selected SHA", false],
    ["COMMIT_CHECKS PR_SUMMARY", false],
    [" COMMIT_CHECKS ", false],
  ]) {
    const result = await grader.grade({
      trajectory: { output },
      config: configured.config,
    });
    assert.equal(result.passed, expected, JSON.stringify(output));
  }
});

test("draft PR command grader requires explicit repository targeting", async () => {
  const { isValidDraftCreateOutput } = await gradersModule;
  const passing = [
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo github.example/owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo https://github.example/owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo https://github.example/owner/repo.git --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create -R owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create -R=owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create -Rowner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" --body '# Details'",
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" --body=#Details",
    "gh pr create --repo owner/repo --draft --title \"feat: preserve \\$HOME literally\" "
      + "--body \"Details " + String.fromCharCode(92, 96) + "literally\"",
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" --body \"Details (login)\"",
    "gh pr create --repo owner/repo --draft --title \"fix: literal *\" --body \"*.md [ab] ~\"",
    "gh pr create --repo owner/repo --draft --title \"fix: escaped wildcard\" --body \\*.md",
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" "
      + "--body \"{Details,--repo=attacker/repo}\"",
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" --body "
      + String.fromCharCode(92, 123) + "Details,--repo=attacker/repo"
      + String.fromCharCode(92, 125),
    "gh pr create --repo owner/repo --draft --title \"fix: handle null\" --body \"Details\"\n",
    "gh pr create --repo \"https://$(git remote get-url origin | sed -nE 's#^(https?://|ssh://)([^/@]+@)?([A-Za-z0-9.-]+)/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$#\\3/\\4#p;s#^([^/@:]+@)([A-Za-z0-9.-]+):([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$#\\2/\\3#p')\" "
      + "--draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo \"https://$(git remote get-url origin | sed -nE "
      + "'s%^(https?://|ssh://)([^/@]+@)?([A-Za-z0-9.-]+)/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$%\\3/\\4%p;s%^([^/@:]+@)([A-Za-z0-9.-]+):([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$%\\2/\\3%p')\" "
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
    "gh pr create --repo \"$(git remote get-url origin)\" --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo github.example:8443/owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo https://github.example:8443/owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo https://user:token@github.example/owner/repo --draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -nE 's#^(https?://|ssh://|[^/@:]+@)([^/@]+@)?([A-Za-z0-9.-]+)([:/])([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$#https://\\3/\\5#p')\" "
      + "--draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo \"https://$(git remote get-url origin | sed -nE 's#^(https?://|ssh://|[^/@:]+@)([^/@]+@)?([A-Za-z0-9.-]+):([0-9]+)([:/])([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$#\\3:\\4/\\7#p')\" "
      + "--draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -E 's#^(https?://|ssh://|[^/@:]+@)([^/@]+@)?([A-Za-z0-9.-]+)(:[0-9]+)?([:/])([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$#https://\\3\\4/\\6#p')\" "
      + "--draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -nE 's#^(https?://|ssh://|[^/@:]+@)([^/@]+@)?([A-Za-z0-9.-]+):([0-9]+)([:/])([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$#https://\\3:\\4/\\7#p')\" "
      + "--draft --title \"fix: handle null\" --body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -E 's#^(https?://[^/]+/|ssh://[^/]+/|[^@]+@[^:]+:)([^/]+/[^/]+)(\\.git)?$#\\2#')\" "
      + "--draft --title \"fix: handle null\" --body \"Details\"",
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
    "gh pr create --repo owner/repo --title \"feat: add parser\" --body --draft",
    "gh pr create --repo owner/repo --head --draft --title \"feat: add parser\" "
      + "--body \"Details\"",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body \"Details\" -R attacker/repo",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body \"Details\" -R=attacker/repo",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body \"Details\" -Rattacker/repo",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body \"Details\" --repo=attacker/repo",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body {Details,--repo=attacker/repo}",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body # Details",
    "gh pr create --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body Details(login)",
    "gh pr create --repo owner/repo --draft --title \"fix: add parser\" --body *",
    "gh pr create --repo owner/repo --draft --title \"fix: add parser\" --body ?.md",
    "gh pr create --repo owner/repo --draft --title \"fix: add parser\" --body [ab]",
    "gh pr create --repo owner/repo --draft --title \"fix: add parser\" --body ~",
    "gh pr create --repo owner/repo --draft --title \"fix: add parser\" --body=*.md",
    "gh pr create -- --repo owner/repo --draft --title \"feat: add parser\" "
      + "--body \"Details\"",
    "gh pr create --repo \"$(git remote get-url origin | sed -E "
      + "'s%^(https?://[^/]+/|ssh://[^/]+/|[^@]+@[^:]+:)([^/]+/[^/]+)(\\.git)?$%\\1%')\" "
      + "--draft --title \"fix: handle null\" --body \"Details\"",
  ];

  for (const output of passing) {
    assert.equal(isValidDraftCreateOutput(output), true, output);
  }
  for (const output of failing) {
    assert.equal(isValidDraftCreateOutput(output), false, output);
  }
});

test("origin normalization preserves supported formats and rejects malformed remotes", () => {
  const script = String.raw`s#^(https?://|ssh://)([^/@]+@)?([A-Za-z0-9.-]+)/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$#\3/\4#p;s#^([^/@:]+@)([A-Za-z0-9.-]+):([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$#\2/\3#p`;
  const normalize = (origin) => execFileSync("sed", ["-nE", script], {
    input: `${origin}\n`,
    encoding: "utf8",
  }).trim();

  assert.equal(normalize("https://user:token@github.example/owner/repo.git"), "github.example/owner/repo.git");
  assert.equal(normalize("ssh://git@github.example/owner/repo"), "github.example/owner/repo");
  assert.equal(normalize("git@github.example:owner/repo"), "github.example/owner/repo");
  assert.equal(normalize("https://github.example:123/repo"), "");
  assert.equal(normalize("git@github.example/owner/repo"), "");
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

test("cases 409 and 410 simulate only a scoped reply and fail closed for every other shell call", async () => {
  const { resolveToolOverride, renderShellSimulation } = await vallySimulationModule;
  const { SimulationController } = await vallySimulationControllerModule;
  const spec = yaml.load(fs.readFileSync(
    path.join(root, "packages/agent-defaults/evals/agent-defaults.eval.yaml"),
    "utf8"
  ));
  const names = [
    "agent-defaults-case-409-row-01",
    "agent-defaults-case-410-row-01",
  ];
  const body = "The cancellation fix now stops work when the request is canceled, so the operation does not continue afterward.";
  const command = `gh api repos/owner/repo/pulls/42/comments/7/replies --method POST --field body="${body}"`;
  const expectedCommandPattern =
    '^gh api repos/owner/repo/pulls/42/comments/7/replies --method POST --field body="' +
    '[A-Za-z0-9 /,.;:-]{40,250}"$';
  const blockedCommands = [
    "pwd",
    'gh api repos/owner/repo/pulls/42/comments/7/replies --method POST --field body="short"',
    `${command}; gh pr merge 42`,
    `gh api repos/owner/repo/issues/42/comments --method POST --field body="${body}"`,
    `gh api repos/owner/repo/pulls/42/comments/7/replies --method POST --field body="The cancellation fix stops work after caller cancellation — so it cannot continue afterward."`,
  ];

  for (const name of names) {
    const stimulus = spec.stimuli.find((item) => item.name === name);
    assert.ok(stimulus, name);
    const simulation = stimulus.simulation;
    const overrides = simulation.tool_overrides;
    assert.equal(overrides.bash.default.is_error, true, name);
    assert.equal(overrides.bash.patterns.length, 1, name);
    assert.equal(overrides.bash.patterns[0].match, expectedCommandPattern, name);
    assert.ok(stimulus.graders[0].config.prompt.includes(expectedCommandPattern), name);
    assert.equal(overrides.web_fetch.is_error, true, name);
    assert.equal(overrides.web_search.is_error, true, name);
    assert.ok(stimulus.attachments.includes("fixtures/reply-action-state.md"), name);
    assert.ok(stimulus.agent_environment.skills.includes("../.apm/skills/acting-on-behalf"), name);
    assert.match(stimulus.prompt, /40-250 ASCII/);
    assert.match(stimulus.prompt, /request context and stops further work/);
    assert.match(stimulus.prompt, /shell control syntax in the body/);
    assert.match(stimulus.prompt, /already implemented and verified/);
    assert.match(stimulus.prompt, /not new work by you/);
    assert.match(stimulus.prompt, /Do not implement or change code/);
    assert.match(
      stimulus.prompt,
      /If the acting-on-behalf skill is not already loaded, call `skill` once with `\{"skill":"acting-on-behalf"\}` and wait for it to succeed before the reply\./
    );
    const rubric = stimulus.rubric.join("\n").replace(/\s+/g, " ");
    assert.match(
      rubric,
      /"Implemented cancellation fix" is a report of that existing fact, not a claim of new work/
    );
    assert.match(rubric, /must not attempt or claim new implementation or code changes in this run/);
    const graderPrompt = stimulus.graders[0].config.prompt.replace(/\s+/g, " ");
    assert.match(
      graderPrompt,
      /The only permitted sequences are Bash call, Bash result; or skill call, skill result, Bash call, Bash result\. Reject all extra, missing, or out-of-order tool events\./
    );
    assert.match(
      graderPrompt,
      /Each result must match its preceding call by non-empty data\.toolCallId and data\.toolName and have data\.success equal to true\./
    );
    assert.match(
      graderPrompt,
      /data\.toolName equal to "skill" and data\.arguments exactly \{"skill":"acting-on-behalf"\}\. No simulated flag is required for the skill call\./
    );
    assert.match(
      graderPrompt,
      /"Implemented cancellation fix" reports that pre-existing fact and is allowed/
    );
    assert.match(
      graderPrompt,
      /unless the response explicitly says the agent implemented or changed code in this run/
    );
    assert.match(graderPrompt, /must not attempt implementation or claim new code changes in this run/);

    const controller = new SimulationController(simulation);
    const slashBodyCommand = command.replace(`body="${body}"`, `body="${body} / verified"`);
    assert.equal(
      resolveToolOverride("bash", { command: slashBodyCommand }, overrides).isError,
      false,
      `${name}: slash should be allowed inside the quoted body`
    );
    for (const toolName of ["bash", "shell", "powershell"]) {
      assert.equal(controller.isSimulated(toolName, { command }), true, `${name}: ${toolName}`);
      const result = resolveToolOverride(toolName, { command }, overrides);
      assert.ok(result, `${name}: ${toolName} did not match`);
      assert.equal(result.isError, false, `${name}: ${toolName}`);
      const rewritten = renderShellSimulation(toolName, result);
      assert.doesNotMatch(rewritten, /gh api|owner\/repo/);
      if (toolName === "powershell") {
        assert.ok(rewritten.includes(Buffer.from(result.output).toString("base64")));
      } else {
        assert.match(rewritten, /SIMULATED_SUCCESS/);
      }
      const intercepted = controller.onPreToolUse({
        toolName,
        toolArgs: JSON.stringify({ command }),
      });
      assert.doesNotMatch(intercepted.modifiedArgs.command, /gh api|owner\/repo/);
    }

    for (const toolName of ["bash", "shell", "powershell"]) {
      for (const blockedCommand of blockedCommands) {
        assert.equal(controller.isSimulated(toolName, { command: blockedCommand }), true);
        const result = resolveToolOverride(toolName, { command: blockedCommand }, overrides);
        assert.ok(result, `${name}: ${toolName} ${blockedCommand}`);
        assert.equal(result.isError, true, `${name}: ${toolName} ${blockedCommand}`);
        assert.doesNotMatch(
          renderShellSimulation(toolName, result),
          /gh api|owner\/repo|gh pr merge/
        );
      }
    }
  }
});

test("case 158 uses an exact feedback-routing token and retains its review obligations", async () => {
  const { OutputContainsGrader } = await outputContainsModule;
  const { OutputMatchesGrader } = await outputMatchesModule;
  const spec = yaml.load(fs.readFileSync(
    path.join(root, "packages/agent-defaults/evals/agent-defaults.eval.yaml"),
    "utf8"
  ));
  const stimulus = spec.stimuli.find((item) =>
    item.name === "agent-defaults-case-158-row-01"
  );
  const grader = stimulus.graders.find((item) =>
    item.name === "agent-defaults-case-158-row-01-assertion-1-feedback-routing"
  );
  const expected = "ACCEPTED_FINDINGS_EXPLICIT_MULTI_REVIEW_SKIP_INTAKE_KEEP_POST_FIX_REVIEW";
  const alternative =
    "ACCEPTED_FINDINGS_EXPLICIT_MULTI_REVIEW_REPEAT_INTAKE_KEEP_POST_FIX_REVIEW";
  const routingGrader = new OutputMatchesGrader();
  const containsGrader = new OutputContainsGrader();

  assert.match(stimulus.prompt, new RegExp(expected));
  assert.match(stimulus.prompt, new RegExp(alternative));
  assert.equal(grader.config.pattern, `^${expected}$`);
  assert.equal(stimulus.graders.filter((item) => item.type === "output-contains").length, 3);

  for (const output of [expected, alternative]) {
    for (const configured of stimulus.graders.filter((item) => item.type === "output-contains")) {
      const result = await containsGrader.grade({
        trajectory: { output },
        config: configured.config,
      });
      assert.equal(result.passed, true, `${configured.name}: ${output}`);
    }
  }

  for (const [output, expectedPass] of [
    [expected, true],
    [alternative, false],
    [`${expected} explanation`, false],
    ["The loop does not repeat the intake review.", false],
  ]) {
    const result = await routingGrader.grade({
      trajectory: { output },
      config: grader.config,
    });
    assert.equal(result.passed, expectedPass, JSON.stringify(output));
  }
});
