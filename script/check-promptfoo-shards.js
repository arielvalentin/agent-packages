#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const SHARD_COUNT = 4;
const MAX_ROW_SPREAD_RATIO = 0.15;
const EXPECTED_AGENT_DEFAULTS_ROWS = { full: 404, smoke: 137 };
const VARIABLE_INTERPOLATION = /\{\{\s*\w+\s*\}\}/;
const CONVERSATION_VARIABLE = /\{\{\s*_conversation\s*\}\}/;
const PROMPT_PREFIX_VARIABLES = new Set([
  "skill_content",
  "companion_content",
  "review_mode_content",
]);
const GLOB_SYNTAX = /[*?\[\]{}]|[!+@]\(/;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checkPromptDefinitions(prompts) {
  let valid = true;
  if (!Array.isArray(prompts)) {
    console.error("Sharded evaluations require an inline prompts array.");
    return false;
  }
  for (const [index, prompt] of prompts.entries()) {
    if (!prompt || typeof prompt !== "object" || typeof prompt.raw !== "string"
      || prompt.function !== undefined) {
      console.error(`Prompt ${index + 1} must use a static inline raw string.`);
      valid = false;
      continue;
    }
    if (/^(file|package|langfuse|portkey):\/\//.test(prompt.raw)) {
      console.error(`Prompt ${index + 1} uses an unsupported dynamic prompt source.`);
      valid = false;
    }
    if (CONVERSATION_VARIABLE.test(prompt.raw)) {
      console.error(`Prompt ${index + 1} uses unsupported runtime variable _conversation.`);
      valid = false;
    }
  }
  return valid;
}

function selectedProviders(testCase, config) {
  return testCase?.providers ??
    config.defaultTest?.providers ??
    config.providers ??
    [];
}

function selectedPrompts(testCase, config) {
  return testCase?.prompts ??
    config.defaultTest?.prompts ??
    config.prompts ??
    [];
}

function canonicalizeProviderId(id) {
  if (id.startsWith("file://")) {
    const filePath = id.slice(7);
    return path.isAbsolute(filePath) ? id : `file://${path.resolve(filePath)}`;
  }
  for (const prefix of ["exec:", "python:", "golang:"]) {
    if (id.startsWith(prefix)) {
      const filePath = id.slice(prefix.length);
      if (filePath.includes("/") || filePath.includes("\\")) {
        return `${prefix}${path.resolve(filePath)}`;
      }
      return id;
    }
  }
  if ((id.endsWith(".js") || id.endsWith(".ts") || id.endsWith(".mjs"))
    && (id.includes("/") || id.includes("\\"))) {
    return `file://${path.resolve(id)}`;
  }
  return id;
}

function configuredTarget(target) {
  if (typeof target === "string") return { raw: target, id: target, label: null };
  if (target && typeof target === "object" && typeof target.id === "string") {
    return {
      raw: target,
      id: target.id,
      label: typeof target.label === "string" ? target.label : null,
    };
  }
  return null;
}

function selectorMatches(selector, target, type) {
  if (typeof selector !== "string") {
    return stableStringify(selector) === stableStringify(target.raw);
  }
  if (type === "provider") {
    const canonicalRef = canonicalizeProviderId(selector);
    const canonicalId = canonicalizeProviderId(target.id);
    if (target.label === selector || target.id === selector || canonicalId === canonicalRef) {
      return true;
    }
    if (selector.endsWith("*")) {
      const prefix = selector.slice(0, -1);
      if (target.label?.startsWith(prefix) || target.id.startsWith(prefix)
        || canonicalId.startsWith(prefix)) {
        return true;
      }
    }
    return target.label?.startsWith(`${selector}:`)
      || target.id.startsWith(`${selector}:`)
      || canonicalId.startsWith(`${selector}:`);
  }
  if (target.label === selector || target.id === selector) return true;
  if (selector.endsWith("*")) {
    const prefix = selector.slice(0, -1);
    if (target.label?.startsWith(prefix) || target.id.startsWith(prefix)) return true;
  }
  return target.label?.startsWith(`${selector}:`) || target.id.startsWith(`${selector}:`);
}

function exactSelectorMatches(selector, target, type) {
  if (typeof selector !== "string") return false;
  if (type === "provider") {
    return target.label === selector || target.id === selector;
  }
  return target.label === selector || target.id === selector;
}

function effectiveSelections(selections, configuredTargets, type) {
  const targets = configuredTargets.map(configuredTarget);
  return selections.map((selection) => {
    const matches = targets
      .map((target, index) => target && selectorMatches(selection, target, type) ? index : -1)
      .filter((index) => index !== -1);
    return matches.length === 1
      ? ["configured-target", matches[0]]
      : ["unresolved-selection", stableStringify(selection)];
  });
}

function promptGroupParts(testCase, config) {
  const promptVariables = Object.fromEntries(
    Object.entries(testCase?.vars || {})
      .filter(([name]) => PROMPT_PREFIX_VARIABLES.has(name))
      .sort(([left], [right]) => left.localeCompare(right))
  );
  const providers = selectedProviders(testCase, config);
  const prompts = selectedPrompts(testCase, config);
  const normalizeSelections = (selections) => [...selections].sort((left, right) => {
    const leftKey = stableStringify(left);
    const rightKey = stableStringify(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return {
    promptVariables,
    providers,
    prompts,
    normalizeSelections,
  };
}

function promptGroupKey(testCase, config) {
  const { promptVariables, providers, prompts, normalizeSelections } =
    promptGroupParts(testCase, config);
  return stableStringify([
    promptVariables,
    normalizeSelections(effectiveSelections(providers, config.providers || [], "provider")),
    normalizeSelections(effectiveSelections(prompts, config.prompts || [], "prompt")),
  ]);
}

function promptGroupSortKey(testCase, config) {
  const { promptVariables, providers, prompts, normalizeSelections } =
    promptGroupParts(testCase, config);
  return stableStringify([
    promptVariables, normalizeSelections(providers), normalizeSelections(prompts),
  ]);
}

function expandedRowCount(testCase, config) {
  const variableExpansions = Object.values(testCase?.vars || {}).reduce(
    (count, value) =>
      count * (Array.isArray(value) && typeof value[0] === "string" ? value.length : 1),
    1
  );
  const providers = selectedProviders(testCase, config);
  const prompts = selectedPrompts(testCase, config);
  return variableExpansions * providers.length * prompts.length;
}

function promptGroups(config) {
  const groups = new Map();
  for (const testCase of config.tests) {
    const key = promptGroupKey(testCase, config);
    const sortKey = promptGroupSortKey(testCase, config);
    if (!groups.has(key)) groups.set(key, { key, sortKey, tests: [], full: 0, smoke: 0 });
    const group = groups.get(key);
    if (sortKey < group.sortKey) group.sortKey = sortKey;
    const rows = expandedRowCount(testCase, config);
    group.tests.push(testCase);
    group.full += rows;
    if (testCase?.metadata?.suite === "smoke") group.smoke += rows;
  }
  return [...groups.values()];
}

function assignPromptGroups(config) {
  // Place the largest smoke groups first, then fill with full-only groups.
  // Whole-group ownership is shared by both suites. Keys and shard IDs break ties.
  const groups = promptGroups(config).sort((left, right) =>
    right.smoke - left.smoke || right.full - left.full ||
    (left.sortKey < right.sortKey ? -1 : left.sortKey > right.sortKey ? 1 : 0) ||
    (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
  );
  const loads = Array.from({ length: SHARD_COUNT }, (_, index) => ({
    shard: index + 1, smoke: 0, full: 0,
  }));
  const assignment = new Map();
  for (const group of groups) {
    const target = [...loads].sort((left, right) =>
      (group.smoke ? left.smoke - right.smoke : 0) ||
      left.full - right.full || left.shard - right.shard
    )[0];
    target.smoke += group.smoke;
    target.full += group.full;
    for (const testCase of group.tests) assignment.set(testCase, target.shard);
  }
  return assignment;
}

function balanceLimits(config, assignment, suite) {
  const groups = promptGroups(config);
  const total = groups.reduce((sum, group) => sum + group[suite], 0);
  const largestGroup = Math.max(...groups.map((group) => group[suite]));
  const minimumMaxRows = Math.max(largestGroup, Math.ceil(total / SHARD_COUNT));
  // Some shard must carry at least minimumMaxRows. At least one of the
  // remaining shards cannot exceed their remaining average.
  const minimumSpread = minimumMaxRows -
    Math.floor((total - minimumMaxRows) / (SHARD_COUNT - 1));
  const referenceRows = Array(SHARD_COUNT).fill(0);
  for (const testCase of config.tests) {
    if (suite === "full" || testCase?.metadata?.suite === "smoke") {
      referenceRows[assignment.get(testCase) - 1] += expandedRowCount(testCase, config);
    }
  }
  // A theoretical lower bound need not be packable. Use an achievable,
  // deterministic whole-group schedule, not arbitrary slack proportional to
  // the largest group. Keep the 15% tolerance when it is feasible.
  const allowedSpread = Math.max(
    1,
    Math.ceil((total / SHARD_COUNT) * MAX_ROW_SPREAD_RATIO),
    Math.max(...referenceRows) - Math.min(...referenceRows)
  );
  return { largestGroup, minimumMaxRows, minimumSpread, allowedSpread };
}

function checkRowOptions(options, label) {
  let valid = true;
  if (options?.repeat !== undefined && options.repeat !== 1) {
    console.error(`${label}: options.repeat must be 1 or omitted; repeated rows are unsupported.`);
    valid = false;
  }
  if (options?.transformVars !== undefined) {
    console.error(`${label}: options.transformVars is unsupported for sharded evaluations.`);
    valid = false;
  }
  if (options?.storeOutputAs !== undefined) {
    console.error(`${label}: options.storeOutputAs is unsupported for sharded evaluations.`);
    valid = false;
  }
  if (options?.disableVarExpansion) {
    console.error(`${label}: options.disableVarExpansion is unsupported; variable expansion must remain enabled.`);
    valid = false;
  }
  return valid;
}

function checkExpectedRowCounts(rowCounts) {
  let valid = true;
  for (const [suite, expected] of Object.entries(EXPECTED_AGENT_DEFAULTS_ROWS)) {
    const actual = rowCounts[suite].reduce((sum, count) => sum + count, 0);
    if (actual !== expected) {
      console.error(`The agent-defaults ${suite} suite must contain ${expected} expanded rows; found ${actual}.`);
      valid = false;
    }
  }
  return valid;
}

function checkVariableInterpolation(value, label, baseDirectory) {
  if (typeof value !== "string") return true;
  let source = value;
  if (value.startsWith("package://")) {
    console.error(`${label}: package variable sources are unsupported for sharded evaluations.`);
    return false;
  }
  if (value.startsWith("file://")) {
    const reference = value.slice("file://".length);
    if (GLOB_SYNTAX.test(reference)) return true;
    const filePath = path.resolve(baseDirectory, reference);
    const extension = path.extname(filePath).toLowerCase();
    if (![".md", ".txt", ".text", ".rst"].includes(extension)) {
      console.error(`${label}: only plain-text file variable sources are supported for sharded evaluations.`);
      return false;
    }
    try {
      source = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      console.error(`${label}: unable to inspect variable source ${filePath}: ${error.message}`);
      return false;
    }
  }
  if (VARIABLE_INTERPOLATION.test(source)) {
    console.error(`${label}: variable interpolation is unsupported for sharded evaluations.`);
    return false;
  }
  return true;
}

function checkEffectiveSelection(selections, configuredTargets, label, type) {
  if (!Array.isArray(selections) || selections.length !== 1) {
    console.error(`${label} must contain exactly one selection; multi-selections are unsupported.`);
    return false;
  }
  if (typeof selections[0] !== "string") {
    console.error(`${label} must use a string id or label; non-string selections are unsupported.`);
    return false;
  }
  const targets = configuredTargets.map(configuredTarget);
  if (targets.some((target) => target === null)) {
    console.error(`Configured ${type}s must have a string id and optional string label.`);
    return false;
  }
  const matches = targets.filter((target) =>
    selectorMatches(selections[0], target, type)
  );
  if (matches.length !== 1) {
    console.error(
      `${label} must resolve to exactly one configured ${type}; it matched ${matches.length}.`
    );
    return false;
  }
  const exactMatches = targets.filter((target) =>
    exactSelectorMatches(selections[0], target, type)
  );
  if (exactMatches.length === 0) {
    const kind = GLOB_SYNTAX.test(selections[0]) ? "wildcard" : "prefix-only";
    console.error(`${label} uses an unsupported ${kind} selector; use an exact configured ${type} id or label.`);
    return false;
  }
  return true;
}

function checkConfig(config, configPath) {
  const tests = config?.tests;
  if (!Array.isArray(tests) || tests.length === 0) {
    console.error("Promptfoo config must contain at least one test case.");
    return false;
  }
  if (["1", "true", "yes", "yup", "yeppers"].includes(
    (process.env.PROMPTFOO_DISABLE_VAR_EXPANSION || "").toLowerCase()
  )) {
    console.error("PROMPTFOO_DISABLE_VAR_EXPANSION is unsupported; variable expansion must remain enabled.");
    return false;
  }
  const shards = Array.from({ length: SHARD_COUNT }, (_, index) =>
    tests.filter((testCase) => testCase?.metadata?.shard === index + 1)
  );
  let invalid = !checkRowOptions(config.defaultTest?.options, "defaultTest");
  if (!checkPromptDefinitions(config.prompts)) invalid = true;
  if (config.defaultTest?.provider !== undefined && config.defaultTest.provider !== null) {
    console.error("defaultTest.provider is unsupported for sharded evaluations; use defaultTest.providers.");
    invalid = true;
  }
  if (config.providerPromptMap && (
    typeof config.providerPromptMap !== "object"
    || Array.isArray(config.providerPromptMap)
    || Object.keys(config.providerPromptMap).length > 0
  )) {
    console.error("providerPromptMap is unsupported for sharded evaluations because it changes effective prompt columns.");
    invalid = true;
  }
  if (config.scenarios && (!Array.isArray(config.scenarios) || config.scenarios.length > 0)) {
    console.error("scenarios are unsupported for sharded evaluations because they can change effective rows.");
    invalid = true;
  }
  if (config.extensions && (!Array.isArray(config.extensions) || config.extensions.length > 0)) {
    console.error("extensions are unsupported for sharded evaluations because they can change effective prompt columns.");
    invalid = true;
  }
  for (const [index, provider] of (config.providers || []).entries()) {
    if (provider && typeof provider === "object"
      && Object.hasOwn(provider, "prompts") && provider.prompts !== undefined) {
      console.error(`Configured provider ${index + 1}: provider-level prompts restrictions are unsupported for sharded evaluations.`);
      invalid = true;
    }
  }
  for (const [name, value] of [
    ["evaluateOptions.repeat", config.evaluateOptions?.repeat],
    ["commandLineOptions.repeat", config.commandLineOptions?.repeat],
  ]) {
    if (value !== undefined && value !== 1) {
      console.error(`${name} must be 1 or omitted; repeated rows are unsupported.`);
      invalid = true;
    }
  }
  for (const option of ["prefix", "suffix"]) {
    const value = config.defaultTest?.options?.[option];
    if (value) {
      console.error(`defaultTest.options.${option} is unsupported for sharded evaluations.`);
      invalid = true;
    }
  }
  if (!checkEffectiveSelection(
    selectedProviders({}, config), config.providers || [], "defaultTest.providers", "provider"
  ) || !checkEffectiveSelection(
    selectedPrompts({}, config), config.prompts || [], "defaultTest.prompts", "prompt"
  )) {
    invalid = true;
  }
  if (Object.keys(config.defaultTest?.vars || {}).length > 0) {
    console.error("defaultTest.vars must be empty; inherited variable expansion is unsupported.");
    invalid = true;
  }
  const seenGroups = new Set();
  const owners = new Map();
  let currentGroup;
  for (const [index, testCase] of tests.entries()) {
    const label = `test case ${index + 1} (${testCase?.description || "unnamed"})`;
    const shard = testCase?.metadata?.shard;
    const suite = testCase?.metadata?.suite;
    if (suite !== undefined && suite !== "smoke" && suite !== "full") {
      console.error(`${label}: metadata.suite must be the scalar string "smoke" or "full".`);
      invalid = true;
    }
    if (testCase?.provider !== undefined && testCase.provider !== null) {
      console.error(`${label}.provider is unsupported for sharded evaluations; use providers.`);
      invalid = true;
    }
    if (!checkRowOptions(testCase?.options, label)) invalid = true;
    if (!checkEffectiveSelection(
      selectedProviders(testCase, config), config.providers || [], `${label}.providers`, "provider"
    ) || !checkEffectiveSelection(
      selectedPrompts(testCase, config), config.prompts || [], `${label}.prompts`, "prompt"
    )) {
      invalid = true;
    }
    for (const option of ["prefix", "suffix"]) {
      const value = testCase?.options?.[option] || config.defaultTest?.options?.[option];
      if (value) {
        console.error(`${label}.options.${option} is unsupported for sharded evaluations.`);
        invalid = true;
      }
    }
    if (!Number.isInteger(shard) || shard < 1 || shard > SHARD_COUNT) {
      console.error(`Test case ${index + 1} (${testCase?.description || "unnamed"}) must have one shard from 1 to ${SHARD_COUNT}.`);
      invalid = true;
    }
    for (const [name, value] of Object.entries(testCase?.vars || {})) {
      const values = Array.isArray(value) ? value : [value];
      for (const [valueIndex, item] of values.entries()) {
        const valueLabel = `${label}.vars.${name}${Array.isArray(value) ? `[${valueIndex}]` : ""}`;
        if (!checkVariableInterpolation(
          item, valueLabel, path.dirname(configPath)
        )) {
          invalid = true;
        }
        if (
          typeof item === "string" &&
          item.startsWith("file://") &&
          GLOB_SYNTAX.test(item.slice("file://".length))
        ) {
          const referenceType = PROMPT_PREFIX_VARIABLES.has(name) ? "prompt-prefix" : "variable";
          console.error(`${valueLabel}: ${name} must not use glob syntax in file:// ${referenceType} references.`);
          invalid = true;
        }
      }
      if (PROMPT_PREFIX_VARIABLES.has(name) && Array.isArray(value)) {
        console.error(`${label}: ${name} must be scalar; split expanded prompt prefixes into consecutive scalar definitions.`);
        invalid = true;
      }
    }
    const group = promptGroupKey(testCase, config);
    if (owners.has(group) && owners.get(group) !== shard) {
      console.error(`Prompt group for ${label} has multiple shard owners: ${owners.get(group)} and ${shard}.`);
      invalid = true;
    }
    owners.set(group, shard);
    if (group !== currentGroup) {
      if (seenGroups.has(group)) {
        console.error(`Prompt group for ${label} is not contiguous.`);
        invalid = true;
      }
      seenGroups.add(group);
      currentGroup = group;
    }
  }
  if (invalid) return false;

  const assignment = assignPromptGroups(config);
  for (const [index, testCase] of tests.entries()) {
    const expectedShard = assignment.get(testCase);
    if (testCase.metadata.shard !== expectedShard) {
      console.error(`Test case ${index + 1} (${testCase.description || "unnamed"}): metadata.shard ${testCase.metadata.shard} differs from deterministic assignment ${expectedShard}.`);
      invalid = true;
    }
  }
  const rowCounts = {};
  for (const suite of ["smoke", "full"]) {
    const selectedShards = shards.map((shard) => shard.filter((testCase) =>
      suite === "full" || testCase?.metadata?.suite === "smoke"
    ));
    for (const [index, shard] of selectedShards.entries()) {
      if (shard.length === 0) {
        console.error(`The ${suite} suite has no cases assigned to shard ${index + 1}.`);
        invalid = true;
      }
    }
    const rowsByShard = selectedShards.map((shard) =>
      shard.reduce((count, testCase) => count + expandedRowCount(testCase, config), 0)
    );
    rowCounts[suite] = rowsByShard;
    const { largestGroup, minimumMaxRows, minimumSpread, allowedSpread } =
      balanceLimits(config, assignment, suite);
    console.log(`${suite} balance: largest group ${largestGroup}, max-row lower bound ${minimumMaxRows}, spread lower bound ${minimumSpread}, allowed spread ${allowedSpread}.`);
    const spread = Math.max(...rowsByShard) - Math.min(...rowsByShard);
    if (spread > allowedSpread) {
      console.error(`The ${suite} suite row counts are imbalanced across shards: ${rowsByShard.join(", ")} (maximum spread ${allowedSpread}).`);
      invalid = true;
    }
  }
  if (
    path.resolve(configPath)
      === path.resolve(__dirname, "../packages/agent-defaults/tests/promptfooconfig.yaml")
    && !checkExpectedRowCounts(rowCounts)
  ) {
    invalid = true;
  }
  if (!invalid) {
    console.log(`Validated ${tests.length} test cases across ${SHARD_COUNT} shards (full rows: ${rowCounts.full.join(", ")}; smoke rows: ${rowCounts.smoke.join(", ")}).`);
  }
  return !invalid;
}

if (require.main === module) {
  const configFile = process.argv[2];
  if (!configFile) {
    console.error("Usage: node script/check-promptfoo-shards.js <promptfoo-config>");
    process.exitCode = 2;
  } else {
    let config;
    try {
      config = yaml.load(fs.readFileSync(configFile, "utf8"));
    } catch (error) {
      console.error(`Unable to read valid Promptfoo config from ${path.resolve(configFile)}: ${error.message}`);
      process.exitCode = 1;
    }
    if (!process.exitCode && !checkConfig(config, configFile)) process.exitCode = 1;
  }
}

module.exports = { assignPromptGroups, balanceLimits, checkExpectedRowCounts };
