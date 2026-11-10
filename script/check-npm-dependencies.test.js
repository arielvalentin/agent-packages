const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const yaml = require("js-yaml");
const { sourceInstructionContent } = require("./validate-native-evals.js");
const gradersModule = import("./native-eval-graders.mjs");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const map = JSON.parse(fs.readFileSync(
  path.join(root, "docs/evaluations-migration-map.json"),
  "utf8"
));
const SOURCE_SNAPSHOT_DIGESTS = {
  "agent-defaults": {
    raw: "a60ba448d98ae3f150d6919e2e4eff5408ca4beed014b40a0f8fba2566a303ee",
    base: "e30aefef9f8cce4adc475808e3213e4da90433460e7d01fa448829398a6b6726",
    canonical: "01ea3e05d0a7087a4e04c0c4d1460c71a1be05d4b7aa025d4d0e62ed70a85e45",
  },
  coordinator: {
    raw: "1d6e7d7ed0c74c39dfd878b955a33e1d274e2c62a747b5e41bf935f19ac4f204",
    base: "1d6e7d7ed0c74c39dfd878b955a33e1d274e2c62a747b5e41bf935f19ac4f204",
    canonical: "274cd942cf5d48603dda26ce245be9d250512a6b0b2d772a199a52a96ba8f264",
  },
  "development-workflow": {
    raw: "43b2329d1273b378a5db91536cd1f24d874af39f1fea9441edceae7fbf9dd446",
    base: "43b2329d1273b378a5db91536cd1f24d874af39f1fea9441edceae7fbf9dd446",
    canonical: "ecf6b33788032dbc6ef4bee9066f9b8226c0df78a002107b5eb580596c9650f4",
  },
  "code-reviewers": {
    raw: "7428553f4bbbe3f4d1658e3a5a77db8a881de9004dc8660c59712598eb0f698a",
    base: "7428553f4bbbe3f4d1658e3a5a77db8a881de9004dc8660c59712598eb0f698a",
    canonical: "dc8136aa3cae86d2d300dde1599499841a76728f87dbab9706372d3a1adebceb",
  },
};

test("native evaluation dependencies are pinned and Promptfoo/Ollama are absent", () => {
  assert.equal(manifest.devDependencies["@microsoft/vally-cli"], "0.19.0");
  assert.equal(typeof manifest.devDependencies["js-yaml"], "string");
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
  const action = yaml.load(fs.readFileSync(
    path.join(root, ".github/actions/eval-package/action.yml"),
    "utf8"
  ));
  const runStep = action.runs.steps.find((step) => step.name === "Run native evaluation");
  assert.equal(runStep.env.GH_TOKEN, "${{ inputs.copilot-token }}");
  for (const step of action.runs.steps) {
    if (step === runStep) continue;
    assert.equal(step.env?.GH_TOKEN, undefined, step.name);
  }
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
    assert.deepEqual(Object.keys(workflow.on), ["push", "pull_request", "workflow_dispatch"], workflowName);
    assert.equal(
      workflow.jobs.eval.if,
      "github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')",
      workflowName
    );
    for (const trigger of ["push", "pull_request"]) {
      assert.deepEqual(workflow.on[trigger].branches, ["main"], `${workflowName} ${trigger}`);
      assert.ok(workflow.on[trigger].paths.includes("script/native-eval-graders.mjs"));
      assert.ok(workflow.on[trigger].paths.includes("script/native-eval-graders.test.js"));
      assert.ok(workflow.on[trigger].paths.includes("script/validate-native-evals.js"));
    }
    assert.deepEqual(
      workflow.on.workflow_dispatch.inputs.suite.options,
      ["smoke", "full"],
      `${workflowName} dispatch suites`
    );
    const evalStep = workflow.jobs.eval.steps.find((step) =>
      step.uses === "./.github/actions/eval-package"
    );
    assert.equal(evalStep.with["copilot-token"], "${{ secrets.COPILOT_GITHUB_TOKEN }}");
    assert.equal(evalStep.with.suite, "${{ inputs.suite || 'smoke' }}");
    assert.equal(workflow.jobs.eval.env?.GH_TOKEN, undefined, workflowName);
  }
  const ci = yaml.load(fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8"));
  assert.ok(ci.on.pull_request, "pull requests retain credential-free structural validation");
  assert.ok(ci.jobs.validate.steps.some((step) =>
    step.run === "npm run test:dependencies"
  ));
});

