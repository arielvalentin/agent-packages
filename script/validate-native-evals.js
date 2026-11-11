#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const yaml = require("js-yaml");

const PACKAGES = new Set([
  "agent-defaults",
  "coordinator",
  "development-workflow",
  "code-reviewers",
]);
const GRADER_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_GRADER_NAME_LENGTH = 60;
const DIAGNOSTICS = new Set([
  "skill-gates: policy configuration requires review",
  "pr-lifecycle: keeps feedback routing read only",
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readYaml(file) {
  return yaml.load(fs.readFileSync(file, "utf8"));
}

function graderConfigurationDigest(grader) {
  const { name, ...configuration } = grader;
  return crypto.createHash("sha256")
    .update(JSON.stringify(configuration))
    .digest("hex");
}

function validateNativeEnvironmentFiles(root, evalPath, entry, errors, existingDestinations = []) {
  const files = entry.nativeEnvironmentFiles === undefined
    ? []
    : entry.nativeEnvironmentFiles;
  if (!Array.isArray(files)) {
    errors.push(`${entry.sourceDescription} native environment files must be an array.`);
    return [];
  }
  const destinations = new Set(existingDestinations.map((destination) => destination.toLowerCase()));
  const validated = [];
  for (const file of files) {
    const destinationKey = typeof file?.dest === "string"
      ? file.dest.toLowerCase()
      : "";
    const destinationSegments = typeof file?.dest === "string"
      ? file.dest.split("/")
      : [];
    if (!file || typeof file !== "object" || Array.isArray(file)
      || Object.keys(file).sort().join(",") !== "dest,sha256,src"
      || typeof file.src !== "string"
      || typeof file.dest !== "string"
      || !/^[0-9a-f]{64}$/.test(file.sha256 || "")
      || path.isAbsolute(file.dest)
      || path.win32.isAbsolute(file.dest)
      || /^[a-z]:/i.test(file.dest)
      || file.dest.includes("\\")
      || destinationSegments.some((segment) => /[ .]$/.test(segment))
      || path.posix.normalize(file.dest) !== file.dest
      || file.dest === "."
      || file.dest.split("/").includes("..")
      || destinationKey === ".github/copilot-instructions.md"
      || destinations.has(destinationKey)) {
      errors.push(`${entry.sourceDescription} has an invalid native environment file mapping.`);
      continue;
    }
    destinations.add(destinationKey);
    try {
      const source = resolveRepositoryFile(
        root,
        path.dirname(evalPath),
        file.src,
        `${entry.sourceDescription} native environment file`
      );
      const digest = crypto.createHash("sha256")
        .update(fs.readFileSync(source))
        .digest("hex");
      if (digest !== file.sha256) {
        errors.push(`${entry.sourceDescription} native environment file hash does not match.`);
        continue;
      }
      validated.push({ src: file.src, dest: file.dest });
    } catch (error) {
      errors.push(`${entry.sourceDescription} native environment file is unavailable: ${error.message}`);
    }
  }
  return validated;
}

function expandSourceCase(sourceConfiguration, sourceCase) {
  const providerRefs = sourceCase.providers
    || sourceConfiguration.defaultTest?.providers
    || sourceConfiguration.providers
    || [];
  const promptRefs = sourceCase.prompts
    || sourceConfiguration.defaultTest?.prompts
    || sourceConfiguration.prompts
    || [];
  const variables = {
    ...(sourceConfiguration.defaultTest?.vars || {}),
    ...(sourceCase.vars || {}),
  };
  let variableRows = [{}];
  for (const [key, value] of Object.entries(variables)) {
    variableRows = variableRows.flatMap((row) =>
      (Array.isArray(value) ? value : [value]).map((item) => ({
        ...row,
        [key]: item,
      }))
    );
  }
  const prompts = sourceConfiguration.prompts || [];
  return providerRefs.flatMap((providerRef) => promptRefs.flatMap((promptRef) => {
    const provider = typeof providerRef === "string"
      ? sourceConfiguration.providers?.find((candidate) => candidate.id === providerRef)
      : providerRef;
    const prompt = typeof promptRef === "string"
      ? prompts.find((candidate) => candidate?.id === promptRef)
        || (/^prompt-(\d+)$/.test(promptRef)
          ? prompts[Number(promptRef.slice(7)) - 1]
        : prompts.includes(promptRef) ? promptRef : undefined)
      : promptRef;
    const promptIndex = prompts.indexOf(prompt);
    const sourcePrompt = prompt?.id || `prompt-${promptIndex + 1}`;
    return variableRows.map((sourceVariables) => ({
      sourceProviderLabel: provider?.label || provider?.id || providerRef,
      sourcePrompt,
      sourceVariables,
    }));
  }));
}

function resolveRepositoryFile(root, baseDirectory, filePath, label) {
  if (typeof filePath !== "string" || !filePath || path.isAbsolute(filePath)) {
    throw new Error(`${label} must be a non-empty repository-relative path.`);
  }
  const repositoryRoot = fs.realpathSync(root);
  const realBase = fs.realpathSync(baseDirectory);
  const baseRelative = path.relative(repositoryRoot, realBase);
  if (baseRelative.startsWith("..") || path.isAbsolute(baseRelative)) {
    throw new Error(`${label} base directory is outside the repository.`);
  }
  const target = path.resolve(realBase, filePath);
  const relative = path.relative(repositoryRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the repository.`);
  }
  let current = repositoryRoot;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic link.`);
    }
  }
  if (!fs.statSync(current).isFile()) {
    throw new Error(`${label} is not a regular file.`);
  }
  const realTarget = fs.realpathSync(current);
  const realRelative = path.relative(repositoryRoot, realTarget);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error(`${label} resolves outside the repository.`);
  }
  return realTarget;
}

