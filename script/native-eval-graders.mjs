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

function caseInsensitiveIndexOf(text, needle, from) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const relative = text.slice(from || 0).search(new RegExp(escaped, "i"));
  return relative === -1 ? -1 : relative + (from || 0);
}

function normalizeLineContinuations(text) {
  let normalized = "";
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\\") {
      normalized += text[index];
      continue;
    }

    let end = index + 1;
    while (text[end] === "\\") end += 1;
    const newlineLength = text[end] === "\r" && text[end + 1] === "\n"
      ? 2
      : text[end] === "\n" ? 1 : 0;
    if (newlineLength) {
      if (end - index !== 1) return null;
      index = end + newlineLength - 1;
      continue;
    }
    normalized += text.slice(index, end);
    index = end - 1;
  }
  return normalized;
}

function splitShellCommands(text) {
  const commands = [];
  let quote = null;
  let start = 0;
  let hasShellOperator = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === "\\" && quote !== SINGLE_QUOTE) {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "\\") {
      index += 1;
      continue;
    }
    if ([DOUBLE_QUOTE, SINGLE_QUOTE, BACKTICK].includes(character)) {
      quote = character;
      continue;
    }
    if (character === "#" && (index === 0 || /\s/.test(text[index - 1]))) {
      break;
    }
    if (";&|<>".includes(character)) {
      hasShellOperator = true;
      commands.push(text.slice(start, index));
      if ((character === "&" || character === "|")
        && text[index + 1] === character) index += 1;
      start = index + 1;
    }
  }
  commands.push(text.slice(start));
  return { commands, hasShellOperator };
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
  return segments.map((segment) => {
    const { commands, hasShellOperator } = splitShellCommands(segment);
    return { command: commands[0].trim(), hasShellOperator };
  });
}

function extractArgument(segment, flag) {
  const options = findUnquotedOptions(segment, flag);
  return options.length === 1
    ? extractOptionArgument(segment, options[0], flag)
    : null;
}

function findUnquotedOptions(segment, flag) {
  const option = `--${flag}`;
  const positions = [];
  let quote = null;
  let atWordStart = true;
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];
    if (quote) {
      if (character === "\\" && quote !== SINGLE_QUOTE) {
        index += 1;
      } else if (character === quote) {
        quote = null;
        atWordStart = false;
      }
      continue;
    }
    if (character === "\\") {
      index += 1;
      atWordStart = false;
      continue;
    }
    if (/\s/.test(character)) {
      atWordStart = true;
      continue;
    }
    if (character === "#" && atWordStart) break;
    if ([DOUBLE_QUOTE, SINGLE_QUOTE, BACKTICK].includes(character)) {
      quote = character;
      atWordStart = false;
      continue;
    }
    if (atWordStart
      && segment.slice(index, index + option.length).toLowerCase() === option) {
      const next = segment[index + option.length];
      if (next === undefined || next === "=" || /\s/.test(next)) {
        positions.push(index);
        index += option.length - 1;
        atWordStart = false;
        continue;
      }
    }
    if (character !== "\n" && character !== "\r") {
      atWordStart = false;
    }
  }
  return positions;
}

function extractOptionArgument(segment, optionIndex, flag) {
  let start = optionIndex + `--${flag}`.length;
  while (/\s/.test(segment[start] || "")) start += 1;
  if (segment[start] === "=") {
    start += 1;
    while (/\s/.test(segment[start] || "")) start += 1;
  }
  if (start >= segment.length) return null;

  const quote = [DOUBLE_QUOTE, SINGLE_QUOTE, BACKTICK].includes(segment[start])
    ? segment[start]
    : null;
  if (quote) {
    let end = start + 1;
    for (; end < segment.length; end += 1) {
      if (segment[end] === "\\" && quote !== SINGLE_QUOTE) {
        end += 1;
      } else if (segment[end] === quote) {
        break;
      }
    }
    if (end >= segment.length) return null;
    const next = segment[end + 1];
    if (next !== undefined && !/[\s;|&]/.test(next) && next !== "#") {
      return null;
    }
    return {
      value: segment.slice(start + 1, end).trim(),
      quote,
      sourceStart: start,
      sourceEnd: end + 1,
    };
  }

  let end = start;
  while (end < segment.length && !/[\s;|&]/.test(segment[end])) end += 1;
  return {
    value: segment.slice(start, end).trim(),
    quote: null,
    sourceStart: start,
    sourceEnd: end,
  };
}

function isValidRepositoryTarget(value) {
  const target = value.trim();
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target)) return true;
  const originTarget = /^\$\(\s*git\s+remote\s+get-url\s+origin\s*\|\s*sed\s+-E\s+'([^']+)'\s*\)$/.exec(target);
  return originTarget !== null
    && originTarget[1]
      === "s#^(https?://[^/]+/|ssh://[^/]+/|[^@]+@[^:]+:)([^/]+/[^/]+)(\\.git)?$#\\2#";
}

function isSafeLiteralArgument(argument) {
  if (argument.quote === BACKTICK) return false;
  return argument.quote === SINGLE_QUOTE || !/[$`]/.test(argument.value);
}

function containsShellExpansion(text) {
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote === SINGLE_QUOTE) {
      if (character === SINGLE_QUOTE) quote = null;
      continue;
    }
    if (character === "\\" && index + 1 < text.length) {
      index += 1;
      continue;
    }
    if (quote === DOUBLE_QUOTE) {
      if (character === DOUBLE_QUOTE) {
        quote = null;
      } else if (character === "$" || character === BACKTICK) {
        return true;
      }
      continue;
    }
    if (character === DOUBLE_QUOTE || character === SINGLE_QUOTE) {
      quote = character;
    } else if (character === "$" || character === BACKTICK) {
      return true;
    }
  }
  return false;
}

function hasUnapprovedShellExpansion(segment, repo) {
  return containsShellExpansion(segment.slice(0, repo.sourceStart))
    || containsShellExpansion(segment.slice(repo.sourceEnd));
}

export function isValidDraftCreateOutput(output) {
  if (typeof output !== "string") return false;
  const normalized = normalizeLineContinuations(output);
  if (normalized === null) return false;
  const createSegments = extractCreateSegments(normalized);
  if (createSegments.length !== 1
    || createSegments[0].command !== normalized.trim()
    || createSegments[0].hasShellOperator) return false;
  const segment = createSegments[0].command;
  const conventionalTitle = /^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S/;
  const wipTitle = /^wip\b/i;
  const draftOptions = findUnquotedOptions(segment, "draft");
  if (draftOptions.length !== 1
    || /^\s*=/.test(segment.slice(draftOptions[0] + "--draft".length))) return false;
  const repoOptions = findUnquotedOptions(segment, "repo");
  const repo = repoOptions.length !== 1
    ? null
    : extractOptionArgument(segment, repoOptions[0], "repo");
  const title = extractArgument(segment, "title");
  const body = extractArgument(segment, "body");
  const titleValue = title?.value;
  const bodyValue = body?.value;
  return repo !== null
    && isValidRepositoryTarget(repo.value)
    && (!repo.value.startsWith("$(") || repo.quote === DOUBLE_QUOTE)
    && !hasUnapprovedShellExpansion(segment, repo)
    && title !== null
    && isSafeLiteralArgument(title)
    && titleValue !== ""
    && conventionalTitle.test(titleValue)
    && !wipTitle.test(titleValue)
    && body !== null
    && isSafeLiteralArgument(body)
    && bodyValue !== "";
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
      ? "The exact draft create command has an explicit repository, a conventional non-WIP title, and a non-empty body."
      : "No valid exact draft create command satisfies the source assertion."
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
