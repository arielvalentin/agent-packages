const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const vm = require("node:vm");
const yaml = require("js-yaml");
const { validateNativeSuite } = require("./validate-native-evals.js");
const { packages } = require("./run-affected-tests.js");
const gradersModule = import("./native-eval-graders.mjs");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const defaultsSpec = yaml.load(fs.readFileSync(
  path.join(root, "packages/agent-defaults/evals/agent-defaults.eval.yaml"), "utf8"
));
function defaultsCase(index) {
  const name = `agent-defaults-case-${String(index).padStart(3, "0")}-row-01`;
  const stimulus = defaultsSpec.stimuli.find((item) => item.name === name);
  assert.ok(stimulus, `Missing native stimulus: ${name}`);
  return stimulus;
}

test("native evaluation dependencies are pinned and Promptfoo/Ollama are absent", () => {
  assert.equal(manifest.devDependencies["@microsoft/vally-cli"], "0.19.0");
  assert.equal(typeof manifest.devDependencies["js-yaml"], "string");
  assert.deepEqual(manifest.allowScripts, { "esbuild@0.28.2": true, fsevents: false });
  assert.equal(manifest.devDependencies.promptfoo, undefined);
  assert.equal(manifest.devDependencies.ollama, undefined);
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (entry.resolved) {
      assert.ok(
        entry.resolved.startsWith("https://registry.npmjs.org/"),
        `${name} must resolve from the public npm registry`
      );
    }
  }
  for (const script of Object.values(manifest.scripts)) {
    assert.doesNotMatch(script, /promptfoo|ollama/i);
  }
  assert.equal(fs.statSync(path.join(root, "node_modules/.bin/vally")).isFile(), true);
});