function sourcePromptTemplate(entry, sourceConfiguration) {
  const prompt = sourceConfiguration?.prompts?.find((candidate) =>
    candidate?.id === entry.sourcePrompt
  ) || (/^prompt-\d+$/.test(entry.sourcePrompt || "")
    ? sourceConfiguration?.prompts?.[Number(entry.sourcePrompt.slice(7)) - 1]
    : undefined);
  return typeof prompt === "string" ? prompt : prompt?.raw || "";
}

function readSourceFile(root, evalPath, source) {
  return fs.readFileSync(resolveRepositoryFile(
    root,
    path.dirname(evalPath),
    source.replace(/^file:\/\//, ""),
    "Source instruction"
  ), "utf8");
}

function sourceInstructionContent(root, evalPath, entry, sourceConfiguration) {
  const variables = entry.sourceVariables || {};
  const template = sourcePromptTemplate(entry, sourceConfiguration);
  const readVariable = (key) => {
    const source = variables[key];
    return typeof source === "string" && source.startsWith("file://")
      ? readSourceFile(root, evalPath, source)
      : "";
  };
  let content = readVariable("skill_content");
  const contextVariables = ["companion_content", "review_mode_content"]
    .filter((variable) => template.includes(variable))
    .sort((left, right) => template.indexOf(left) - template.indexOf(right));
  for (const variable of contextVariables) {
    content += `\n${readVariable(variable)}`;
  }
  if (/\/pr-lifecycle\/SKILL\.md$/.test(variables.skill_content || "")) {
    content += `\n\n${[
      "lifecycle_readiness_content",
      "lifecycle_feedback_content",
      "lifecycle_cleanup_content",
    ].map(readVariable).join("\n\n")}`;
  }
  return content.replace(/\n{2,}$/, "\n");
}

function sourcePromptSkills(entry, sourceConfiguration) {
  const variables = entry.sourceVariables || {};
  const activeVariables = ["skill_content"];
  const promptTemplate = sourcePromptTemplate(entry, sourceConfiguration);
  for (const variable of ["companion_content", "review_mode_content"]) {
    if (promptTemplate.includes(variable)) activeVariables.push(variable);
  }
  const skills = [];
  const rootProfiles = [];
  const instructionFiles = [];
  const policyFiles = [];
  const unsupportedFiles = [];
  for (const variable of activeVariables) {
    const source = variables[variable];
    if (typeof source !== "string" || !source.startsWith("file://")) continue;
    const skillMatch = source.match(/\.apm\/skills\/([^/]+)\/SKILL\.md$/);
    if (skillMatch) {
      // Promptfoo injected SKILL.md text as context; it did not assert skill activation.
      policyFiles.push(source);
    } else if (/\.apm\/agents\/[^/]+\.agent\.md$/.test(source)) {
      rootProfiles.push(source);
      policyFiles.push(source);
    } else if (/\.apm\/skills\/.+\/references\/[^/]+\.md$/.test(source)
      || /\.apm\/instructions\/[^/]+\.instructions\.md$/.test(source)) {
      instructionFiles.push(source);
      policyFiles.push(source);
    } else {
      unsupportedFiles.push(source);
    }
  }
  if (/\/pr-lifecycle\/SKILL\.md$/.test(variables.skill_content || "")) {
    for (const key of [
      "lifecycle_readiness_content",
      "lifecycle_feedback_content",
      "lifecycle_cleanup_content",
    ]) {
      const source = variables[key];
      if (typeof source === "string" && source.startsWith("file://")) {
        policyFiles.push(source);
      }
    }
  }
  return {
    skills: [...new Set(skills)].sort(),
    rootProfiles,
    instructionFiles,
    policyFiles,
    unsupportedFiles,
  };
}

function validateNativeSuite(root, packageName, suite) {
  const errors = [];
  if (!PACKAGES.has(packageName)) errors.push(`Unknown package: ${packageName}`);
  if (!["smoke", "full"].includes(suite)) errors.push(`Unknown suite: ${suite}`);
  if (errors.length) return { errors };

  const mapPath = path.join(root, "docs/evaluations-migration-map.json");
  const map = readJson(mapPath);
  const suiteMap = map.suites?.[packageName];
  if (!suiteMap) return { errors: [`Migration map has no suite ${packageName}.`] };
  const packageEntries = map.cases.filter((entry) => entry.package === packageName);
  for (const entry of packageEntries) {
    const sourceCase = suiteMap.sourceConfiguration?.tests?.[entry.sourceCaseIndex - 1];
    if (!sourceCase) {
      errors.push(`${entry.sourceDescription} has no pinned source test case.`);
      continue;
    }
    const expectedSuite = sourceCase.metadata?.suite === "smoke" ? "smoke" : "full";
    if (entry.sourceSuite !== expectedSuite) {
      errors.push(`${entry.sourceDescription} source suite differs from its pinned source metadata.`);
    }
    const expandedRows = expandSourceCase(suiteMap.sourceConfiguration, sourceCase);
    const expectedRow = expandedRows[Number(entry.sourceRow) - 1];
    if (!expectedRow
      || entry.sourceProviderLabel !== expectedRow.sourceProviderLabel
      || entry.sourcePrompt !== expectedRow.sourcePrompt
      || !isDeepStrictEqual(entry.sourceVariables, expectedRow.sourceVariables)) {
      errors.push(`${entry.sourceDescription} migration row differs from its pinned source expansion.`);
    }
  }
  if (packageEntries.length !== suiteMap.sourceExpandedRowCount) {
    errors.push(
      `${packageName} source-row inventory mismatch: map=${packageEntries.length}, `
      + `expected=${suiteMap.sourceExpandedRowCount}.`
    );
  }
  const sourceSmokeCount = packageEntries.filter((entry) => entry.sourceSuite === "smoke").length;
  if (sourceSmokeCount !== suiteMap.sourceSmokeRowCount) {
    errors.push(
      `${packageName} smoke-row inventory mismatch: map=${sourceSmokeCount}, `
      + `expected=${suiteMap.sourceSmokeRowCount}.`
    );
  }
  for (const [field, expected] of [
    ["mappedRowCount", packageEntries.filter((entry) => entry.status === "mapped").length],
    ["unsupportedRowCount", packageEntries.filter((entry) => entry.status === "unsupported").length],
    ["unmappedRowCount", packageEntries.filter((entry) => entry.status === "unmapped").length],
  ]) {
    if (Number.isInteger(suiteMap[field]) && suiteMap[field] !== expected) {
      errors.push(
        `${packageName} migration map ${field} mismatch: map=${suiteMap[field]}, expected=${expected}.`
      );
    }
  }
  const entries = packageEntries.filter((entry) => entry.package === packageName
    && (suite === "full" || entry.sourceSuite === "smoke"));
  const sourceIds = packageEntries.map((entry) => [
    entry.sourceCaseIndex,
    entry.sourceRow,
    entry.sourceProviderLabel,
    entry.sourcePrompt,
  ].join("\0"));
  if (new Set(sourceIds).size !== packageEntries.length) {
    errors.push(`${packageName} migration map has duplicate source-row identities.`);
  }
  const allDiagnostics = map.cases.filter((entry) => entry.diagnostic === true);
  if (allDiagnostics.some((entry) => entry.package !== "agent-defaults"
    || !DIAGNOSTICS.has(entry.sourceDescription))
    || (packageName === "agent-defaults"
      && (allDiagnostics.length !== DIAGNOSTICS.size
        || [...DIAGNOSTICS].some((name) =>
          allDiagnostics.filter((entry) => entry.sourceDescription === name).length !== 1)))) {
    errors.push("Migration map diagnostics are not restricted to the two approved cases.");
  }
  const unsupported = entries.filter((entry) => entry.status !== "mapped");
  if (unsupported.length) {
    errors.push(
      `${packageName} ${suite} cannot run without dropping ${unsupported.length} source row(s):`
    );
    for (const entry of unsupported) {
      errors.push(`  ${entry.sourceDescription}: ${entry.reason}`);
    }
  }

  let evalPath;
  let evalSpec;
  try {
    evalPath = resolveRepositoryFile(root, root, suiteMap.evalFile, "Native eval file");
    evalSpec = readYaml(evalPath);
  } catch (error) {
    return { errors: [...errors, `Unable to read native eval: ${error.message}`] };
  }
  const stimuli = evalSpec?.stimuli;
  if (!Array.isArray(stimuli)) {
    errors.push(`${suiteMap.evalFile} has no stimuli array.`);
    return { errors };
  }
  for (const stimulus of stimuli) {
    for (const grader of stimulus.graders || []) {
      if (typeof grader.name === "string"
        && (!GRADER_NAME_PATTERN.test(grader.name)
          || grader.name.length > MAX_GRADER_NAME_LENGTH)) {
        errors.push(
          `${stimulus.name} has an invalid Vally grader name: ${grader.name} `
          + `(must be a lowercase slug of at most ${MAX_GRADER_NAME_LENGTH} characters).`
        );
      }
    }
  }
  if (stimuli.length !== suiteMap.nativeStimulusCount) {
    errors.push(
      `${packageName} native inventory mismatch: eval=${stimuli.length}, `
      + `map=${suiteMap.nativeStimulusCount}.`
    );
  }
  const expectedEntries = entries.filter((entry) => entry.status === "mapped");
  const expectedNames = expectedEntries.map((entry) => entry.targetStimulus);
  for (const entry of expectedEntries) {
    const sourceMapping = sourcePromptSkills(entry, suiteMap.sourceConfiguration);
    if (sourceMapping.rootProfiles.length
      && entry.coverageKind !== "root-policy-behavior") {
      errors.push(
        `${entry.sourceDescription} uses a root agent profile without root policy-behavior coverage metadata.`
      );
      continue;
    }
    if (sourceMapping.unsupportedFiles.length) {
      errors.push(
        `${entry.sourceDescription} uses source instruction files without a native equivalent.`
      );
      continue;
    }
    const sourceTemplate = sourcePromptTemplate(entry, suiteMap.sourceConfiguration);
    if (sourceMapping.policyFiles.length > 1
      || sourceTemplate.includes("instructions = skill_content ~")) {
      if (!entry.nativeContextFixture) {
        errors.push(`${entry.sourceDescription} requires a checked-in combined instruction fixture.`);
        continue;
      }
    }
    for (const source of sourceMapping.policyFiles) {
      try {
        resolveRepositoryFile(
          root,
          path.dirname(evalPath),
          source.replace(/^file:\/\//, ""),
          `${entry.sourceDescription} source instruction`
        );
      } catch (error) {
        errors.push(`${entry.sourceDescription} has an unsafe source instruction path: ${error.message}`);
      }
    }
    if (JSON.stringify(entry.requiredSkills || []) !== JSON.stringify(sourceMapping.skills)) {
      errors.push(
        `${entry.sourceDescription} migration map skills do not match its source prompt.`
      );
    }
  }
  const actualNames = stimuli
    .filter((stimulus) => suite === "full" || stimulus.tags?.suite === "smoke")
    .map((stimulus) => stimulus.name);
  const duplicates = actualNames.filter((name, index) => actualNames.indexOf(name) !== index);
  if (duplicates.length) errors.push(`Duplicate native stimulus names: ${[...new Set(duplicates)].join(", ")}`);
  const expectedSet = new Set(expectedNames);
  const actualSet = new Set(actualNames);
  const missing = expectedNames.filter((name) => !actualSet.has(name));
  const unexpected = actualNames.filter((name) => !expectedSet.has(name));
  if (missing.length || unexpected.length) {
    errors.push(
      `Native stimulus inventory mismatch (missing: ${missing.length}; unexpected: ${unexpected.length}).`
    );
  }
  if (expectedEntries.length !== actualNames.length) {
    errors.push(
      `Native stimulus count mismatch: map=${expectedEntries.length}, eval=${actualNames.length}.`
    );
  }

  for (const entry of expectedEntries) {
    const stimulus = stimuli.find((candidate) => candidate.name === entry.targetStimulus);
    if (!stimulus) continue;
    const sourceMapping = sourcePromptSkills(entry, suiteMap.sourceConfiguration);
    const expectedFiles = entry.nativeContextFixture
      ? [{
        src: entry.nativeContextFixture,
        dest: ".github/copilot-instructions.md",
      }]
      : sourceMapping.policyFiles.map((source, index) => ({
        src: source.replace(/^file:\/\//, ""),
        dest: index === 0 ? ".github/copilot-instructions.md" : "AGENTS.md",
      }));
    const additionalFiles = validateNativeEnvironmentFiles(
      root,
      evalPath,
      entry,
      errors,
      expectedFiles.map((file) => file.dest)
    );
    const destinations = new Set(expectedFiles.map((file) => file.dest.toLowerCase()));
    for (const file of additionalFiles) {
      const destinationKey = file.dest.toLowerCase();
      if (destinations.has(destinationKey)) {
        errors.push(`${entry.sourceDescription} has duplicate staged file destinations.`);
        continue;
      }
      destinations.add(destinationKey);
      expectedFiles.push(file);
    }
    if (entry.nativeContextFixture) {
      let fixturePath;
      let sourceContent = "";
      try {
        fixturePath = resolveRepositoryFile(
          root,
          path.dirname(evalPath),
          entry.nativeContextFixture,
          `${entry.sourceDescription} native instruction fixture`
        );
        sourceContent = sourceInstructionContent(
          root,
          evalPath,
          entry,
          suiteMap.sourceConfiguration
        );
      } catch (error) {
        errors.push(`${entry.sourceDescription} combined instruction fixture is unavailable: ${error.message}`);
      }
      if (fixturePath && fs.readFileSync(fixturePath, "utf8") !== sourceContent) {
        errors.push(`${entry.sourceDescription} combined instruction fixture differs from source context.`);
      }
    }
    if (JSON.stringify(stimulus.agent_environment?.files || []) !== JSON.stringify(expectedFiles)) {
      errors.push(`${entry.sourceDescription} staged files do not match its source prompt.`);
    }
    if (entry.coverageKind
      && (entry.coverageKind !== "root-policy-behavior"
        || stimulus.tags?.coverage !== entry.coverageKind
        || sourceMapping.policyFiles.length === 0)) {
      errors.push(`${entry.sourceDescription} has invalid root policy-behavior coverage metadata.`);
    }
    const expectedSkills = [...(entry.requiredSkills || [])].sort();
    const actualSkills = (stimulus.agent_environment?.skills || [])
      .sort();
    const skillDirectory = packageName === "agent-defaults" || packageName === "code-reviewers"
      ? "../.apm/skills"
      : "../../agent-defaults/.apm/skills";
    const expectedSkillPaths = expectedSkills.map((skill) => `${skillDirectory}/${skill}`);
    if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkillPaths)) {
      errors.push(`${entry.sourceDescription} native skills do not match its source prompt.`);
    }
    for (const skillPath of expectedSkillPaths) {
      const resolvedSkillPath = path.resolve(path.dirname(evalPath), skillPath);
      try {
        if (!fs.statSync(resolvedSkillPath).isDirectory()) {
          errors.push(`${entry.sourceDescription} skill directory is not a directory: ${skillPath}.`);
        }
      } catch (error) {
        errors.push(`${entry.sourceDescription} skill directory is unavailable: ${error.message}`);
      }
    }
    const skillGraders = (stimulus.graders || []).filter((grader) =>
      grader.type === "skill-invocation"
    );
    const graderSkills = skillGraders.flatMap((grader) => grader.config?.required || []).sort();
    if (JSON.stringify(graderSkills) !== JSON.stringify(expectedSkills)
      || skillGraders.length !== expectedSkills.length) {
      errors.push(`${entry.sourceDescription} skill graders do not match its source prompt.`);
    }
    if (skillGraders.length) {
      errors.push(`${entry.sourceDescription} source assertions do not require skill activation.`);
    }
    const expectedAssertionGraders = entry.assertionGraders || [];
    const assertionGraders = (stimulus.graders || []).filter((grader) =>
      grader.type !== "skill-invocation"
    );
    const assertionGradersByName = new Map(assertionGraders.map((grader) => [
      grader.name,
      grader,
    ]));
    if (expectedAssertionGraders.length !== assertionGraders.length
      || expectedAssertionGraders.some((grader) =>
        !grader.name
        || !/^[0-9a-f]{64}$/.test(grader.configSha256 || "")
        || assertionGradersByName.get(grader.name)?.type !== grader.type
        || graderConfigurationDigest(assertionGradersByName.get(grader.name) || {})
          !== grader.configSha256
        || assertionGraders.filter((candidate) => candidate.name === grader.name).length !== 1)
      || assertionGraders.some((grader) =>
        !expectedAssertionGraders.some((expected) => expected.name === grader.name
          && expected.type === grader.type))) {
      errors.push(`${entry.sourceDescription} assertion graders do not match its migration map.`);
    }
    if (stimulus.simulation?.tool_overrides?.bash?.is_error !== true) {
      errors.push(`${entry.sourceDescription} does not block shell command execution.`);
    }

    const userInput = entry.sourceVariables?.user_input;
    if (typeof userInput !== "string") {
      errors.push(`${entry.sourceDescription} has no exact source user input.`);
    } else if (stimulus.prompt !== userInput) {
      errors.push(`${entry.sourceDescription} native prompt differs from its exact source user input.`);
    }
  }

  if (packageName === "agent-defaults") {
    const mappedDiagnostics = entries.filter((entry) =>
      entry.diagnostic && entry.status === "mapped"
    );
    const diagnosticNames = mappedDiagnostics.map((entry) => entry.sourceDescription);
    if (diagnosticNames.length !== DIAGNOSTICS.size
      || [...DIAGNOSTICS].some((name) => diagnosticNames.filter((item) => item === name).length !== 1)
      || diagnosticNames.some((name) => !DIAGNOSTICS.has(name))) {
      errors.push("Both approved diagnostics require native stimuli; they must not be skipped.");
    }
    for (const entry of mappedDiagnostics) {
      const stimulus = stimuli.find((candidate) => candidate.name === entry.targetStimulus);
      if (stimulus?.tags?.diagnostic !== "assertion-only") {
        errors.push(`Diagnostic ${entry.sourceDescription} is missing assertion-only metadata.`);
      }
    }
  } else if (entries.some((entry) => entry.diagnostic)) {
    errors.push("Non-agent-defaults suites may not declare non-blocking diagnostics.");
  }

  return { errors, map, suiteMap, entries, evalSpec, stimuli, expectedEntries };
}

function flattenGraders(result, output = []) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return output;
  output.push(result);
  if (Array.isArray(result.details)) {
    for (const child of result.details) flattenGraders(child, output);
  }
  return output;
}