test("migration map identifies and hashes its pre-migration source snapshots", () => {
  assert.equal(map.sourceSnapshotKind, "pre-migration working tree");
  assert.match(map.sourceSnapshotNote, /common base/);
  for (const [packageName, suite] of Object.entries(map.suites)) {
    const expected = SOURCE_SNAPSHOT_DIGESTS[packageName];
    assert.ok(expected, `missing pinned source digest for ${packageName}`);
    assert.equal(suite.sourceConfigSha256, expected.raw, packageName);
    assert.equal(suite.sourceBaseConfigSha256, expected.base, packageName);
    assert.equal(suite.sourceConfigurationCanonicalSha256, expected.canonical, packageName);
    const snapshotHash = crypto.createHash("sha256")
      .update(JSON.stringify(suite.sourceConfiguration))
      .digest("hex");
    assert.equal(snapshotHash, suite.sourceConfigurationCanonicalSha256, packageName);
    assert.match(suite.sourceConfigSha256, /^[0-9a-f]{64}$/, packageName);
    assert.match(suite.sourceBaseConfigSha256, /^[0-9a-f]{64}$/, packageName);
    if (packageName === "agent-defaults") {
      assert.notEqual(suite.sourceConfigSha256, suite.sourceBaseConfigSha256);
    } else {
      assert.equal(suite.sourceConfigSha256, suite.sourceBaseConfigSha256, packageName);
    }
  }
});

