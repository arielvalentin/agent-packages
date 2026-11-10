const GRADER_METADATA = {
  behavior: {},
  determinism: "static",
  reference: "reference-free",
  temporalScope: "point-in-time",
  costProfile: "free",
};

function result(name, passed, evidence) {
  return {
    name,
    kind: "code",
    passed,
    score: passed ? 1 : 0,
    label: passed ? "correct" : "incorrect",
    evidence,
  };
}

function errorResult(name, evidence) {
  return {
    ...result(name, false, evidence),
    status: "error",
  };
}

function outputOf(input, name) {
  const output = input.trajectory?.output;
  return typeof output === "string"
    ? { output }
    : { error: errorResult(name, "Trajectory output is missing or is not text.") };
}

function compilePattern(pattern) {
  const inlineFlags = /^\(\?([ims]+)\)/.exec(pattern);
  return new RegExp(
    inlineFlags ? pattern.slice(inlineFlags[0].length) : pattern,
    inlineFlags?.[1] || ""
  );
}

function validateTextContract(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("output-text-contract requires a configuration object.");
  }
  const allowed = new Set([
    "minimumLengthExclusive",
    "maximumLengthExclusive",
    "mustMatch",
    "mustNotMatch",
    "removeCharacters",
  ]);
  if (Object.keys(config).some((key) => !allowed.has(key))
    || !Object.keys(config).length) {
    throw new Error("output-text-contract has an unknown or empty configuration.");
  }
  for (const key of ["minimumLengthExclusive", "maximumLengthExclusive"]) {
    if (key in config && (!Number.isSafeInteger(config[key]) || config[key] < 0)) {
      throw new Error(`${key} must be a non-negative integer.`);
    }
  }
  for (const key of ["mustMatch", "mustNotMatch"]) {
    if (key in config && typeof config[key] !== "string") {
      throw new Error(`${key} must be a regular-expression string.`);
    }
  }
  if ("removeCharacters" in config
    && (!Array.isArray(config.removeCharacters)
      || config.removeCharacters.some((value) =>
        typeof value !== "string" || value.length === 0))) {
    throw new Error("removeCharacters must be an array of non-empty strings.");
  }
  if (config.minimumLengthExclusive !== undefined
    && config.maximumLengthExclusive !== undefined
    && config.minimumLengthExclusive >= config.maximumLengthExclusive) {
    throw new Error("The exclusive output length bounds are inconsistent.");
  }
  return {
    ...config,
    mustMatch: config.mustMatch === undefined
      ? undefined
      : compilePattern(config.mustMatch),
    mustNotMatch: config.mustNotMatch === undefined
      ? undefined
      : compilePattern(config.mustNotMatch),
  };
}

function validateSourcePattern(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)
    || typeof config.pattern !== "string"
    || (config.trim !== undefined && typeof config.trim !== "boolean")
    || (config.removeCharacters !== undefined
      && (!Array.isArray(config.removeCharacters)
        || config.removeCharacters.some((value) =>
          typeof value !== "string" || value.length === 0)))
    || Object.keys(config).some((key) =>
      !["pattern", "trim", "removeCharacters"].includes(key))) {
    throw new Error("source-output-pattern requires a pattern and optional normalization.");
  }
  return compilePattern(config.pattern);
}

function gradeSourcePattern(input) {
  const name = "source-output-pattern";
  const received = outputOf(input, name);
  if (received.error) return received.error;

  let pattern;
  try {
    pattern = validateSourcePattern(input.config);
  } catch (error) {
    return errorResult(name, error.message);
  }

  let output = received.output;
  if (input.config.trim) output = output.trim();
  for (const character of input.config.removeCharacters || []) {
    output = output.split(character).join("");
  }
  const passed = pattern.test(output);
  return result(
    name,
    passed,
    passed
      ? `Normalized output matches /${input.config.pattern}/`
      : `Normalized output does not match /${input.config.pattern}/`
  );
}

function gradeTextContract(input) {
  const name = "output-text-contract";
  const received = outputOf(input, name);
  if (received.error) return received.error;

  let contract;
  try {
    contract = validateTextContract(input.config);
  } catch (error) {
    return errorResult(name, error.message);
  }

  let output = received.output.trim();
  for (const character of contract.removeCharacters || []) {
    output = output.split(character).join("");
  }
  const checks = [];
  if (contract.minimumLengthExclusive !== undefined) {
    checks.push({
      passed: output.length > contract.minimumLengthExclusive,
      evidence: `trimmed output length ${output.length} > ${contract.minimumLengthExclusive}`,
    });
  }
  if (contract.maximumLengthExclusive !== undefined) {
    checks.push({
      passed: output.length < contract.maximumLengthExclusive,
      evidence: `trimmed output length ${output.length} < ${contract.maximumLengthExclusive}`,
    });
  }
  if (contract.mustMatch) {
    checks.push({
      passed: contract.mustMatch.test(output),
      evidence: `trimmed output matches /${input.config.mustMatch}/`,
    });
  }
  if (contract.mustNotMatch) {
    checks.push({
      passed: !contract.mustNotMatch.test(output),
      evidence: `trimmed output does not match /${input.config.mustNotMatch}/`,
    });
  }
  const failed = checks.filter((check) => !check.passed);
  return result(
    name,
    failed.length === 0,
    failed.length
      ? failed.map((check) => check.evidence).join("; ")
      : checks.map((check) => check.evidence).join("; ")
  );
}