function validateTrialItemId(record) {
  const prefix = `${record.evalFilePath}::${record.variant}::`;
  if (!record.itemId.startsWith(prefix)) return false;
  const identity = record.itemId.slice(prefix.length).split("::");
  if (identity.length !== 3) return false;
  const [model, stimulus, trial] = identity;
  return model.length > 0
    && stimulus === record.stimulus
    && trial === "trial-0"
    && (record.model === undefined || model === record.model)
    && (record.trialIndex === undefined || record.trialIndex === 0)
    && (record.totalTrials === undefined || record.totalTrials === 1);
}

function validateRun(root, packageName, suite, records) {
  const preflight = validateNativeSuite(root, packageName, suite);
  const errors = [...preflight.errors];
  const diagnostics = [];
  if (errors.length) return { errors, diagnostics };

  if (!Array.isArray(records) || !records.length) {
    return { errors: ["Vally result stream is empty."], diagnostics };
  }
  const trialRecords = records.filter((record) => record?.type === "trial-result");
  const summaryRecords = records.filter((record) => record?.type === "run-summary");
  if (records.some((record) => !record || typeof record !== "object"
    || !["trial-result", "run-summary"].includes(record.type))) {
    errors.push("Vally result stream contains a malformed or unknown record.");
  }
  if (summaryRecords.length !== 1) {
    errors.push(`Expected one run-summary record, received ${summaryRecords.length}.`);
  }

  const expectedByName = new Map(preflight.expectedEntries.map((entry) => [
    entry.targetStimulus,
    entry,
  ]));
  const stimuliByName = new Map(preflight.stimuli.map((stimulus) => [
    stimulus.name,
    stimulus,
  ]));
  const resultCounts = new Map();
  for (const record of trialRecords) {
    if (typeof record.itemId !== "string" || !record.itemId
      || !Number.isFinite(record.durationMs) || record.durationMs < 0
      || typeof record.evalName !== "string" || !record.evalName
      || typeof record.evalFilePath !== "string" || !record.evalFilePath
      || typeof record.variant !== "string" || !record.variant
      || typeof record.stimulus !== "string" || !record.stimulus
      || (record.runId !== undefined
        && (typeof record.runId !== "string" || !record.runId.trim()))
      || !["success", "error", "skipped"].includes(record.status)) {
      errors.push("Vally trial result has a malformed identity or status.");
      continue;
    }
    if (!validateTrialItemId(record)) {
      errors.push(`${record.stimulus} Vally itemId does not match its planned identity.`);
      continue;
    }
    resultCounts.set(record.stimulus, (resultCounts.get(record.stimulus) || 0) + 1);
    const entry = expectedByName.get(record.stimulus);
    const stimulus = stimuliByName.get(record.stimulus);
    if (!entry || !stimulus) {
      errors.push(`Unexpected Vally stimulus result: ${record.stimulus}`);
      continue;
    }
    if (record.status !== "success") {
      errors.push(`${record.stimulus} execution ${record.status}: ${record.error || record.skipReason || "no reason supplied"}`);
      continue;
    }
    if (!record.trajectory || typeof record.trajectory !== "object"
      || Array.isArray(record.trajectory)) {
      errors.push(`${record.stimulus} has no valid execution trajectory.`);
      continue;
    }
    const grade = record.gradeResult;
    if (!grade || typeof grade !== "object" || typeof grade.passed !== "boolean"
      || !Array.isArray(grade.details)) {
      errors.push(`${record.stimulus} has a missing or malformed grade result.`);
      continue;
    }
    const graderResults = flattenGraders(grade);
    if (graderResults.some((grader) => typeof grader.passed !== "boolean"
      || (grader !== grade && typeof grader.graderType !== "string"))) {
      errors.push(`${record.stimulus} contains a malformed grader result.`);
      continue;
    }
    if (graderResults.some((grader) => grader.status && grader.status !== "success")) {
      errors.push(`${record.stimulus} contains a grader execution error.`);
      continue;
    }
    const expectedGraders = (stimulus.graders || []).map((grader) => grader.name);
    const actualGraders = graderResults
      .map((grader) => grader.configuredName)
      .filter((name) => typeof name === "string");
    const actualCounts = new Map();
    for (const name of actualGraders) actualCounts.set(name, (actualCounts.get(name) || 0) + 1);
    if (expectedGraders.length !== actualGraders.length
      || expectedGraders.some((name) => actualCounts.get(name) !== 1)
      || actualGraders.some((name) => !expectedGraders.includes(name))) {
      errors.push(`${record.stimulus} grader results do not match its configured grader set.`);
      continue;
    }

    const failedGraders = graderResults.filter((grader) =>
      grader !== grade && grader.passed === false
    );
    if (grade.passed && failedGraders.length) {
      errors.push(`${record.stimulus} grade verdict contradicts its failed grader results.`);
      continue;
    }
    if (!grade.passed && !failedGraders.length) {
      errors.push(`${record.stimulus} grade failed without a failed grader result.`);
      continue;
    }
    if (grade.passed) continue;
    const assertionNames = new Set((entry.assertionGraders || []).map((grader) => grader.name));
    const diagnosticOnly = packageName === "agent-defaults"
      && entry.diagnostic === true
      && DIAGNOSTICS.has(entry.sourceDescription)
      && failedGraders.length > 0
      && failedGraders.every((grader) => assertionNames.has(grader.configuredName)
        && grader.graderType === "output-matches");
    if (!diagnosticOnly) {
      errors.push(`${record.stimulus} failed required graders: ${
        failedGraders.map((grader) => grader.configuredName || grader.name).join(", ")
      }`);
      continue;
    }
    diagnostics.push({
      stimulus: record.stimulus,
      description: entry.sourceDescription,
      failedGraders: failedGraders.map((grader) => grader.configuredName),
    });
  }

  for (const [name, entry] of expectedByName) {
    const count = resultCounts.get(name) || 0;
    if (count !== 1) errors.push(`${entry.sourceDescription} expected one result for ${name}; received ${count}.`);
  }
  for (const [name, count] of resultCounts) {
    if (count !== 1) errors.push(`Duplicate result for ${name}: ${count}.`);
  }

  const [summary] = summaryRecords;
  if (summary) {
    if (typeof summary.runId !== "string" || !summary.runId.trim()
      || typeof summary.passed !== "boolean" || typeof summary.hadExecutionErrors !== "boolean"
      || !Array.isArray(summary.evals) || summary.evals.length !== 1) {
      errors.push("Vally run-summary is malformed.");
    } else {
      const evalSummary = summary.evals[0];
      if (!evalSummary || typeof evalSummary !== "object" || Array.isArray(evalSummary)) {
        errors.push("Vally eval summary is malformed.");
        return { errors, diagnostics };
      }
      const stimuliSkipped = evalSummary.stimuliSkipped === undefined
        ? 0
        : evalSummary.stimuliSkipped;
      if (trialRecords.some((record) => record.runId !== undefined && record.runId !== summary.runId)) {
        errors.push("Vally trial and run-summary identifiers do not match.");
      }
      if (summary.hadExecutionErrors || evalSummary.hadExecutionErrors) {
        errors.push("Vally run-summary reports an execution error.");
      }
      if (evalSummary.error !== undefined
        || typeof evalSummary.evalFilePath !== "string" || !evalSummary.evalFilePath
        || typeof evalSummary.variant !== "string" || !evalSummary.variant
        || typeof evalSummary.name !== "string" || !evalSummary.name
        || !Number.isInteger(evalSummary.stimuliRun) || evalSummary.stimuliRun < 0
        || !Number.isInteger(evalSummary.stimuliTotal) || evalSummary.stimuliTotal < 0
        || !Number.isInteger(stimuliSkipped) || stimuliSkipped < 0
        || !Number.isFinite(evalSummary.durationMs) || evalSummary.durationMs < 0) {
        errors.push("Vally eval summary has malformed result counts or duration.");
      }
      if (typeof evalSummary.hadExecutionErrors !== "undefined"
        && typeof evalSummary.hadExecutionErrors !== "boolean") {
        errors.push("Vally eval summary has a malformed execution-error flag.");
      }
      const expectedEvalPath = path.resolve(root, preflight.suiteMap.evalFile);
      if (path.resolve(root, evalSummary.evalFilePath) !== expectedEvalPath
        || trialRecords.some((record) => record.evalName !== evalSummary.name
          || path.resolve(root, record.evalFilePath) !== expectedEvalPath
          || record.variant !== evalSummary.variant)) {
        errors.push("Vally trial and eval-summary identities do not match the requested suite.");
      }
      if (evalSummary.stimuliRun !== preflight.expectedEntries.length
        || evalSummary.stimuliTotal !== preflight.stimuli.length
        || stimuliSkipped !== 0) {
        errors.push(
          `Vally run-summary count mismatch (ran ${evalSummary.stimuliRun}; expected ${preflight.expectedEntries.length}; total ${evalSummary.stimuliTotal}; expected total ${preflight.stimuli.length}; skipped ${stimuliSkipped}).`
        );
      }
      if (typeof evalSummary.passed !== "boolean") {
        errors.push("Vally eval summary is missing its pass verdict.");
      }
      if (evalSummary.name !== preflight.evalSpec.name
        || evalSummary.passed !== summary.passed
        || evalSummary.scoringApplied !== true) {
        errors.push("Vally eval summary identity or verdict is inconsistent.");
      }
      const shouldPass = errors.length === 0 && diagnostics.length === 0;
      if (summary.passed !== shouldPass && !(diagnostics.length > 0 && !summary.passed)) {
        errors.push("Vally summary verdict does not match the validated trial results.");
      }
      if (diagnostics.length === 0 && !summary.passed) {
        errors.push("Vally run-summary failed without an approved diagnostic assertion failure.");
      }
    }
  }
  return { errors, diagnostics };
}