test("every migration row expands from its pinned source test and assertions", () => {
  const promptIdentity = (source, promptRef) => {
    const prompts = source.prompts || [];
    const prompt = typeof promptRef === "string"
      ? prompts.find((candidate) => candidate?.id === promptRef)
        || prompts[Number(promptRef.match(/^prompt-(\d+)$/)?.[1]) - 1]
        || (prompts.includes(promptRef) ? promptRef : undefined)
      : promptRef;
    const index = prompts.indexOf(prompt);
    return prompt?.id || `prompt-${index + 1}`;
  };
  const providerLabel = (source, providerRef) => {
    const provider = typeof providerRef === "string"
      ? source.providers?.find((candidate) => candidate.id === providerRef)
      : providerRef;
    return provider?.label || provider?.id || providerRef;
  };

  for (const [packageName, suite] of Object.entries(map.suites)) {
    const source = suite.sourceConfiguration;
    const entries = map.cases.filter((entry) => entry.package === packageName);
    const rowsByCase = new Map();
    for (const entry of entries) {
      const rows = rowsByCase.get(entry.sourceCaseIndex) || [];
      rows.push(entry);
      rowsByCase.set(entry.sourceCaseIndex, rows);
    }

    let expandedCount = 0;
    let smokeCount = 0;
    for (const [index, sourceCase] of source.tests.entries()) {
      const caseNumber = index + 1;
      const caseEntries = rowsByCase.get(caseNumber) || [];
      const providerRefs = sourceCase.providers || source.defaultTest?.providers || source.providers;
      const promptRefs = sourceCase.prompts || source.defaultTest?.prompts || source.prompts;
      const mergedVariables = {
        ...(source.defaultTest?.vars || {}),
        ...(sourceCase.vars || {}),
      };
      const arraySizes = Object.values(mergedVariables)
        .filter(Array.isArray)
        .map((values) => values.length);
      const expectedRows = providerRefs.length * promptRefs.length
        * arraySizes.reduce((product, size) => product * size, 1);
      expandedCount += expectedRows;
      const expectedSuite = sourceCase.metadata?.suite === "smoke" ? "smoke" : "full";
      if (expectedSuite === "smoke") smokeCount += expectedRows;
      assert.equal(caseEntries.length, expectedRows, `${packageName} source case ${caseNumber}`);
      assert.deepEqual(
        caseEntries.map((entry) => entry.sourceSuite),
        Array(expectedRows).fill(expectedSuite),
        `${packageName} source suite ${caseNumber}`
      );
      assert.deepEqual(
        caseEntries.map((entry) => entry.sourceDescription),
        Array(expectedRows).fill(sourceCase.description),
        `${packageName} source description ${caseNumber}`
      );
      assert.deepEqual(
        caseEntries.map((entry) => entry.assertions.map((row) => row.assertion)),
        Array(expectedRows).fill(sourceCase.assert || []),
        `${packageName} source assertions ${caseNumber}`
      );
      assert.deepEqual(
        caseEntries.map((entry) => Number(entry.sourceRow)).sort((a, b) => a - b),
        Array.from({ length: expectedRows }, (_, row) => row + 1),
        `${packageName} source row identities ${caseNumber}`
      );
      let variableRows = [{}];
      for (const [key, value] of Object.entries(mergedVariables)) {
        const values = Array.isArray(value) ? value : [value];
        variableRows = variableRows.flatMap((row) =>
          values.map((item) => ({ ...row, [key]: item }))
        );
      }
      const expectedExpansion = providerRefs.flatMap((providerRef) =>
        promptRefs.flatMap((promptRef) => variableRows.map((variables) => ({
          sourceProviderLabel: providerLabel(source, providerRef),
          sourcePrompt: promptIdentity(source, promptRef, promptRefs),
          sourceVariables: variables,
        })))
      );
      assert.deepEqual(
        caseEntries
          .sort((left, right) => Number(left.sourceRow) - Number(right.sourceRow)
            || left.sourceProviderLabel.localeCompare(right.sourceProviderLabel))
          .map(({ sourceProviderLabel, sourcePrompt, sourceVariables }) => ({
            sourceProviderLabel,
            sourcePrompt,
            sourceVariables,
          })),
        expectedExpansion,
        `${packageName} source case ${caseNumber} expanded provider, prompt, and variables`
      );
    }
    assert.equal(expandedCount, suite.sourceExpandedRowCount, packageName);
    assert.equal(smokeCount, suite.sourceSmokeRowCount, packageName);
    assert.equal(rowsByCase.size, source.tests.length, `${packageName} source case coverage`);
  }
});
test("every source row appears exactly once in the old-to-native migration map", () => {
  for (const [packageName, suite] of Object.entries(map.suites)) {
    const cases = map.cases.filter((entry) => entry.package === packageName);
    assert.equal(cases.length, suite.sourceExpandedRowCount, packageName);
    for (const status of ["mapped", "unsupported", "unmapped"]) {
      const count = cases.filter((entry) => entry.status === status).length;
      assert.equal(suite[`${status}RowCount`], count, `${packageName} ${status} row count`);
    }
    const identities = cases.map((entry) => [
      entry.sourceCaseIndex,
      entry.sourceRow,
      entry.sourceProviderLabel,
      entry.sourcePrompt,
    ].join(":"));
    assert.equal(new Set(identities).size, cases.length, `${packageName} duplicate source identity`);
    assert.ok(cases.every((entry) => ["mapped", "unsupported", "unmapped"].includes(entry.status)));
  }
});

