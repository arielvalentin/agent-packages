"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const yaml = require("js-yaml");
const {
  resolveRepositoryFile,
  sourceInstructionContent,
  validateNativeSuite,
  validateRun,
} = require("./validate-native-evals.js");

const diagnosticNames = [
  "skill-gates: policy configuration requires review",
  "pr-lifecycle: keeps feedback routing read only",
];
const packageName = "agent-defaults";
const evalFile = "packages/agent-defaults/evals/agent-defaults.eval.yaml";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-eval-validator-"));
  const names = ["diagnostic-one", "diagnostic-two", "blocking-case"];
  const sourceDescriptions = [...diagnosticNames, "blocking case"];
  const sourceConfiguration = {
    providers: [{ id: "provider", label: "provider" }],
    prompts: [{ id: "prompt-1", raw: "{{skill_content}}\\nUser: {{user_input}}" }],
    defaultTest: {
      providers: ["provider"],
      prompts: ["prompt-1"],
      vars: { skill_content: "file://../.apm/skills/test-skill/SKILL.md" },
    },
    tests: sourceDescriptions.map((description) => ({
      description,
      metadata: { suite: "smoke" },
      vars: { user_input: "Return ok." },
      assert: [{ type: "contains", value: "ok" }],
    })),
  };
  const entries = [
    ...diagnosticNames.map((sourceDescription, index) => ({
      package: packageName,
      sourceCaseIndex: index + 1,
      sourceRow: 1,
      sourceProviderLabel: "provider",
      sourcePrompt: "prompt-1",
      sourceVariables: {
        skill_content: "file://../.apm/skills/test-skill/SKILL.md",
        user_input: "Return ok.",
      },
      requiredSkills: [],
      sourceDescription,
      sourceSuite: "smoke",
      diagnostic: true,
      status: "mapped",
      targetEval: evalFile,
      targetStimulus: names[index],
      assertionGraders: [{
        name: `${names[index]}-assertion`,
        type: "output-matches",
      }],
    })),
    {
      package: packageName,
      sourceCaseIndex: 3,
      sourceRow: 1,
      sourceProviderLabel: "provider",
      sourcePrompt: "prompt-1",
      sourceVariables: {
        skill_content: "file://../.apm/skills/test-skill/SKILL.md",
        user_input: "Return ok.",
      },
      requiredSkills: [],
      sourceDescription: "blocking case",
      sourceSuite: "smoke",
      diagnostic: false,
      status: "mapped",
      targetEval: evalFile,
      targetStimulus: names[2],
      assertionGraders: [{
        name: `${names[2]}-assertion`,
        type: "output-matches",
      }],
    },
  ];
  const stimuli = entries.map((entry) => ({
    name: entry.targetStimulus,
    tags: {
      suite: "smoke",
      ...(entry.diagnostic ? { diagnostic: "assertion-only" } : {}),
    },
    simulation: {
      tool_overrides: {
        bash: { output: "Shell execution is disabled.", is_error: true },
      },
    },
    agent_environment: { files: [{
      src: "../.apm/skills/test-skill/SKILL.md",
      dest: ".github/copilot-instructions.md",
    }] },
    graders: [
      {
        type: "output-matches",
        name: entry.assertionGraders[0].name,
        config: { pattern: "ok" },
      },
    ],
    prompt: "Return ok.",
  }));
  for (const entry of entries) {
    const grader = stimuli.find((stimulus) => stimulus.name === entry.targetStimulus)
      .graders.find((item) => item.name === entry.assertionGraders[0].name);
    const { name, ...configuration } = grader;
    entry.assertionGraders[0].configSha256 = crypto.createHash("sha256")
      .update(JSON.stringify(configuration))
      .digest("hex");
  }
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, evalFile)), { recursive: true });
  const skillDirectory = path.join(root, "packages/agent-defaults/.apm/skills/test-skill");
  const sourceSkillDirectory = path.join(root, "packages/coordinator/.apm/skills/test-skill");
  fs.mkdirSync(skillDirectory, { recursive: true });
  fs.mkdirSync(sourceSkillDirectory, { recursive: true });
  fs.writeFileSync(path.join(skillDirectory, "SKILL.md"), "---\nname: test-skill\n---\n");
  fs.writeFileSync(path.join(sourceSkillDirectory, "SKILL.md"), "---\nname: test-skill\n---\n");
  fs.writeFileSync(path.join(root, "docs/evaluations-migration-map.json"), JSON.stringify({
    suites: {
      [packageName]: {
        evalFile,
        sourceConfiguration,
        sourceExpandedRowCount: entries.length,
        sourceSmokeRowCount: entries.length,
        nativeStimulusCount: entries.length,
        mappedRowCount: entries.length,
      },
    },
    cases: entries,
  }));
  fs.writeFileSync(path.join(root, evalFile), yaml.dump({
    name: "agent-defaults-behavioral",
    stimuli,
  }));
  return { root, entries, stimuli };
}