function parseJsonl(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.length > 0);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL record on line ${index + 1}: ${error.message}`);
    }
  });
}

function main(argv) {
  const [mode, packageName, suite, file] = argv;
  if (!["--check", "--results"].includes(mode) || !packageName || !suite
    || (mode === "--results" && !file)) {
    console.error("Usage: node script/validate-native-evals.js --check <package> <smoke|full>");
    console.error("   or: node script/validate-native-evals.js --results <package> <smoke|full> <results.jsonl>");
    return 2;
  }
  const root = path.resolve(__dirname, "..");
  try {
    if (mode === "--check") {
      const result = validateNativeSuite(root, packageName, suite);
      for (const error of result.errors) console.error(error);
      if (!result.errors.length) {
        console.log(`${packageName} ${suite}: ${result.expectedEntries.length} native stimuli validated.`);
      }
      return result.errors.length ? 1 : 0;
    }
    const result = validateRun(root, packageName, suite, parseJsonl(file));
    for (const error of result.errors) console.error(error);
    for (const diagnostic of result.diagnostics) {
      console.log(`DIAGNOSTIC ASSERTION FAILURE (non-blocking): ${diagnostic.description}`);
      console.log(`  graders: ${diagnostic.failedGraders.join(", ")}`);
    }
    if (!result.errors.length && !result.diagnostics.length) {
      console.log(`${packageName} ${suite}: all required native stimuli passed.`);
    }
    return result.errors.length ? 1 : result.diagnostics.length ? 10 : 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {
  parseJsonl,
  resolveRepositoryFile,
  sourceInstructionContent,
  validateNativeSuite,
  validateRun,
};