test("mapped instructions, skills, and diagnostics preserve their source context", () => {
  for (const [packageName, suite] of Object.entries(map.suites)) {
    const spec = yaml.load(fs.readFileSync(path.join(root, suite.evalFile), "utf8"));
    for (const entry of map.cases.filter((item) =>
      item.package === packageName && item.status === "mapped"
    )) {
      const variables = entry.sourceVariables || {};
      const sourcePrompt = suite.sourceConfiguration.prompts.find((prompt) =>
        prompt?.id === entry.sourcePrompt
      ) || (/^prompt-\d+$/.test(entry.sourcePrompt || "")
        ? suite.sourceConfiguration.prompts[Number(entry.sourcePrompt.slice(7)) - 1]
        : undefined);
      const sourcePromptTemplate = typeof sourcePrompt === "string"
        ? sourcePrompt
        : sourcePrompt?.raw || "";
      const activeVariables = [
        "skill_content",
        ...["companion_content", "review_mode_content"]
          .filter((name) => sourcePromptTemplate.includes(name)),
      ];
      const activeInputs = activeVariables
        .map((key) => ({ key, value: variables[key] }))
        .filter(({ value }) => typeof value === "string" && value.startsWith("file://"));
      const active = activeInputs.map(({ value }) => value);
      const rootProfiles = active.filter((value) =>
        /\.apm\/agents\/[^/]+\.agent\.md$/.test(value)
      );
      if (rootProfiles.length) {
        assert.equal(entry.coverageKind, "root-policy-behavior", entry.sourceDescription);
      }
      const expectedSkills = [];
      assert.deepEqual(entry.requiredSkills || [], expectedSkills, entry.sourceDescription);

      const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
      assert.ok(stimulus, entry.sourceDescription);
      assert.equal((stimulus.graders || [])
        .filter((grader) => grader.type === "skill-invocation").length, 0,
      `${entry.sourceDescription}: Promptfoo asserted output, not skill activation`);
      if (rootProfiles.length) {
        assert.equal(stimulus.tags?.coverage, "root-policy-behavior", entry.sourceDescription);
        assert.ok(!stimulus.graders.some((grader) => grader.scope === "subagent"),
          entry.sourceDescription);
      }
      for (const expected of entry.assertionGraders || []) {
        const grader = stimulus.graders.find((item) => item.name === expected.name);
        assert.ok(grader, `${entry.sourceDescription}: missing assertion grader ${expected.name}`);
        const { name, ...configuration } = grader;
        const digest = crypto.createHash("sha256")
          .update(JSON.stringify(configuration))
          .digest("hex");
        assert.equal(expected.configSha256, digest, `${entry.sourceDescription}: grader ${name}`);
      }
      assert.equal(stimulus.simulation?.tool_overrides?.bash?.is_error, true,
        `${entry.sourceDescription} must not execute shell commands`);
      let policySources = activeInputs.filter(({ key, value }) =>
        /\.apm\/agents\/[^/]+\.agent\.md$/.test(value)
        || /\/references\/[^/]+\.md$/.test(value)
        || /\.apm\/instructions\/[^/]+\.instructions\.md$/.test(value)
        || /\.apm\/skills\/[^/]+\/SKILL\.md$/.test(value)
      ).map(({ value }) => value.replace(/^file:\/\//, ""));
      if (variables.skill_content?.endsWith("/pr-lifecycle/SKILL.md")) {
        policySources = [
          ...policySources,
          ...[
            "lifecycle_readiness_content",
            "lifecycle_feedback_content",
            "lifecycle_cleanup_content",
          ].map((key) => variables[key].replace(/^file:\/\//, "")),
        ];
      }
      const stagedPolicyFiles = (stimulus.agent_environment?.files || [])
        .filter((file) => file.dest === ".github/copilot-instructions.md"
          || file.dest === "AGENTS.md");
      if (entry.nativeContextFixture) {
        const fixturePath = path.resolve(path.dirname(path.join(root, suite.evalFile)),
          entry.nativeContextFixture);
        assert.deepEqual(stagedPolicyFiles, [{
          src: entry.nativeContextFixture,
          dest: ".github/copilot-instructions.md",
        }], entry.sourceDescription);
        assert.equal(
          fs.readFileSync(fixturePath, "utf8"),
          sourceInstructionContent(
            root,
            path.join(root, suite.evalFile),
            entry,
            suite.sourceConfiguration
          ),
          entry.sourceDescription
        );
      } else if (policySources.length) {
        assert.ok(policySources.length <= 2, entry.sourceDescription);
        assert.deepEqual(stagedPolicyFiles, policySources.map((src, index) => ({
          src,
          dest: index === 0 ? ".github/copilot-instructions.md" : "AGENTS.md",
        })), entry.sourceDescription);
      } else {
        assert.deepEqual(stagedPolicyFiles, [], entry.sourceDescription);
      }
      if (typeof variables.skill_content === "string"
        && /\.apm\/skills\/pr-lifecycle\/SKILL\.md$/.test(variables.skill_content)) {
        assert.equal(stimulus.prompt, variables.user_input, entry.sourceDescription);
        const fixturePath = path.resolve(path.dirname(path.join(root, suite.evalFile)),
          entry.nativeContextFixture);
        const fixture = fs.readFileSync(fixturePath, "utf8");
        const referenceKeys = [
          "lifecycle_readiness_content",
          "lifecycle_feedback_content",
          "lifecycle_cleanup_content",
        ];
        let previousPosition = -1;
        for (const key of referenceKeys) {
          const source = variables[key];
          assert.ok(typeof source === "string" && source.startsWith("file://"), entry.sourceDescription);
          const sourcePath = path.resolve(
            path.dirname(suite.evalFile),
            source.replace(/^file:\/\//, "")
          );
          const reference = fs.readFileSync(sourcePath, "utf8");
          const position = fixture.lastIndexOf(reference);
          assert.ok(position > previousPosition, `${entry.sourceDescription}: missing or reordered ${key}`);
          previousPosition = position;
        }
        assert.ok(stimulus.prompt.includes(variables.user_input), entry.sourceDescription);
      }
    }
  }

  const mappedProfiles = map.cases.filter((entry) => entry.status === "mapped"
    && Object.values(entry.sourceVariables || {}).some((value) =>
      typeof value === "string" && /\.apm\/agents\/[^/]+\.agent\.md$/.test(value)
    ));
  assert.ok(mappedProfiles.length > 0);
  assert.ok(mappedProfiles.every((entry) =>
    entry.coverageKind === "root-policy-behavior"
  ));
  assert.deepEqual(map.cases.filter((entry) =>
    entry.status === "unsupported" && entry.reason?.includes("root-agent selector")
  ), []);

  const diagnostics = map.cases.filter((entry) => entry.diagnostic === true);
  assert.deepEqual(diagnostics.map((entry) => entry.sourceDescription).sort(), [
    "pr-lifecycle: keeps feedback routing read only",
    "skill-gates: policy configuration requires review",
  ]);
  assert.ok(diagnostics.every((entry) => entry.status === "mapped"));
  for (const entry of diagnostics) {
    const spec = yaml.load(fs.readFileSync(path.join(root, map.suites[entry.package].evalFile), "utf8"));
    assert.equal(spec.stimuli.find((item) => item.name === entry.targetStimulus)
      ?.tags?.diagnostic, "assertion-only");
  }
});

test("native exact-output graders preserve mapped source regex semantics", () => {
  const parseRegex = (expression) => {
    if (!expression.startsWith("/")) return null;
    let inCharacterClass = false;
    let escaped = false;
    for (let index = 1; index < expression.length; index += 1) {
      const character = expression[index];
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "[") {
        inCharacterClass = true;
      } else if (character === "]") {
        inCharacterClass = false;
      } else if (character === "/" && !inCharacterClass) {
        const flags = expression.slice(index + 1).match(/^[dgimsuvy]*/)?.[0] || "";
        return {
          body: expression.slice(1, index),
          flags,
          remainder: expression.slice(index + 1 + flags.length),
        };
      }
    }
    return null;
  };
  const escapeLiteral = (character) =>
    /[.*+?^${}()|[\]\\]/.test(character) ? `\\${character}` : character;

  const testedPatterns = new Set();
  let normalizedCount = 0;
  let customSimpleCount = 0;
  let strictCount = 0;
  const simpleRegexCalls = new Set([
    ".test(output.trim())",
    ".test(output.trim().replace(/[*_]/g, ''))",
    ".test(output.trim().replace(/[*_]/g, '').split(String.fromCharCode(96)).join(''))",
    ".test(output.trim().split(String.fromCharCode(96)).join('').replace(/[*_]/g, ''))",
    ".test(output.trim().replace(/[*_`]/g, ''))",
  ]);
  for (const [packageName, suite] of Object.entries(map.suites)) {
    const spec = yaml.load(fs.readFileSync(path.join(root, suite.evalFile), "utf8"));
    for (const entry of map.cases.filter((item) =>
      item.package === packageName && item.status === "mapped"
    )) {
      if (entry.coverageKind === "root-policy-behavior") continue;
      const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
      for (let index = 0; index < (entry.assertions || []).length; index += 1) {
        const assertion = entry.assertions[index].assertion;
        if (assertion.type !== "javascript" || typeof assertion.value !== "string") continue;
        const source = parseRegex(assertion.value);
        if (!source || !assertion.value.includes(".test(output.trim()")) continue;
        const normalized = assertion.value.includes("replace(/[*_]/g, '')")
          || assertion.value.includes("replace(/[*_`]/g, '')");
        const simple = source.body.match(
          /^\^([A-Za-z0-9-]+(?: [A-Za-z0-9-]+)*)(\[\.\!\]\?)?\$$/
        );
        if (!simple) continue;
        if (!simpleRegexCalls.has(source.remainder)) continue;
        const graderName = entry.assertionGraders[index]?.name;
        const grader = stimulus.graders.find((item) => item.name === graderName);
        if (grader?.type !== "output-matches") {
          customSimpleCount += 1;
          continue;
        }
        const word = simple[1].toLowerCase();
        const markers = "[*_\\x60]*";
        const formatted = simple[1].split("").map((character) => {
          if (/[A-Za-z]/.test(character) && source.flags.includes("i")) {
            const pair = `[${character.toLowerCase()}${character.toUpperCase()}]`;
            return normalized ? `${markers}${pair}` : pair;
          }
          const literal = escapeLiteral(character);
          return normalized ? `${markers}${literal}` : literal;
        }).join("");
        const expectedPattern = `^\\s*${formatted}${normalized ? markers : ""}`
          + `${simple[2] ? "[.!]?" : ""}${normalized ? markers : ""}\\s*$`;
        assert.equal(grader?.config?.pattern, expectedPattern, entry.sourceDescription);
        if (normalized) normalizedCount += 1;
        else strictCount += 1;
        const nativePattern = new RegExp(grader.config.pattern);
        const sourcePattern = new RegExp(source.body, source.flags);
        const sourcePasses = (output) => {
          let compared = output.trim();
          if (normalized) compared = compared.replace(/[*_`]/g, "");
          return sourcePattern.test(compared);
        };
        const sampleKey = JSON.stringify([source.body, source.flags, normalized]);
        if (testedPatterns.has(sampleKey)) continue;
        testedPatterns.add(sampleKey);
        const samples = [
          simple[1],
          simple[1].toUpperCase(),
          `${simple[1]}.`,
          `**${simple[1]}**`,
          `_${simple[1].split("").join("`*")}_`,
          ` ${simple[1]} `,
          `x${simple[1]}`,
          `${simple[1]}x`,
          `${simple[1]}?`,
          "unrelated",
          "",
        ];
        for (const output of samples) {
          assert.equal(nativePattern.test(output), sourcePasses(output),
            `${entry.sourceDescription}: ${JSON.stringify(output)}`);
        }
      }
    }
  }
  assert.equal(normalizedCount + customSimpleCount, 253);
  assert.equal(strictCount, 37);
});

test("compound substring and negative assertions preserve source search semantics", () => {
  const entry = map.cases.find((item) =>
    item.package === "agent-defaults" && item.sourceCaseIndex === 349
  );
  assert.ok(entry, "source case 349 must remain mapped");
  const spec = yaml.load(fs.readFileSync(
    path.join(root, map.suites["agent-defaults"].evalFile),
    "utf8"
  ));
  const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
  const patterns = entry.assertionGraders.map(({ name }) =>
    stimulus.graders.find((grader) => grader.name === name)?.config?.pattern
  );
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
  const entry = map.cases.find((item) =>
    item.package === "agent-defaults" && item.sourceCaseIndex === 71
  );
  const spec = yaml.load(fs.readFileSync(
    path.join(root, map.suites["agent-defaults"].evalFile),
    "utf8"
  ));
  const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
  const grader = stimulus.graders.find((item) => item.name === entry.assertionGraders[0].name);
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
  const spec = yaml.load(fs.readFileSync(
    path.join(root, map.suites["agent-defaults"].evalFile),
    "utf8"
  ));
  for (const { index, expected, markers = "", normalize, samples } of cases) {
    const entry = map.cases.find((item) =>
      item.package === "agent-defaults" && item.sourceCaseIndex === index
    );
    const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
    const grader = stimulus.graders.find((item) => item.name === entry.assertionGraders[0].name);
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
  const spec = yaml.load(fs.readFileSync(
    path.join(root, map.suites["agent-defaults"].evalFile),
    "utf8"
  ));
  for (const { index, expected, matches } of cases) {
    const entry = map.cases.find((item) =>
      item.package === "agent-defaults" && item.sourceCaseIndex === index
    );
    const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
    const grader = stimulus.graders.find((item) => item.name === entry.assertionGraders[0].name);
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
  const spec = yaml.load(fs.readFileSync(
    path.join(root, map.suites["agent-defaults"].evalFile),
    "utf8"
  ));
  const graderFor = (index) => {
    const entry = map.cases.find((item) =>
      item.package === "agent-defaults" && item.sourceCaseIndex === index
    );
    const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
    return new RegExp(stimulus.graders.find((grader) =>
      grader.name === entry.assertionGraders[0].name
    ).config.pattern);
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
  const spec = yaml.load(fs.readFileSync(
    path.join(root, map.suites["agent-defaults"].evalFile),
    "utf8"
  ));
  const gradersFor = (index) => {
    const entry = map.cases.find((item) =>
      item.package === "agent-defaults" && item.sourceCaseIndex === index
    );
    const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
    return entry.assertionGraders.map(({ name }) =>
      stimulus.graders.find((grader) => grader.name === name)
    );
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
  const spec = yaml.load(fs.readFileSync(
    path.join(root, map.suites["agent-defaults"].evalFile),
    "utf8"
  ));
  const mappedCase = (index) => {
    const entry = map.cases.find((item) =>
      item.package === "agent-defaults" && item.sourceCaseIndex === index
    );
    const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
    return {
      entry,
      graders: entry.assertionGraders.map(({ name }) =>
        stimulus.graders.find((grader) => grader.name === name)
      ),
    };
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

test("reviewed source assertions match their native graders on normalization edges", async () => {
  const { registerGraders } = await gradersModule;
  const registry = { graders: new Map(), register(grader) {
    this.graders.set(grader.metadata.name, grader);
  } };
  registerGraders(registry);
  const spec = yaml.load(fs.readFileSync(
    path.join(root, map.suites["agent-defaults"].evalFile),
    "utf8"
  ));
  const sourcePasses = (entry, output) => entry.assertions.every(({ assertion }) => {
    assert.equal(assertion.type, "javascript");
    const lastSemicolon = assertion.value.lastIndexOf(";");
    const statements = assertion.value.slice(0, lastSemicolon + 1);
    const expression = assertion.value.slice(lastSemicolon + 1).trim();
    return new Function("output", `${statements}return (${expression});`)(output);
  });
  const nativePasses = async (entry, output) => {
    const stimulus = spec.stimuli.find((item) => item.name === entry.targetStimulus);
    const graders = entry.assertionGraders.map(({ name }) =>
      stimulus.graders.find((grader) => grader.name === name)
    );
    const results = await Promise.all(graders.map(async (grader) => {
      const implementation = registry.graders.get(grader.type);
      if (implementation) {
        return (await implementation.grade({
          trajectory: { output },
          config: grader.config,
        })).passed;
      }
      const matched = new RegExp(grader.config.pattern).test(output);
      return grader.config.negate ? !matched : matched;
    }));
    return results.every(Boolean);
  };
  const cases = new Map([
    [247, ["PENDING", "**PENDING**", "`PENDING`", "PASSED"]],
    [183, [" **No, the scope is empty.", "No, the scope is **empty**."]],
    [184, [" **No, the scope contains only whitespace.", "No, the scope is **blank**."]],
    [185, [" **No, the description contains only whitespace.", "No, the description is **blank**."]],
    [186, [" **No, a scope is not required by default.", "No, a scope is **optional** by default."]],
    [308, ["No\n**Yes**", "**No**\n", "No, not exactly Yes"]],
    [327, ["HUMAN_STOP\nAUTOMATION_FLOW.**", "**HUMAN_STOP**", "classification: AUTOMATION_FLOW"]],
    [354, ["**No**", " No ", "Yes"]],
    [358, ["**No**", " No ", "No\n**Yes**", "Yes"]],
    [351, ["Yes, I also post the reply.", "Yes, the named fix can proceed.\n", "Yes\nNo"]],
    [309, ["Yes, supported.", "**Yes**, supported.", "Yes_", "No", "**No**", "Yes\nNo_"]],
    [310, ["No, do not split the review.", "**No**, synthesize the findings.", "No_", "Yes", "**Yes**", "No\nYes_"]],
    [311, ["Yes, deliver one review.", "**Yes**, use one evidence-backed review.", "Yes_", "No", "**No**", "Yes\nNo_"]],
    [352, [
      "WAIT",
      "WAIT, but we may post after the review.",
      "WAIT. However we can resolve it now.",
      "**WAIT**, but we **may** proceed to draft.",
      "WAIT_, but_ we may_ post_ later.",
      "WAIT, b*u*t we m_a_y p*o*s*t.",
      "WAIT, wait*but we may post.",
      "WAIT, but we will continue working independently.",
      `WAIT, but ${"x".repeat(58)} may post.`,
      `WAIT, but ${"x".repeat(59)} may post.`,
    ]],
    [353, ["No\n", "**No**\n", "Yes"]],
  ]);
  for (const [index, outputs] of cases) {
    const entries = map.cases.filter((item) =>
      item.package === "agent-defaults" && item.sourceCaseIndex === index
    );
    assert.ok(entries.length > 0, `case ${index} exists`);
    for (const entry of entries) {
      for (const output of outputs) {
        assert.equal(await nativePasses(entry, output), sourcePasses(entry, output),
          `case ${index} row ${entry.sourceRow}: ${JSON.stringify(output)}`);
      }
    }
  }
});

test("native eval specs match every mapped migration row and pass Vally strict lint", () => {
  const evalFiles = Object.values(map.suites).map((suite) => path.join(root, suite.evalFile));
  for (const [packageName, suite] of Object.entries(map.suites)) {
    const spec = yaml.load(fs.readFileSync(path.join(root, suite.evalFile), "utf8"));
    const mapped = map.cases.filter((entry) =>
      entry.package === packageName && entry.status === "mapped"
    );
    assert.equal(spec.stimuli.length, suite.nativeStimulusCount, packageName);
    assert.equal(spec.stimuli.length, mapped.length, packageName);
  }
  for (const file of evalFiles) {
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
