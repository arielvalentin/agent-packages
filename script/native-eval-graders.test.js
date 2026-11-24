const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const gradersModule = import("@microsoft/vally");
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
  const { createDefaultGraderRegistry } = await gradersModule;
  const registry = createDefaultGraderRegistry();
  const cases = [
    ["agent-defaults", 350, [
      ["DRAFT, then post the reply and resolve the thread.", false],
      ["DRAFT", true],
      ["**DRAFT**", true],
      ["DRAFT the PR after review.", false],
    ]],
    ["agent-defaults", 333, [
      ["AUTOMATION_FLOW", true],
      ["**AUTOMATION_FLOW**", true],
      ["AUTOMATION_FLOW\n` HUMAN_STOP `", false],
      ["AUTOMATION_FLOW\nSelected **path**: HUMAN_STOP", false],
      ["AUTOMATION_FLOW\n**classification**: HUMAN_STOP", false],
    ]],
    ["agent-defaults", 335, [
      ["AUTOMATION_FLOW", true],
      ["AUTOMATION_FLOW\n` HUMAN_STOP `", false],
      ["Decision token for this interaction: AUTOMATION_FLOW", false],
      ["AUTOMATION_FLOW\nDecision token for this interaction: HUMAN_STOP", false],
      ["AUTOMATION_FLOW\nDecision token for the given actor metadata is `HUMAN_STOP`", false],
      ["AUTOMATION_FLOW\nDecision **token** for this interaction: HUMAN_STOP", false],
    ]],
    ["agent-defaults", 404, [[" medium ", true]]],
    ["agent-defaults", 354, [
      ["**No**", true],
      ["**No**.", true],
      ["**No.**", true],
      [" No ", true],
      ["Yes", false],
    ]],
    ["agent-defaults", 358, [
      ["**No**", true],
      ["**No.** It does not permit automatic bot/app handling.", true],
      [" No ", true],
      ["No\n**Yes**", false],
      ["No\n**Yes**.", false],
      ["No\n_Yes_.", false],
      ["Yes", false],
    ]],
    ["agent-defaults", 308, [
      ["_No_", true],
      ["_No_\n_Yes_", false],
      ["No\n**Yes**.", false],
    ]],
    ["agent-defaults", 351, [
      ["_Yes_", true],
      ["Yes, also resolve the thread.", false],
      ["Yes, also **resolve** the thread.", false],
      ["Yes, do **not** proceed.", false],
      ["Yes, _cannot proceed_.", false],
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
      ["N+1 **database queries**", true],
      ["N+1 database **query** pattern", true],
      ["N+1 **database** `queries` **problem**", true],
      ["N+1 query issue", false],
      ["N+1 **database queries** and more", false],
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
      for (const [output, expected] of outputs) {
        const results = await Promise.all(stimulus.graders.map(async (grader) => {
          assert.equal(grader.type, "output-matches", stimulus.name);
          return registry.get(grader.type).grade({
            trajectory: { output }, config: grader.config,
          });
        }));
        assert.equal(results.every((result) => result.passed), expected,
          `${stimulus.name}: ${JSON.stringify(output)}`);
      }
    }
  }
});

test("built-in architecture graders retain trimmed length and artifact boundaries", async () => {
  const { createDefaultGraderRegistry } = await gradersModule;
  const registry = createDefaultGraderRegistry();
  const spec = yaml.load(fs.readFileSync(
    path.join(root, "packages/development-workflow/evals/development-workflow.eval.yaml"), "utf8"
  ));
  const stimulus = spec.stimuli.find((item) =>
    item.name === "development-workflow-case-016-row-01"
  );
  for (const [output, expected] of [
    ["The module isolates client details.", true],
    [`  module${"x".repeat(9)}  `, false],
    [`  module${"x".repeat(10)}  `, true],
    [`  module${"x".repeat(493)}  `, true],
    [`  module${"x".repeat(494)}  `, false],
    ["The module design is saved in 01-design.md.", false],
    ["", false],
  ]) {
    const results = await Promise.all(stimulus.graders.map((grader) =>
      registry.get(grader.type).grade({ trajectory: { output }, config: grader.config })
    ));
    assert.equal(results.every((result) => result.passed), expected, JSON.stringify(output));
  }
});

test("built-in draft command case requires one explicit safe command", async () => {
  const { createDefaultGraderRegistry } = await gradersModule;
  const registry = createDefaultGraderRegistry();
  const spec = yaml.load(fs.readFileSync(
    path.join(root, "packages/development-workflow/evals/development-workflow.eval.yaml"), "utf8"
  ));
  const stimulus = spec.stimuli.find((item) =>
    item.name === "development-workflow-case-011-row-01"
  );
  const command = 'gh pr create --repo octo/example --draft --title "fix: prevent null login crash" --body "Reject missing login data."';
  for (const [output, expected] of [
    [command, true],
    [`${command}\n`, true],
    [command.replace("fix:", "fix(login):"), true],
    [command.replace("fix: prevent null login crash", `fix: ${"x".repeat(67)}`), true],
    [command.replace("fix: prevent null login crash", `fix: ${"x".repeat(68)}`), false],
    [command.replace("fix: prevent null login crash", `fix(login): ${"x".repeat(60)}`), true],
    [command.replace("fix: prevent null login crash", `fix(login): ${"x".repeat(61)}`), false],
    [command.replace("octo/example", "other/repo"), false],
    [command.replace("--draft ", ""), false],
    [command.replace("fix:", "WIP:"), false],
    [command.replace("Reject missing login data.", " "), false],
    [command.replace("Reject missing login data.", "$(id)"), false],
    [`${command}; echo extra`, false],
    [`${command}\necho extra`, false],
    ["No command is needed.", false],
  ]) {
    const results = await Promise.all(stimulus.graders.map((grader) =>
      registry.get(grader.type).grade({ trajectory: { output }, config: grader.config })
    ));
    assert.equal(results.every((result) => result.passed), expected, JSON.stringify(output));
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