test("Copilot credentials are scoped to the native evaluation step", () => {
  const runner = fs.readFileSync(path.join(root, "script/run-evals.js"), "utf8");
  assert.match(runner, /process\.env\[name\]\.trim\(\)\.length > 0/);
  assert.equal(fs.existsSync(path.join(root, ".github/actions/eval-package/action.yml")), false);
  for (const workflowName of [
    "eval-agent-defaults.yml",
    "eval-coordinator.yml",
    "eval-development-workflow.yml",
    "eval-code-reviewers.yml",
  ]) {
    const workflow = yaml.load(fs.readFileSync(
      path.join(root, ".github/workflows", workflowName),
      "utf8"
    ));
    if (workflowName === "eval-coordinator.yml") {
      assert.deepEqual(Object.keys(workflow.on), ["pull_request", "push", "workflow_dispatch"]);
      assert.deepEqual(workflow.on.pull_request.branches, ["main"]);
      assert.ok(workflow.on.pull_request.paths.includes(".vally.yaml"));
      for (const dependencyPath of [
        "script/native-eval-fixtures.js",
        "script/native-eval-fixtures.json",
      ]) {
        assert.ok(workflow.on.pull_request.paths.includes(dependencyPath), dependencyPath);
        assert.ok(workflow.on.push.paths.includes(dependencyPath), dependencyPath);
      }
      assert.ok(!workflow.on.pull_request.paths.includes(".github/actions/eval-package/**"));
      assert.ok(!workflow.on.push.paths.includes(".github/actions/eval-package/**"));
      assert.deepEqual(workflow.permissions, { contents: "read" });
      assert.deepEqual(workflow.jobs.run.permissions, {
        contents: "read",
        "copilot-requests": "write",
      });
      assert.deepEqual(workflow.jobs.report.permissions, {
        actions: "read",
        contents: "read",
        "pull-requests": "write",
      });
      assert.deepEqual(workflow.jobs.report.needs, ["lint", "run"]);
      assert.deepEqual(workflow.jobs.report.concurrency, {
        group: "evals-${{ github.workflow_ref }}",
        "cancel-in-progress": false,
      });
      assert.deepEqual(workflow.jobs.lint.concurrency, workflow.jobs.run.concurrency);
      assert.equal(workflow.jobs.lint.concurrency["cancel-in-progress"], true);

      const ownerPr = {
        repository: "owner/repo",
        repository_owner: "owner",
        actor: "owner",
        triggering_actor: "owner",
        event_name: "pull_request",
        ref: "refs/pull/1/merge",
        event: {
          pull_request: {
            user: { login: "owner" },
            head: { repo: { full_name: "owner/repo" } },
          },
        },
      };
      const evaluateCondition = (condition, github, needs = {}) => vm.runInNewContext(
        condition,
        { github, needs, always: () => true }
      );
      for (const condition of [workflow.jobs.lint.if, workflow.jobs.run.if]) {
        const needs = {
          lint: { result: "success" },
          run: { result: "success", outputs: { "inventory-valid": "true", "action-outcome": "passed" } },
        };
        assert.equal(evaluateCondition(condition, ownerPr, needs), true);
        assert.equal(evaluateCondition(condition, {
          ...ownerPr,
          actor: "other",
        }, needs), false);
        assert.equal(evaluateCondition(condition, {
          ...ownerPr,
          triggering_actor: "other",
        }, needs), false);
        assert.equal(evaluateCondition(condition, {
          ...ownerPr,
          event: {
            pull_request: {
              user: { login: "other" },
              head: { repo: { full_name: "owner/repo" } },
            },
          },
        }, needs), false);
        assert.equal(evaluateCondition(condition, {
          ...ownerPr,
          event: {
            pull_request: {
              user: { login: "owner" },
              head: { repo: { full_name: "fork/repo" } },
            },
          },
        }, needs), false);
        assert.equal(evaluateCondition(condition, {
          ...ownerPr,
          event_name: "push",
          ref: "refs/heads/main",
          event: {},
        }, needs), true);
        assert.equal(evaluateCondition(condition, {
          ...ownerPr,
          event_name: "workflow_dispatch",
          ref: "refs/heads/main",
          event: {},
        }, needs), true);
        assert.equal(evaluateCondition(condition, {
          ...ownerPr,
          event_name: "push",
          ref: "refs/heads/feature",
          event: {},
        }, needs), false);
      }
      assert.equal(evaluateCondition(workflow.jobs.report.if, ownerPr, {
        lint: { result: "success" },
        run: { result: "success", outputs: { "inventory-valid": "true", "action-outcome": "passed" } },
      }), true);
      for (const changes of [
        { actor: "other" },
        { triggering_actor: "other" },
        {
          event: {
            pull_request: {
              user: { login: "other" },
              head: { repo: { full_name: "owner/repo" } },
            },
          },
        },
        {
          event: {
            pull_request: {
              user: { login: "owner" },
              head: { repo: { full_name: "fork/repo" } },
            },
          },
        },
      ]) {
        assert.equal(evaluateCondition(workflow.jobs.report.if, {
          ...ownerPr,
          ...changes,
        }, {
          lint: { result: "success" },
          run: { result: "success", outputs: { "inventory-valid": "true", "action-outcome": "passed" } },
        }), false);
      }
      assert.equal(evaluateCondition(workflow.jobs.report.if, ownerPr, {
        lint: { result: "success" },
        run: { result: "cancelled", outputs: {} },
      }), false);
      assert.equal(evaluateCondition(workflow.jobs.report.if, ownerPr, {
        lint: { result: "success" },
        run: { result: "failure", outputs: { "inventory-valid": "", "action-outcome": "passed" } },
      }), false);
      assert.equal(evaluateCondition(workflow.jobs.report.if, ownerPr, {
        lint: { result: "success" },
        run: { result: "failure", outputs: { "inventory-valid": "", "action-outcome": "failed" } },
      }), true);

      const preflight = workflow.jobs.lint.steps.find((step) =>
        step.name === "Validate coordinator suite preflight"
      );
      assert.equal(preflight.run, "node script/validate-native-evals.js --check coordinator \"$EVAL_SUITE\"");
      assert.ok(workflow.jobs.lint.steps.some((step) => step.run === "npm ci"));
      const actionSteps = ["lint", "run", "report"].map((job) =>
        workflow.jobs[job].steps.find((step) =>
          step.uses?.startsWith("github/evals-action@")
        )
      );
      assert.ok(actionSteps.every((step) =>
        /^github\/evals-action@[a-f0-9]{40}$/.test(step.uses)
      ));
      assert.equal(new Set(actionSteps.map((step) => step.uses)).size, 1);
      assert.equal(actionSteps[0].with.command, "lint");
      assert.equal(actionSteps[0].with["vally-version"], "0.19.0");
      assert.equal(actionSteps[0].with["report-id"], "coordinator");
      assert.equal(actionSteps[1].with.command, "run");
      assert.equal(actionSteps[1].with["vally-version"], "0.19.0");
      assert.equal(actionSteps[1].with.model, "gpt-5.3-codex");
      assert.equal(actionSteps[1].with.runs, "1");
      assert.equal(actionSteps[1].with.workers, "1");
      assert.equal(actionSteps[1].with["max-retries"], "0");
      assert.equal(
        actionSteps[1].with["copilot-token"],
        "${{ secrets.COPILOT_GITHUB_TOKEN || github.token }}"
      );
      assert.equal(workflow.jobs.run.outputs["action-outcome"], "${{ steps.evals.outputs.outcome }}");
      assert.equal(
        workflow.jobs.run.outputs["inventory-valid"],
        "${{ steps.validate.outputs.valid }}"
      );
      const validateStep = workflow.jobs.run.steps.find((step) => step.id === "validate");
      assert.equal(validateStep.if, "always()");
      assert.match(validateStep.run, /findVallyJsonlOutput/);
      assert.match(validateStep.run, /validate-native-evals\.js --results coordinator/);
      assert.equal(actionSteps[2].with.command, "report");
      assert.equal(actionSteps[2].with["vally-version"], "0.19.0");
      assert.equal(actionSteps[2].with["report-id"], "coordinator");
      const suiteExpression = actionSteps[1].with.suite.replace(/^\$\{\{\s*|\s*\}\}$/g, "");
      assert.equal(vm.runInNewContext(suiteExpression, {
        github: ownerPr,
        inputs: {},
      }), "coordinator-smoke");
      assert.equal(vm.runInNewContext(suiteExpression, {
        github: { ...ownerPr, event_name: "push", event: {} },
        inputs: { suite: "full" },
      }), "coordinator-full");
      for (const job of ["lint", "run"]) {
        const checkout = workflow.jobs[job].steps.find((step) =>
          step.uses.startsWith("actions/checkout@")
        );
        assert.equal(checkout.with["persist-credentials"], false, job);
      }
      continue;
    }
    const packageName = workflowName.replace(/^eval-/, "").replace(/\.yml$/, "");
    const packagePaths = [`packages/${packageName}/**`];
    if (packageName === "development-workflow") packagePaths.push("packages/agent-defaults/**");
    assert.deepEqual(
      Object.keys(workflow.on),
      ["pull_request", "push", "workflow_dispatch"],
      workflowName
    );
    assert.deepEqual(workflow.on.pull_request.branches, ["main"], workflowName);
    assert.deepEqual(workflow.on.pull_request.paths, workflow.on.push.paths, workflowName);
    for (const dependencyPath of [
      ...packagePaths,
      ".vally.yaml",
      "script/native-eval-fixtures.js",
      "script/native-eval-fixtures.json",
      "script/native-eval-graders.mjs",
      "script/native-eval-graders.test.js",
      "script/validate-native-evals.js",
      "script/validate-native-evals.test.js",
    ]) {
      assert.ok(workflow.on.pull_request.paths.includes(dependencyPath), `${workflowName} ${dependencyPath}`);
    }
    assert.ok(!workflow.on.push.paths.includes(".github/actions/eval-package/**"), workflowName);
    assert.deepEqual(
      workflow.on.workflow_dispatch.inputs.suite.options,
      ["smoke", "full"],
      `${workflowName} dispatch suites`
    );
    assert.deepEqual(workflow.permissions, { contents: "read" }, workflowName);
    assert.deepEqual(
      workflow.jobs.run.permissions,
      { contents: "read", "copilot-requests": "write" },
      workflowName
    );
    assert.deepEqual(
      workflow.jobs.report.permissions,
      { actions: "read", contents: "read", "pull-requests": "write" },
      workflowName
    );
    assert.equal(workflow.jobs.lint.permissions, undefined, workflowName);
    assert.equal(workflow.jobs.report.permissions["copilot-requests"], undefined, workflowName);
    assert.equal(workflow.jobs.run.permissions["pull-requests"], undefined, workflowName);
    assert.deepEqual(workflow.jobs.report.needs, ["lint", "run"], workflowName);

    const ownerPr = {
      repository: "owner/repo",
      repository_owner: "owner",
      actor: "owner",
      triggering_actor: "owner",
      event_name: "pull_request",
      ref: "refs/pull/1/merge",
      event: {
        pull_request: {
          user: { login: "owner" },
          head: { repo: { full_name: "owner/repo" } },
        },
      },
    };
    const evaluateCondition = (condition, github, needs = {}) => vm.runInNewContext(
      condition,
      { github, needs, always: () => true }
    );
    for (const job of ["lint", "run"]) {
      const condition = workflow.jobs[job].if;
      assert.equal(evaluateCondition(condition, ownerPr), true, `${workflowName} ${job} owner PR`);
      for (const changes of [
        { actor: "other" },
        { triggering_actor: "other" },
        { event: { pull_request: { user: { login: "other" }, head: { repo: { full_name: "owner/repo" } } } } },
        { event: { pull_request: { user: { login: "owner" }, head: { repo: { full_name: "fork/repo" } } } } },
      ]) {
        assert.equal(
          evaluateCondition(condition, { ...ownerPr, ...changes }),
          false,
          `${workflowName} ${job} rejected PR`
        );
      }
      assert.equal(evaluateCondition(condition, {
        ...ownerPr,
        event_name: "push",
        ref: "refs/heads/main",
        event: {},
      }), true, `${workflowName} ${job} main push`);
      assert.equal(evaluateCondition(condition, {
        ...ownerPr,
        event_name: "workflow_dispatch",
        ref: "refs/heads/main",
        event: {},
      }), true, `${workflowName} ${job} manual main run`);
      assert.equal(evaluateCondition(condition, {
        ...ownerPr,
        event_name: "push",
        ref: "refs/heads/feature",
        event: {},
      }), false, `${workflowName} ${job} non-main push`);
    }

    const actionSteps = ["lint", "run", "report"].map((job) =>
      workflow.jobs[job].steps.find((step) => step.uses?.startsWith("github/evals-action@"))
    );
    assert.ok(actionSteps.every((step) => /^github\/evals-action@[a-f0-9]{40}$/.test(step.uses)));
    assert.equal(new Set(actionSteps.map((step) => step.uses)).size, 1, workflowName);
    assert.deepEqual(
      actionSteps.map((step) => step.with.command),
      ["lint", "run", "report"],
      workflowName
    );
    assert.ok(actionSteps.every((step) => step.with["vally-version"] === "0.19.0"), workflowName);
    assert.ok(actionSteps.every((step) => step.with["report-id"] === packageName), workflowName);
    assert.equal(actionSteps[1].with.model, "gpt-5.3-codex");
    assert.equal(actionSteps[1].with.runs, "1");
    assert.equal(actionSteps[1].with.workers, "1");
    assert.equal(actionSteps[1].with["max-retries"], "0");
    assert.equal(actionSteps[1]["continue-on-error"], true, workflowName);
    assert.equal(
      actionSteps[1].with["copilot-token"],
      "${{ secrets.COPILOT_GITHUB_TOKEN || github.token }}"
    );
    assert.equal(actionSteps[0].with["working-directory"], ".");
    assert.equal(actionSteps[1].with["working-directory"], ".");
    assert.equal(workflow.jobs.run.outputs["action-outcome"], "${{ steps.evals.outputs.outcome }}");
    assert.equal(workflow.jobs.run.outputs["inventory-valid"], "${{ steps.validate.outputs.valid }}");
    const validateStep = workflow.jobs.run.steps.find((step) => step.id === "validate");
    assert.equal(validateStep.if, "always()");
    assert.equal(validateStep.env["EVAL_ACTION_OUTCOME"], "${{ steps.evals.outputs.outcome }}");
    assert.equal(validateStep.env["EVAL_ACTION_STEP_OUTCOME"], "${{ steps.evals.outcome }}");
    assert.equal(validateStep.env["EVAL_REPORT_ARTIFACT_ID"], "${{ steps.evals.outputs.artifact-id }}");
    assert.equal(validateStep.env["EVAL_REPORT_ARTIFACT_DIGEST"], "${{ steps.evals.outputs.artifact-digest }}");
    assert.match(validateStep.run, /findVallyJsonlOutput/);
    assert.match(validateStep.run, new RegExp(`validate-native-evals\\.js --results ${packageName}`));
    assert.match(
      validateStep.run,
      /validator_status=0[\s\S]*\|\| validator_status=\$\?[\s\S]*case "\$validator_status" in[\s\S]*0\)[\s\S]*EVAL_ACTION_OUTCOME" != "passed"[\s\S]*10\)[\s\S]*EVAL_ACTION_OUTCOME" != "failed"[\s\S]*\*\)[\s\S]*exit "\$validator_status"[\s\S]*EVAL_REPORT_ARTIFACT_ID[\s\S]*echo "valid=true"/
    );
    const outputLine = 'echo "valid=true" >> "$GITHUB_OUTPUT"';
    const validationStart = validateStep.run.indexOf("set -euo pipefail");
    const validationEnd = validateStep.run.indexOf(outputLine, validationStart) + outputLine.length;
    const validationScript = validateStep.run.slice(validationStart, validationEnd);
    const nodeStub = [
      "node() {",
      '  if [[ "$1" == "-e" ]]; then',
      '    if [[ "$DISCOVERY_STATUS" -ne 0 ]]; then return "$DISCOVERY_STATUS"; fi',
      '    printf "%s" "$RESULTS_FILE"',
      "    return 0",
      "  fi",
      '  if [[ "$1" == "script/validate-native-evals.js" ]]; then return "$VALIDATOR_STATUS"; fi',
      "  return 127",
      "}",
    ].join("\n");
    const makeCase = (name, overrides = {}) => ({
      name,
      validatorStatus: 0,
      actionOutcome: "passed",
      stepOutcome: "success",
      artifactId: "123",
      artifactDigest: "sha256:abc",
      nativeDiagnosticsPath: "/tmp/native",
      discoveryStatus: 0,
      expectedStatus: 1,
      expectedOutput: "",
      ...overrides,
    });
    const cases = [
      makeCase("passed inventory", { expectedStatus: 0, expectedOutput: "valid=true\n" }),
      makeCase("approved diagnostics", {
        validatorStatus: 10,
        actionOutcome: "failed",
        stepOutcome: "failure",
        expectedStatus: 0,
        expectedOutput: "valid=true\n",
      }),
      makeCase("inconsistent diagnostic action result", { validatorStatus: 10, actionOutcome: "failed" }),
      makeCase("validator error", { validatorStatus: 1, actionOutcome: "error", stepOutcome: "failure" }),
      makeCase("unexpected validator status", {
        validatorStatus: 2,
        actionOutcome: "error",
        stepOutcome: "failure",
        expectedStatus: 2,
      }),
      makeCase("action failure with passing inventory", { stepOutcome: "failure" }),
      makeCase("diagnostics with action error", {
        validatorStatus: 10,
        actionOutcome: "error",
        stepOutcome: "failure",
      }),
      makeCase("diagnostics without report artifact", {
        validatorStatus: 10,
        actionOutcome: "failed",
        stepOutcome: "failure",
        artifactId: "",
        artifactDigest: "",
      }),
      makeCase("missing report artifact", { artifactId: "", artifactDigest: "" }),
      makeCase("missing diagnostics", { nativeDiagnosticsPath: "" }),
      makeCase("result discovery error", { discoveryStatus: 1 }),
    ];
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "eval-validation-"));
    try {
      for (const [index, testCase] of cases.entries()) {
        const outputPath = path.join(outputDirectory, `case-${index}`);
        fs.writeFileSync(outputPath, "");
        const result = spawnSync("bash", ["-c", `${nodeStub}\n${validationScript}`], {
          env: {
            ...process.env,
            EVAL_ACTION_OUTCOME: testCase.actionOutcome,
            EVAL_ACTION_STEP_OUTCOME: testCase.stepOutcome,
            EVAL_REPORT_ARTIFACT_DIGEST: testCase.artifactDigest,
            EVAL_REPORT_ARTIFACT_ID: testCase.artifactId,
            EVAL_SUITE: "smoke",
            GITHUB_OUTPUT: outputPath,
            NATIVE_DIAGNOSTICS_PATH: testCase.nativeDiagnosticsPath,
            RESULTS_FILE: "/tmp/results.jsonl",
            VALIDATOR_STATUS: String(testCase.validatorStatus),
            DISCOVERY_STATUS: String(testCase.discoveryStatus),
          },
        });
        assert.equal(result.status, testCase.expectedStatus, `${workflowName}: ${testCase.name}`);
        assert.equal(
          fs.readFileSync(outputPath, "utf8"),
          testCase.expectedOutput,
          `${workflowName}: ${testCase.name} output`
        );
      }
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }

    const suiteExpression = actionSteps[1].with.suite.replace(/^\$\{\{\s*|\s*\}\}$/g, "");
    for (const [event, input, expected] of [
      [ownerPr, {}, `${packageName}-smoke`],
      [{ ...ownerPr, event_name: "push", event: {} }, {}, `${packageName}-smoke`],
      [{ ...ownerPr, event_name: "workflow_dispatch", event: {} }, { suite: "full" }, `${packageName}-full`],
      [{ ...ownerPr, event_name: "pull_request" }, { suite: "full" }, `${packageName}-smoke`],
    ]) {
      assert.equal(vm.runInNewContext(suiteExpression, { github: event, inputs: input }), expected);
    }
    const checkReport = (run) => evaluateCondition(workflow.jobs.report.if, ownerPr, {
      lint: { result: "success" },
      run,
    });
    assert.equal(checkReport({
      result: "success",
      outputs: { "inventory-valid": "true", "action-outcome": "passed" },
    }), true, workflowName);
    assert.equal(checkReport({
      result: "failure",
      outputs: { "inventory-valid": "", "action-outcome": "failed" },
    }), true, workflowName);
    assert.equal(checkReport({
      result: "failure",
      outputs: { "inventory-valid": "", "action-outcome": "passed" },
    }), false, workflowName);
    assert.equal(checkReport({ result: "cancelled", outputs: {} }), false, workflowName);
  }
  const ci = yaml.load(fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8"));
  assert.ok(ci.on.pull_request, "pull requests retain credential-free structural validation");
  assert.ok(ci.jobs.validate.steps.some((step) =>
    step.run === "npm run test:dependencies"
  ));
});