const BACKTICK = String.fromCharCode(96);
const DOUBLE_QUOTE = String.fromCharCode(34);
const SINGLE_QUOTE = String.fromCharCode(39);
const SENTINEL = String.fromCharCode(1);

function caseInsensitiveIndexOf(text, needle, from) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const relative = text.slice(from || 0).search(new RegExp(escaped, "i"));
  return relative === -1 ? -1 : relative + (from || 0);
}

function maskBacktickArgument(text, flag) {
  const pattern = new RegExp(
    `(--${flag}\\s*=?\\s*)${BACKTICK}([^${BACKTICK}]*)${BACKTICK}`,
    "gi"
  );
  return text.replace(pattern, (_match, prefix, value) =>
    prefix + SENTINEL + value + SENTINEL);
}

function extractCreateSegments(text) {
  const segments = [];
  const anchor = "gh pr create";
  const ghPattern = /\bgh\b/gi;
  let index = caseInsensitiveIndexOf(text, anchor);
  while (index !== -1) {
    const searchFrom = index + anchor.length;
    const nextCreate = caseInsensitiveIndexOf(text, anchor, searchFrom);
    const nextBacktick = text.indexOf(BACKTICK, searchFrom);
    const nextNewline = text.indexOf("\n", searchFrom);
    ghPattern.lastIndex = searchFrom;
    const ghMatch = ghPattern.exec(text);
    const nextGh = ghMatch ? ghMatch.index : -1;
    const stops = [nextCreate, nextBacktick, nextNewline, nextGh]
      .filter((position) => position !== -1);
    const end = stops.length ? Math.min(...stops) : text.length;
    segments.push(text.slice(index, end));
    index = nextCreate;
  }
  return segments.map((segment) =>
    segment.split(/\s*(?:&&|;|\|\|)\s*/)[0]);
}

function extractArgument(segment, flag) {
  const anchor = new RegExp(`--${flag}\\s*=?\\s*`, "i").exec(segment);
  if (!anchor) return null;
  const rest = segment.slice(anchor.index + anchor[0].length);
  if (rest[0] === DOUBLE_QUOTE) {
    const end = rest.indexOf(DOUBLE_QUOTE, 1);
    return (end === -1 ? rest.slice(1) : rest.slice(1, end)).trim();
  }
  if (rest[0] === SINGLE_QUOTE) {
    const end = rest.indexOf(SINGLE_QUOTE, 1);
    return (end === -1 ? rest.slice(1) : rest.slice(1, end)).trim();
  }
  if (rest[0] === SENTINEL) {
    const end = rest.indexOf(SENTINEL, 1);
    return (end === -1 ? rest.slice(1) : rest.slice(1, end)).trim();
  }
  const nextFlag = rest.match(/\s+--[a-z]/i);
  const nextLine = rest.indexOf("\n");
  const stops = [
    nextFlag ? nextFlag.index : -1,
    nextLine,
  ].filter((position) => position !== -1);
  const end = stops.length ? Math.min(...stops) : rest.length;
  return rest.slice(0, end).trim();
}

export function isValidDraftCreateOutput(output) {
  if (typeof output !== "string") return false;
  const normalized = output.replace(/\\\s*\n\s*/g, " ");
  const masked = maskBacktickArgument(
    maskBacktickArgument(normalized, "title"),
    "body"
  );
  const createSegments = extractCreateSegments(masked);
  const conventionalTitle = /^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S/;
  const wipTitle = /^wip\b/i;
  const draftSegments = createSegments.filter((segment) => /--draft\b/i.test(segment));
  return draftSegments.length > 0 && draftSegments.every((segment) => {
    const title = extractArgument(segment, "title");
    const body = extractArgument(segment, "body");
    return title !== null
      && title !== ""
      && conventionalTitle.test(title)
      && !wipTitle.test(title)
      && body !== null
      && body !== "";
  });
}

function gradeDraftCreate(input) {
  const name = "draft-pr-create-command";
  const received = outputOf(input, name);
  if (received.error) return received.error;
  if (Object.keys(input.config || {}).length) {
    return errorResult(name, "draft-pr-create-command does not accept configuration.");
  }
  const passed = isValidDraftCreateOutput(received.output);
  return result(
    name,
    passed,
    passed
      ? "Every draft create command has a conventional non-WIP title and a non-empty body."
      : "No valid draft create command satisfies the source assertion."
  );
}

export function registerGraders(registry) {
  registry.register({
    metadata: {
      ...GRADER_METADATA,
      name: "source-output-pattern",
      description: "Checks a regular expression after explicit source-compatible text normalization.",
    },
    grade: gradeSourcePattern,
  });
  registry.register({
    metadata: {
      ...GRADER_METADATA,
      name: "output-text-contract",
      description: "Checks exact trimmed-output length and regular-expression constraints.",
    },
    grade: gradeTextContract,
  });
  registry.register({
    metadata: {
      ...GRADER_METADATA,
      name: "draft-pr-create-command",
      description: "Checks the source eval's draft PR create-command contract.",
    },
    grade: gradeDraftCreate,
  });
}