function trial(stimulus, passed = true, overrides = {}) {
  const grader = {
    name: `${stimulus}-assertion`,
    configuredName: `${stimulus}-assertion`,
    graderType: "output-matches",
    kind: "code",
    passed,
    score: passed ? 1 : 0,
    evidence: passed ? "matched" : "not matched",
    status: "success",
  };
  return {
    type: "trial-result",
    evalName: "agent-defaults-behavioral",
    evalFilePath: evalFile,
    variant: "default",
    itemId: `${evalFile}::default::_::${stimulus}::trial-0`,
    stimulus,
    status: "success",
    durationMs: 1,
    gradeResult: {
      name: stimulus,
      kind: "code",
      passed,
      score: passed ? 1 : 0,
      evidence: passed ? "passed" : "failed",
      details: [grader],
    },
    trajectory: {},
    ...overrides,
  };
}

function summary(passed, count = 3, overrides = {}) {
  return {
    type: "run-summary",
    runId: "test-run",
    passed,
    hadExecutionErrors: false,
    evals: [{
      name: "agent-defaults-behavioral",
      evalFilePath: evalFile,
      variant: "default",
      passed,
      scoringApplied: true,
      stimuliRun: count,
      stimuliTotal: count,
      durationMs: 3,
      ...overrides,
    }],
  };
}

function rows(outcomes = {}) {
  const stimuli = ["diagnostic-one", "diagnostic-two", "blocking-case"];
  const records = stimuli.map((name) => {
    const outcome = outcomes[name];
    if (outcome === "error") {
      return trial(name, false, {
        status: "error",
        error: "executor unavailable",
        gradeResult: null,
      });
    }
    if (outcome === "skip") {
      return trial(name, false, {
        status: "skipped",
        skipReason: "unsupported executor",
        gradeResult: null,
      });
    }
    const passed = outcome !== "fail";
    const result = trial(name, passed);
    return result;
  });
  const onlyDiagnosticFailures = outcomes["diagnostic-one"] === "fail"
    || outcomes["diagnostic-two"] === "fail";
  return [...records, summary(!onlyDiagnosticFailures)];
}