test("evaluation runner requires a token and forwards it to Vally", async () => {
  const { CopilotSdkExecutor } = await import("@microsoft/vally/executor");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "eval-auth-test-"));
  const originalGhToken = process.env.GH_TOKEN;
  try {
    const hook = path.join(temp, "capture.js");
    const captured = path.join(temp, "captured");
    fs.writeFileSync(hook, `
      const fs = require("node:fs");
      require("node:child_process").spawnSync = (command, args, options) => {
        if (!command.endsWith("node_modules/.bin/vally")) throw new Error("Unexpected subprocess");
        fs.writeFileSync(process.env.TEST_CAPTURE, JSON.stringify({
          token: options.env.GH_TOKEN,
          args,
        }));
        return { status: 1 };
      };
    `);
    const env = {
      ...process.env,
      NODE_OPTIONS: `--require=${hook}`,
      TEST_CAPTURE: captured,
      VALLY_MODEL: "gpt-5.3-codex",
      VALLY_RESULTS_DIR: path.join(temp, "results"),
    };
    delete env.COPILOT_GITHUB_TOKEN;
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    const run = (token, model) => {
      const runEnv = { ...env, GH_TOKEN: token };
      if (model === undefined) delete runEnv.VALLY_MODEL;
      else runEnv.VALLY_MODEL = model;
      return spawnSync(process.execPath, [
        path.join(root, "script/run-evals.js"), "agent-defaults", "smoke",
      ], { cwd: root, env: runEnv, encoding: "utf8" });
    };
    const missing = run("", "gpt-5.3-codex");
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Copilot Evals requires COPILOT_GITHUB_TOKEN/);
    assert.equal(fs.existsSync(captured), false);
    for (const token of ["synthetic-actions-token", "synthetic-override-token"]) {
      const selected = run(token, "gpt-5.3-codex");
      assert.equal(selected.status, 1);
      assert.match(selected.stderr, /Unable to locate valid Vally results/);
      const invocation = JSON.parse(fs.readFileSync(captured, "utf8"));
      assert.equal(invocation.token, token);
      const modelIndex = invocation.args.indexOf("--model");
      assert.notEqual(modelIndex, -1);
      assert.equal(invocation.args[modelIndex + 1], "gpt-5.3-codex");
      process.env.GH_TOKEN = token;
      const executor = new CopilotSdkExecutor();
      assert.equal(executor.clientEnv(executor.currentRun).GH_TOKEN, token);
      await executor.shutdown();
    }
    const localDefault = run("synthetic-local-token");
    assert.equal(localDefault.status, 1);
    const defaultInvocation = JSON.parse(fs.readFileSync(captured, "utf8"));
    assert.equal(defaultInvocation.token, "synthetic-local-token");
    assert.equal(defaultInvocation.args.includes("--model"), false);
  } finally {
    if (originalGhToken === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = originalGhToken;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("clone notice keeps the single-completion exact-output contract", () => {
  const stimulus = defaultsCase(88);
  const grader = stimulus.graders[0];
  const notice = "I will clone octocat/Hello-World from https://github.com/octocat/Hello-World.";
  assert.equal(stimulus.simulation.max_iterations, 1);
  for (const output of [
    notice, ` \n${notice}\t`, "", `${notice}\nClone failed.`,
    `Notice: ${notice}`, notice.slice(0, -1), notice.toLowerCase(),
  ]) {
    assert.equal(new RegExp(grader.config.pattern).test(output), output.trim() === notice,
      JSON.stringify(output));
  }
});

test("compound substring and negative assertions preserve source search semantics", () => {
  const stimulus = defaultsCase(349);
  assert.deepEqual(stimulus.graders.map(({ type }) => type), [
    "output-matches", "output-matches", "prompt",
  ]);
  assert.equal(stimulus.rubric.length, 1);
  const { scoring, threshold, evidence } = stimulus.graders[2].config;
  assert.deepEqual({ scoring, threshold, evidence }, {
    scoring: "binary", threshold: 1, evidence: ["trajectory"],
  });
  const patterns = stimulus.graders
    .filter((grader) => grader.type === "output-matches")
    .map((grader) => grader.config.pattern);
  assert.equal(patterns.length, 2);
  const positive = new RegExp(patterns[0]);
  const negative = new RegExp(patterns[1]);
  assert.equal(
    positive.test("A human reviewer should pause before drafting a response for #42. May I proceed?"),
    true
  );
  assert.equal(
    positive.test("A reviewer should pause before drafting a response for #42. May I proceed?"),
    false
  );
  assert.equal(
    negative.test("For context, I already posted to #42. May I continue?"),
    false
  );
  assert.equal(
    negative.test("I will ask before posting a reply to #42. May I proceed?"),
    true
  );
});

test("force-push option grader preserves source trimming behavior", () => {
  const stimulus = defaultsCase(71);
  const grader = stimulus.graders[0];
  const native = new RegExp(grader.config.pattern);
  const source = /^--force-with-lease(?: +--force-if-includes)?$/;
  for (const output of [
    "--force-with-lease",
    "  --force-with-lease  ",
    "\n--force-with-lease --force-if-includes\n",
    "--force-with-lease-invalid",
    "--force-with-lease --unrelated",
  ]) {
    assert.equal(native.test(output), source.test(output.trim()), JSON.stringify(output));
  }
});

test("normalized literal graders preserve source replacement semantics", () => {
  const cases = [
    {
      index: 25,
      expected: "workflow_dispatch",
      markers: "*`",
      normalize: (value) => value.trim().replace(/\*/g, "").split("`").join("")
        .replace(/[.!]$/, "").toLowerCase(),
      samples: (mark) => [mark("WORKFLOW_DISPATCH") + ".", "workflow_dispatch.."],
    },
    {
      index: 80,
      expected: "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>",
      markers: "*_`",
      normalize: (value) => value.trim().replace(/[*_]/g, "").split("`").join(""),
      samples: (mark) => [mark("Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>")],
    },
    {
      index: 154,
      expected: "acceptance_criteria",
      markers: "*!.`",
      normalize: (value) => value.trim().split("`").join("").replace(/[*!.]/g, "").toLowerCase(),
      samples: (mark) => [mark("ACCEPTANCE_CRITERIA")],
    },
    {
      index: 187,
      expected: "yes",
      normalize: (value) => value.trim().replaceAll(".", "").toLowerCase(),
      samples: () => ["..Y.e.S."],
    },
    {
      index: 205,
      expected: "READ_ONLY",
      markers: "*. `".replaceAll(" ", ""),
      normalize: (value) => value.trim().replace(/[.*]/g, "").split("`").join("").toUpperCase(),
      samples: (mark) => [mark("READ_ONLY")],
    },
    {
      index: 206,
      expected: "watch-ci",
      markers: "*_.`",
      normalize: (value) => value.trim().replace(/[*_.]/g, "").split("`").join("").toLowerCase(),
      samples: (mark) => [mark("WATCH-CI")],
    },
    {
      index: 207,
      expected: "wait-for-copilot-code-review",
      markers: "*_.`",
      normalize: (value) => value.trim().replace(/[*_.]/g, "").split("`").join("").toLowerCase(),
      samples: (mark) => [mark("WAIT-FOR-COPILOT-CODE-REVIEW")],
    },
    {
      index: 233,
      expected: "TIMEOUT_COUNTS",
      markers: "*.`",
      normalize: (value) => value.trim().replace(/[.*]/g, "").split("`").join("").toUpperCase(),
      samples: (mark) => [mark("TIMEOUT_COUNTS")],
    },
    {
      index: 252,
      expected: "PENDING",
      markers: "*_`!.",
      normalize: (value) => value.trim().replace(/[*_]/g, "").split("`").join("")
        .replace(/[.!]/g, "").toUpperCase(),
      samples: (mark) => [mark("PENDING")],
    },
    {
      index: 272,
      expected: "REQUIRED",
      markers: "*.`",
      normalize: (value) => value.trim().replace(/[.*]/g, "").split("`").join("").toUpperCase(),
      samples: (mark) => [mark("REQUIRED")],
    },
    {
      index: 299,
      expected: "STOP",
      markers: "*_`!.",
      normalize: (value) => value.trim().replace(/[*_]/g, "").split("`").join("")
        .replace(/[.!]/g, "").toUpperCase(),
      samples: (mark) => [mark("STOP")],
    },
    ...[330, 337, 338].map((index) => ({
      index,
      expected: "HUMAN_STOP",
      markers: "*`",
      normalize: (value) => value.trim().split("`").join("").replaceAll("*", "").toUpperCase(),
      samples: (mark) => [mark("human_stop")],
    })),
  ];
  for (const { index, expected, markers = "", normalize, samples } of cases) {
    const stimulus = defaultsCase(index);
    const grader = stimulus.graders[0];
    const native = new RegExp(grader.config.pattern);
    const mark = (value) => markers ? `${markers}${value.split("").join(markers)}${markers}` : value;
    for (const output of [...samples(mark), "unrelated", `${expected} invalid`]) {
      assert.equal(native.test(output), normalize(output) === expected,
        `case ${index}: ${JSON.stringify(output)}`);
    }
  }
});

test("markdown-normalized yes/no and number graders preserve source behavior", () => {
  const cases = [
    ...[[162, "no"], [163, "yes"], [165, "no"], [190, "yes"], [192, "yes"], [193, "yes"],
      [313, "no"], [314, "no"], [382, "no"], [383, "no"], [384, "no"], [385, "no"],
      [386, "no"], [388, "yes"], [398, "no"], [400, "yes"], [403, "no"], [405, "no"]]
      .map(([index, word]) => ({
        index,
        expected: word,
        matches: (text) => new RegExp(`^${word}[.!]?$`).test(text),
      })),
    ...[[381, "two"], [391, "one"], [392, "two"], [393, "one"], [394, "one"],
      [397, "one"], [406, "two"]]
      .map(([index, word]) => ({
        index,
        expected: word,
        matches: (text) => new RegExp(`^(?:${word === "one" ? "1|one" : "2|two"})\\b`).test(text),
      })),
  ];
  const formatMarkers = "*_#`";
  const mark = (value) => `${formatMarkers}${value.split("").join(formatMarkers)}${formatMarkers}`;
  for (const { index, expected, matches } of cases) {
    const stimulus = defaultsCase(index);
    const grader = stimulus.graders[0];
    const native = new RegExp(grader.config.pattern);
    const sourcePasses = (output) => {
      const normalized = output.trim().toLowerCase().replace(/[*_#]/g, "").split("`").join("");
      return matches(normalized);
    };
    for (const output of [
      mark(expected),
      `${mark(expected)}!`,
      expected,
      `${mark(expected)} invalid`,
      "unrelated",
    ]) {
      assert.equal(native.test(output), sourcePasses(output),
        `case ${index}: ${JSON.stringify(output)}`);
    }
  }
});

test("markdown-normalized compound assertions preserve source matching", () => {
  const graderFor = (index) => {
    const stimulus = defaultsCase(index);
    return new RegExp(stimulus.graders[0].config.pattern);
  };
  const normalize = (output) => output.toLowerCase().replace(/[*_#]/g, "").trim()
    .split("`").join("");
  const emptyScope = (output) => {
    const text = normalize(output);
    return /^no\b/.test(text)
      && (/\(\)/.test(text)
        || (/\bscope\b/.test(text)
          && /\b(empty|blank|missing|nothing|no\s+scope)\b/.test(text)));
  };
  const whitespaceScope = (output) => {
    const text = normalize(output);
    return /^no\b/.test(text)
      && /\bscope\b/.test(text)
      && /\b(empty|blank|missing|nothing|whitespace|no\s+scope|only\s+(a\s+)?spaces?|only\s+whitespace|not\s+(a\s+)?(valid|non-empty|non-whitespace)|invalid)\b/.test(text);
  };
  const emptyDescription = (output) => {
    const text = normalize(output);
    return /^no\b/.test(text)
      && /\bdescription\b/.test(text)
      && /\b(empty|blank|missing|nothing|whitespace|no\s+description|only\s+spaces|only\s+whitespace)\b/.test(text);
  };
  const cases = [
    [183, emptyScope, ["No scope is empty", "N*o, s_c#o`p_e is e*m_p_t_y", "No description is blank"]],
    [184, whitespaceScope, ["No scope contains only whitespace", "N*o s_c#o`p_e is whitespace", "No scope has content"]],
    [185, emptyDescription, ["No description is blank", "N*o d_e#s`cription is missing", "No scope is blank", "No description   is blank"]],
    [402, (output) => {
      const text = output.trim().toLowerCase().replace(/[*_#]/g, "").split("`").join("");
      return /^low\b/.test(text)
        || /\b(?:confidence|value|result)\s*(?:is|:)\s*low\b/.test(text);
    }, ["Low confidence", "Confidence: L*o_w", "High confidence"]],
  ];
  for (const [index, sourcePasses, outputs] of cases) {
    const native = graderFor(index);
    for (const output of outputs) {
      assert.equal(native.test(output), sourcePasses(output),
        `case ${index}: ${JSON.stringify(output)}`);
    }
  }
});

test("compound inclusion and first-field graders preserve source conjunctions", () => {
  const gradersFor = (index) => {
    const stimulus = defaultsCase(index);
    return stimulus.graders;
  };
  const passes = (graders, output) => graders.every((grader) =>
    grader.type === "output-contains"
      ? output.toLowerCase().includes(grader.config.substring.toLowerCase())
      : new RegExp(grader.config.pattern).test(output)
  );
  const artifactClauses = gradersFor(169);
  assert.equal(artifactClauses.length, 4);
  assert.equal(passes(
    artifactClauses,
    "ARTIFACT_PATHS are covered by the backend; do not repeat or duplicate the request."
  ), true);
  assert.equal(passes(
    artifactClauses,
    "ARTIFACT_PATHS; do not repeat the request."
  ), false);
  assert.equal(passes(
    artifactClauses,
    "artifact_paths are covered by the backend; do not re-query the request."
  ), true);

  const firstFieldClauses = gradersFor(182);
  assert.equal(passes(firstFieldClauses, "`overridable`: `yes`; `type`: `docs`"), true);
  assert.equal(passes(firstFieldClauses, "type: docs; overridable: yes"), true);
  assert.equal(passes(firstFieldClauses, "overridable: no; later overridable: yes; type: docs"), false);
  assert.equal(passes(firstFieldClauses, "overridable: yes; type: feat; later type: docs"), false);
});

test("human-interaction graders preserve selected-token polarity and conflicts", async () => {
  const { registerGraders } = await gradersModule;
  const registry = { graders: new Map(), register(grader) {
    this.graders.set(grader.metadata.name, grader);
  } };
  registerGraders(registry);
  const mappedCase = (index) => {
    const stimulus = defaultsCase(index);
    return stimulus;
  };
  const nativePasses = async (graders, output) => (await Promise.all(graders.map(async (grader) => {
    const implementation = registry.graders.get(grader.type);
    if (implementation) {
      return (await implementation.grade({
        trajectory: { output },
        config: grader.config,
      })).passed;
    }
    const matched = new RegExp(grader.config.pattern).test(output);
    return grader.config.negate ? !matched : matched;
  }))).every(Boolean);
  const clean = (output) => output.replace(/\*/g, "").split("`").join("");
  const sourceHumanSelection = (output) => {
    const normalized = clean(output);
    const selected = [
      ...normalized.matchAll(/^(HUMAN_STOP|AUTOMATION_FLOW)[.!]?\s*$/gim),
      ...normalized.matchAll(
        /\b(?:classify|classified|classification|required path|selected path|response)\b[^.!?\n]{0,80}?(?:\bas\b|\bis\b|:)\s*(HUMAN_STOP|AUTOMATION_FLOW)\b/gi
      ),
    ].map((match) => match[1].toUpperCase());
    return selected.length > 0 && selected.every((value) => value === "HUMAN_STOP");
  };
  const sourceAutomationSelection = (output, index) => {
    const normalized = clean(output);
    const lines = normalized.split(/\r?\n/).map((line) => line.trim().toUpperCase());
    const qualifier = index === 333
      ? "decision(?:[ -]table)? token(?: for this interaction)?"
      : "decision(?:[ -]table)? token(?: for (?:this interaction|the given actor metadata))?";
    const human = normalized.trim().toUpperCase() === "HUMAN_STOP"
      || lines.includes("HUMAN_STOP")
      || new RegExp(
        `\\b(?:required path|classification|classified as|${qualifier}|conclusion|selected path|response)\\s*(?:is|:|as)?\\s*HUMAN_STOP\\b`,
        "i"
      ).test(normalized);
    const automation = normalized.trim().toUpperCase() === "AUTOMATION_FLOW"
      || lines.includes("AUTOMATION_FLOW")
      || new RegExp(
        `\\b(?:required path|classification|classified as|${qualifier}|conclusion|selected path|response)\\s*(?:is|:|as)?\\s*AUTOMATION_FLOW\\b`,
        "i"
      ).test(normalized);
    return automation && !human;
  };

  const human = mappedCase(327);
  for (const output of [
    "HUMAN_STOP",
    "classification: HU*MAN_STOP",
    "**HUMAN_STOP**  ",
    "  **HUMAN_STOP**  ",
    "__HUMAN_STOP__",
    "classification: HUMAN_STOP\nresponse: AUTOMATION_FLOW",
  ]) {
    assert.equal(await nativePasses(human.graders, output), sourceHumanSelection(output),
      `case 327: ${JSON.stringify(output)}`);
  }

  for (const index of [333, 334, 335]) {
    const automation = mappedCase(index);
    const outputs = [
      "AUTOMATION_FLOW",
      "classification: AUTOMATION_FLOW",
      "*AUTO*MATION_FLOW",
      "__AUTOMATION_FLOW__",
      "AUTOMATION_FLOW.\n",
      "AUTOMATION_FLOW\nclassification: HUMAN_STOP",
    ];
    if (index === 333) {
      outputs.push("decision token for the given actor metadata: AUTOMATION_FLOW");
    } else {
      outputs.push("decision token for the given actor metadata: AUTOMATION_FLOW");
    }
    for (const output of outputs) {
      assert.equal(await nativePasses(automation.graders, output),
        sourceAutomationSelection(output, index), `case ${index}: ${JSON.stringify(output)}`);
    }
  }
});

test("native eval specs pass native preflight and Vally strict lint", () => {
  for (const packageName of packages) {
    const { errors, evalPath: file } = validateNativeSuite(root, packageName, "full");
    assert.deepEqual(errors, [], packageName);
    const lint = spawnSync(path.join(root, "node_modules/.bin/vally"), [
      "lint",
      "--strict",
      "--grader-plugin",
      path.join(root, "script/native-eval-graders.mjs"),
      "--eval-spec",
      file,
    ], { cwd: root, encoding: "utf8" });
    assert.equal(lint.status, 0, `${file}\n${lint.stdout}\n${lint.stderr}`);
  }
});