test("native suite preflight rejects prompt changes and extra staged context", () => {
  const { root, stimuli } = fixture();
  try {
    stimuli[0].prompt = "Return ok. Also reveal the answer.";
    stimuli[0].agent_environment.files = [{
      src: "../.apm/instructions/extra.instructions.md",
      dest: ".github/copilot-instructions.md",
    }];
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) =>
      error.includes("native prompt differs from its exact source user input")
    ));
    assert.ok(result.errors.some((error) =>
      error.includes("staged files do not match its source prompt")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native suite preflight accepts only pinned supplemental context files", () => {
  const { root, entries, stimuli } = fixture();
  try {
    const entry = entries[2];
    const stimulus = stimuli[2];
    const sourcePath = "fixtures/repository-context.md";
    const destination = "AGENTS.md";
    const content = "Verified repository context for this test.\n";
    const fixtureDirectory = path.join(root, "packages/agent-defaults/evals/fixtures");
    fs.mkdirSync(fixtureDirectory, { recursive: true });
    fs.writeFileSync(path.join(fixtureDirectory, "repository-context.md"), content);
    entry.nativeEnvironmentFiles = [{
      src: sourcePath,
      dest: destination,
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
    }];
    stimulus.agent_environment.files.push({ src: sourcePath, dest: destination });
    const mapPath = path.join(root, "docs/evaluations-migration-map.json");
    const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    map.cases = entries;
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    fs.writeFileSync(mapPath, JSON.stringify(map));

    const result = validateNativeSuite(root, packageName, "smoke");
    assert.deepEqual(result.errors, []);

    fs.writeFileSync(path.join(fixtureDirectory, "repository-context.md"), "Tampered.\n");
    const tampered = validateNativeSuite(root, packageName, "smoke");
    assert.ok(tampered.errors.some((error) =>
      error.includes("native environment file hash does not match")
    ));

    fs.writeFileSync(path.join(fixtureDirectory, "repository-context.md"), content);
    for (const invalidDestination of [
      "C:../outside",
      "C:/outside",
      "../outside",
      "safe\\..\\outside",
      "folder /outside",
      "folder./outside",
      ".GITHUB/COPILOT-INSTRUCTIONS.MD",
    ]) {
      entry.nativeEnvironmentFiles[0].dest = invalidDestination;
      stimulus.agent_environment.files.at(-1).dest = invalidDestination;
      fs.writeFileSync(mapPath, JSON.stringify(map));
      fs.writeFileSync(
        path.join(root, evalFile),
        yaml.dump({ name: "agent-defaults-behavioral", stimuli })
      );
      const invalid = validateNativeSuite(root, packageName, "smoke");
      assert.ok(invalid.errors.some((error) =>
        error.includes("invalid native environment file mapping")
      ), `expected ${invalidDestination} to be rejected`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native suite preflight rejects any source row without a faithful mapping", () => {
  const { root, entries } = fixture();
  try {
    entries[2].status = "unsupported";
    entries[2].reason = "No supported native root-agent selector.";
    fs.writeFileSync(
      path.join(root, "docs/evaluations-migration-map.json"),
      JSON.stringify({
        suites: { [packageName]: { evalFile, sourceExpandedRowCount: entries.length } },
        cases: entries,
      })
    );
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) => error.includes("without dropping 1 source row")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native suite preflight rejects inconsistent migration summary counts", () => {
  const { root } = fixture();
  try {
    const mapPath = path.join(root, "docs/evaluations-migration-map.json");
    const migrationMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    migrationMap.suites[packageName].mappedRowCount -= 1;
    fs.writeFileSync(mapPath, JSON.stringify(migrationMap));
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) =>
      error.includes("migration map mappedRowCount mismatch")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native suite preflight rejects source-row variable tampering", () => {
  const { root, entries } = fixture();
  try {
    const mapPath = path.join(root, "docs/evaluations-migration-map.json");
    const migrationMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    entries[0].sourceVariables.user_input = "Different source prompt.";
    migrationMap.cases = entries;
    fs.writeFileSync(mapPath, JSON.stringify(migrationMap));
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) =>
      error.includes("migration row differs from its pinned source expansion")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native suite preflight rejects swapped smoke and full source rows", () => {
  const { root, entries } = fixture();
  try {
    const mapPath = path.join(root, "docs/evaluations-migration-map.json");
    const migrationMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    migrationMap.suites[packageName].sourceSmokeRowCount -= 1;
    migrationMap.suites[packageName].sourceConfiguration.tests[1].metadata.suite = "full";
    entries[0].sourceSuite = "full";
    entries[1].sourceSuite = "smoke";
    migrationMap.cases = entries;
    fs.writeFileSync(mapPath, JSON.stringify(migrationMap));
    const result = validateNativeSuite(root, packageName, "full");
    assert.ok(result.errors.some((error) =>
      error.includes("source suite differs from its pinned source metadata")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("repository path resolution rejects traversal, symlinks, and non-files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-eval-paths-"));
  const file = path.join(root, "regular.md");
  const directory = path.join(root, "directory");
  const link = path.join(root, "linked.md");
  try {
    fs.writeFileSync(file, "content");
    fs.mkdirSync(directory);
    fs.symlinkSync(file, link);
    assert.equal(
      resolveRepositoryFile(root, root, "regular.md", "fixture"),
      fs.realpathSync(file)
    );
    assert.throws(
      () => resolveRepositoryFile(root, root, "../outside.md", "fixture"),
      /escapes the repository/
    );
    assert.throws(
      () => resolveRepositoryFile(root, root, "linked.md", "fixture"),
      /symbolic link/
    );
    assert.throws(
      () => resolveRepositoryFile(root, root, "directory", "fixture"),
      /not a regular file/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("combined instruction rendering preserves source context order without extra fields", () => {
  const { root } = fixture();
  try {
    const sourceDirectory = path.join(
      root,
      "packages/agent-defaults/.apm/skills/test-skill"
    );
    fs.mkdirSync(path.join(sourceDirectory, "references"), { recursive: true });
    fs.writeFileSync(path.join(sourceDirectory, "SKILL.md"), "skill");
    fs.writeFileSync(path.join(sourceDirectory, "references/companion.md"), "companion");
    fs.writeFileSync(path.join(sourceDirectory, "references/review.md"), "review");
    const entry = {
      sourcePrompt: "policy-chat",
      sourceVariables: {
        skill_content: "file://../.apm/skills/test-skill/SKILL.md",
        companion_content: "file://../.apm/skills/test-skill/references/companion.md",
        review_mode_content: "file://../.apm/skills/test-skill/references/review.md",
      },
    };
    const sourceConfiguration = {
      prompts: [{
        id: "policy-chat",
        raw: "instructions = skill_content ~ \"\\n\" ~ companion_content",
      }],
    };
    assert.equal(
      sourceInstructionContent(root, path.join(root, evalFile), entry, sourceConfiguration),
      "skill\ncompanion"
    );
    sourceConfiguration.prompts[0].raw += " ~ \"\\n\" ~ review_mode_content";
    assert.equal(
      sourceInstructionContent(root, path.join(root, evalFile), entry, sourceConfiguration),
      "skill\ncompanion\nreview"
    );
    sourceConfiguration.prompts[0].raw =
      "{{skill_content}}\n{{companion_content | default('')}}";
    assert.equal(
      sourceInstructionContent(root, path.join(root, evalFile), entry, sourceConfiguration),
      "skill\ncompanion"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("combined instruction rendering trims only trailing blank lines", () => {
  const { root } = fixture();
  try {
    const sourceDirectory = path.join(
      root,
      "packages/agent-defaults/.apm/skills/test-skill"
    );
    fs.mkdirSync(path.join(sourceDirectory, "references"), { recursive: true });
    fs.writeFileSync(path.join(sourceDirectory, "SKILL.md"), "skill\n\n");
    fs.writeFileSync(path.join(sourceDirectory, "references/companion.md"), "companion\n\n");
    fs.writeFileSync(path.join(sourceDirectory, "references/review.md"), "review\n\n");
    const entry = {
      sourcePrompt: "policy-chat",
      sourceVariables: {
        skill_content: "file://../.apm/skills/test-skill/SKILL.md",
        companion_content: "file://../.apm/skills/test-skill/references/companion.md",
        review_mode_content: "file://../.apm/skills/test-skill/references/review.md",
      },
    };
    const sourceConfiguration = {
      prompts: [{
        id: "policy-chat",
        raw: "instructions = skill_content ~ \"\\n\" ~ companion_content ~ \"\\n\" ~ review_mode_content",
      }],
    };
    assert.equal(
      sourceInstructionContent(root, path.join(root, evalFile), entry, sourceConfiguration),
      "skill\n\n\ncompanion\n\n\nreview\n"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native suite preflight rejects stimuli that can execute shell commands", () => {
  const { root, stimuli } = fixture();
  delete stimuli[0].simulation;
  fs.writeFileSync(
    path.join(root, evalFile),
    yaml.dump({ name: "agent-defaults-behavioral", stimuli })
  );
  const result = validateNativeSuite(root, packageName, "smoke");
  assert.ok(result.errors.some((error) => error.includes("does not block shell command execution")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("native suite preflight rejects missing mapped assertion graders", () => {
  const { root, stimuli } = fixture();
  try {
    stimuli[0].graders = stimuli[0].graders.filter((grader) =>
      grader.type === "skill-invocation"
    );
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) =>
      error.includes("assertion graders do not match its migration map")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native suite preflight rejects invalid Vally grader names", () => {
  const { root, stimuli } = fixture();
  try {
    const grader = stimuli[0].graders[0];
    grader.name = `a${"a".repeat(60)}`;
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    let result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) =>
      error.includes("invalid Vally grader name") && error.includes("at most 60 characters")
    ));

    grader.name = "invalid_grader_name";
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) =>
      error.includes("invalid Vally grader name")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native suite preflight rejects changed assertion grader configuration", () => {
  const { root, stimuli } = fixture();
  try {
    stimuli[0].graders.find((grader) =>
      grader.type === "output-matches"
    ).config.pattern = ".*";
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) =>
      error.includes("assertion graders do not match its migration map")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("non-agent-defaults rows cannot opt into the diagnostic exemption", () => {
  const { root, entries } = fixture();
  try {
    entries.push({
      package: "coordinator",
      sourceDescription: diagnosticNames[0],
      sourceSuite: "smoke",
      diagnostic: true,
      status: "unsupported",
    });
    fs.writeFileSync(
      path.join(root, "docs/evaluations-migration-map.json"),
      JSON.stringify({
        suites: {
          [packageName]: {
            evalFile,
            sourceExpandedRowCount: 4,
            sourceSmokeRowCount: 4,
            nativeStimulusCount: entries.length - 1,
          },
        },
        cases: entries,
      })
    );
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) =>
      error.includes("not restricted to the two approved cases")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("same-named assertion failures in other packages remain blocking", () => {
  const { root, entries, stimuli } = fixture();
  const coordinatorEvalFile = "packages/coordinator/evals/coordinator.eval.yaml";
  try {
    const mapPath = path.join(root, "docs/evaluations-migration-map.json");
    const migrationMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    const sourceConfiguration = migrationMap.suites[packageName].sourceConfiguration;
    for (const entry of entries) {
      entry.package = "coordinator";
      entry.targetEval = coordinatorEvalFile;
      entry.diagnostic = false;
    }
    fs.mkdirSync(path.dirname(path.join(root, coordinatorEvalFile)), { recursive: true });
    const skillDirectory = path.join(root, "packages/coordinator/.apm/skills/test-skill");
    fs.mkdirSync(skillDirectory, { recursive: true });
    fs.writeFileSync(path.join(skillDirectory, "SKILL.md"), "---\nname: test-skill\n---\n");
    for (const stimulus of stimuli) {
      stimulus.agent_environment.files = [{
        src: "../.apm/skills/test-skill/SKILL.md",
        dest: ".github/copilot-instructions.md",
      }];
    }
    fs.writeFileSync(mapPath, JSON.stringify({
      suites: {
        coordinator: {
          evalFile: coordinatorEvalFile,
          sourceConfiguration,
          sourceExpandedRowCount: entries.length,
          sourceSmokeRowCount: entries.length,
          nativeStimulusCount: stimuli.length,
          mappedRowCount: entries.length,
        },
      },
      cases: entries,
    }));
    fs.writeFileSync(
      path.join(root, coordinatorEvalFile),
      yaml.dump({ name: "coordinator-behavioral", stimuli })
    );
    const records = rows({ "diagnostic-one": "fail" });
    for (const record of records) {
      if (record.type === "trial-result") {
        record.evalName = "coordinator-behavioral";
        record.evalFilePath = coordinatorEvalFile;
        record.itemId = `${coordinatorEvalFile}::default::_::${record.stimulus}::trial-0`;
      } else {
        record.evals[0].name = "coordinator-behavioral";
        record.evals[0].evalFilePath = coordinatorEvalFile;
      }
    }
    const result = validateRun(root, "coordinator", "smoke", records);
    assert.ok(result.errors.some((error) => error.includes("failed required graders")));
    assert.equal(result.diagnostics.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native skill invocation is not substituted for source-provided instruction context", () => {
  const { root, stimuli } = fixture();
  try {
    stimuli[0].agent_environment.skills = ["../.apm/skills/test-skill"];
    stimuli[0].graders.push({
      type: "skill-invocation",
      name: `${stimuli[0].name}-extra-skill`,
      config: { required: ["pr-lifecycle"] },
    });
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) => error.includes("native skills do not match")));
    assert.ok(result.errors.some((error) => error.includes("source assertions do not require skill activation")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reference files and root policy profiles use native workspace instruction paths", () => {
  const { root, entries, stimuli } = fixture();
  try {
    const mapPath = path.join(root, "docs/evaluations-migration-map.json");
    const migrationMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    const sourceConfiguration = migrationMap.suites[packageName].sourceConfiguration;
    const referencesDirectory = path.join(
      root,
      "packages/agent-defaults/.apm/skills/test-skill/references"
    );
    const agentsDirectory = path.join(root, "packages/agent-defaults/.apm/agents");
    fs.mkdirSync(referencesDirectory, { recursive: true });
    fs.mkdirSync(agentsDirectory, { recursive: true });
    fs.writeFileSync(path.join(referencesDirectory, "example.md"), "Reference instructions.\n");
    fs.writeFileSync(path.join(agentsDirectory, "example.agent.md"), "Root policy.\n");
    entries[0].sourceVariables.skill_content =
      "file://../.apm/skills/test-skill/references/example.md";
    sourceConfiguration.tests[0].vars.skill_content =
      "file://../.apm/skills/test-skill/references/example.md";
    entries[0].requiredSkills = [];
    delete stimuli[0].agent_environment.skills;
    stimuli[0].agent_environment.files = [{
      src: "../.apm/skills/test-skill/references/example.md",
      dest: ".github/copilot-instructions.md",
    }];
    stimuli[0].graders = stimuli[0].graders.filter((grader) =>
      grader.type !== "skill-invocation"
    );
    fs.writeFileSync(
      mapPath,
      JSON.stringify({
        suites: {
          [packageName]: {
            ...migrationMap.suites[packageName],
            sourceConfiguration,
          },
        },
        cases: entries,
      })
    );
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.deepEqual(result.errors, []);

    stimuli[0].agent_environment.files = [];
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    const unstagedResult = validateNativeSuite(root, packageName, "smoke");
    assert.ok(unstagedResult.errors.some((error) =>
      error.includes("staged files do not match its source prompt")
    ));

    stimuli[0].agent_environment.files = [{
      src: "../.apm/skills/test-skill/references/example.md",
      dest: ".github/copilot-instructions.md",
    }];
    entries[2].sourceVariables.skill_content =
      "file://../.apm/agents/example.agent.md";
    sourceConfiguration.tests[2].vars.skill_content =
      "file://../.apm/agents/example.agent.md";
    entries[2].requiredSkills = [];
    entries[2].coverageKind = "root-policy-behavior";
    stimuli[2].tags.coverage = "root-policy-behavior";
    delete stimuli[2].agent_environment.skills;
    stimuli[2].agent_environment.files = [{
      src: "../.apm/agents/example.agent.md",
      dest: ".github/copilot-instructions.md",
    }];
    stimuli[2].graders = stimuli[2].graders.filter((grader) =>
      grader.type !== "skill-invocation"
    );
    fs.writeFileSync(
      mapPath,
      JSON.stringify({
        suites: {
          [packageName]: {
            ...migrationMap.suites[packageName],
            sourceConfiguration,
          },
        },
        cases: entries,
      })
    );
    fs.writeFileSync(
      path.join(root, evalFile),
      yaml.dump({ name: "agent-defaults-behavioral", stimuli })
    );
    const profileResult = validateNativeSuite(root, packageName, "smoke");
    assert.deepEqual(profileResult.errors, []);

    delete entries[2].coverageKind;
    delete stimuli[2].tags.coverage;
    fs.writeFileSync(
      path.join(root, "docs/evaluations-migration-map.json"),
      JSON.stringify({
        suites: {
          [packageName]: {
            evalFile,
            sourceExpandedRowCount: entries.length,
            sourceSmokeRowCount: entries.length,
            nativeStimulusCount: entries.length,
          },
        },
        cases: entries,
      })
    );
    const unlabeledProfileResult = validateNativeSuite(root, packageName, "smoke");
    assert.ok(unlabeledProfileResult.errors.some((error) =>
      error.includes("root policy-behavior coverage metadata")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("both approved diagnostics must have native stimuli", () => {
  const { root, entries } = fixture();
  try {
    entries[0].status = "unsupported";
    entries[0].reason = "No native instruction-file loader.";
    fs.writeFileSync(
      path.join(root, "docs/evaluations-migration-map.json"),
      JSON.stringify({
        suites: {
          [packageName]: {
            evalFile,
            sourceExpandedRowCount: entries.length,
            sourceSmokeRowCount: entries.length,
            nativeStimulusCount: entries.length,
          },
        },
        cases: entries,
      })
    );
    const result = validateNativeSuite(root, packageName, "smoke");
    assert.ok(result.errors.some((error) =>
      error.includes("Both approved diagnostics require native stimuli")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("only output assertion failures from the two exact diagnostics are non-blocking", () => {
  const { root } = fixture();
  try {
    const result = validateRun(root, packageName, "smoke", rows({
      "diagnostic-one": "fail",
      "diagnostic-two": "fail",
    }));
    assert.deepEqual(result.errors, []);
    assert.equal(result.diagnostics.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("execution errors and skipped results block diagnostics", () => {
  const { root } = fixture();
  try {
    for (const [name, outcome] of [
      ["diagnostic-one", "error"],
      ["diagnostic-one", "skip"],
    ]) {
      const result = validateRun(root, packageName, "smoke", rows({ [name]: outcome }));
      assert.ok(result.errors.length > 0, `${outcome} must block`);
      assert.equal(result.diagnostics.length, 0);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("blocking case failures, missing rows, duplicates, and summary errors fail", () => {
  const { root } = fixture();
  try {
    const failed = validateRun(root, packageName, "smoke", rows({ "blocking-case": "fail" }));
    assert.ok(failed.errors.some((error) => error.includes("failed required graders")));

    const duplicate = rows();
    duplicate.splice(1, 0, { ...duplicate[0] });
    const duplicateResult = validateRun(root, packageName, "smoke", duplicate);
    assert.ok(duplicateResult.errors.some((error) => error.includes("Duplicate result")));

    const missing = rows().filter((record) => record.stimulus !== "blocking-case");
    const missingResult = validateRun(root, packageName, "smoke", missing);
    assert.ok(missingResult.errors.some((error) => error.includes("expected one result")));

    const badSummary = rows();
    badSummary.at(-1).hadExecutionErrors = true;
    const summaryResult = validateRun(root, packageName, "smoke", badSummary);
    assert.ok(summaryResult.errors.some((error) => error.includes("execution error")));

    for (const [description, mutate] of [
      ["run id", (records) => { records.at(-1).runId = "  "; }],
      ["run count", (records) => { records.at(-1).evals[0].stimuliRun = "3"; }],
      ["total count", (records) => { records.at(-1).evals[0].stimuliTotal = 4; }],
      ["duration", (records) => { records.at(-1).evals[0].durationMs = Infinity; }],
      ["identity", (records) => { records[0].variant = "other"; }],
      ["run id mismatch", (records) => { records[0].runId = "different-run"; }],
    ]) {
      const malformed = rows();
      mutate(malformed);
      const malformedResult = validateRun(root, packageName, "smoke", malformed);
      assert.ok(malformedResult.errors.length > 0, `${description} must block`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("trial item IDs must match their stimulus and one-run identity", () => {
  const { root } = fixture();
  try {
    const records = rows();
    records[0].itemId = `${evalFile}::default::_::blocking-case::trial-0`;
    const result = validateRun(root, packageName, "smoke", records);
    assert.ok(result.errors.some((error) =>
      error.includes("Vally itemId does not match its planned identity")
    ));

    records[0].itemId = `${evalFile}::default::_::diagnostic-one::trial-1`;
    const changedTrial = validateRun(root, packageName, "smoke", records);
    assert.ok(changedTrial.errors.some((error) =>
      error.includes("Vally itemId does not match its planned identity")
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
