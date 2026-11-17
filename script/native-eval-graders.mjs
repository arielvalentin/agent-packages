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

function normalizeLineContinuations(text) {
  let normalized = "";
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote === SINGLE_QUOTE) {
      normalized += character;
      if (character === SINGLE_QUOTE) quote = null;
      continue;
    }

    const previousIndex = normalized.length - 1;
    if (quote === null && character === "#"
      && (previousIndex < 0 || /\s/.test(normalized[previousIndex]))
      && !isEscaped(normalized, previousIndex)) {
      while (index < text.length && text[index] !== "\n" && text[index] !== "\r") {
        normalized += text[index];
        index += 1;
      }
      index -= 1;
      continue;
    }

    if (character === "\\") {
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
      if ((end - index) % 2 === 1
        && [DOUBLE_QUOTE, SINGLE_QUOTE, BACKTICK].includes(text[end])) {
        normalized += text[end];
        index = end;
        continue;
      }
      index = end - 1;
      continue;
    }

    normalized += character;
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if ([DOUBLE_QUOTE, SINGLE_QUOTE, BACKTICK].includes(character)) {
      quote = character;
    }
  }
  return normalized;
}

function isEscaped(text, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function splitShellCommands(text) {
  const commands = [];
  let quote = null;
  let start = 0;
  let hasShellOperator = false;
  let hasTrailingEscape = false;
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
      if (index + 1 >= text.length) {
        hasTrailingEscape = true;
        break;
      }
      index += 1;
      continue;
    }
    if ([DOUBLE_QUOTE, SINGLE_QUOTE, BACKTICK].includes(character)) {
      quote = character;
      continue;
    }
    if (character === "#" && (index === 0 || /\s/.test(text[index - 1]))
      && !isEscaped(text, index - 1)) {
      while (index + 1 < text.length
        && text[index + 1] !== "\n"
        && text[index + 1] !== "\r") index += 1;
      continue;
    }
    if (character === "\n" || character === "\r") {
      hasShellOperator = true;
      commands.push(text.slice(start, index));
      start = index + 1;
      continue;
    }
    if (";&|<>()".includes(character)) {
      hasShellOperator = true;
      commands.push(text.slice(start, index));
      if ((character === "&" || character === "|")
        && text[index + 1] === character) index += 1;
      start = index + 1;
    }
  }
  commands.push(text.slice(start));
  return {
    commands,
    hasShellOperator,
    hasTrailingEscape,
    hasUnclosedQuote: quote !== null,
  };
}

function tokenizeShellWords(segment) {
  const words = [];
  let index = 0;
  while (index < segment.length) {
    while (/\s/.test(segment[index] || "")) index += 1;
    if (index >= segment.length || segment[index] === "#") break;

    const start = index;
    let quote = null;
    while (index < segment.length) {
      const character = segment[index];
      if (quote) {
        if (character === "\\" && quote !== SINGLE_QUOTE) {
          if (index + 1 >= segment.length) return null;
          index += 2;
        } else {
          if (character === quote) quote = null;
          index += 1;
        }
        continue;
      }
      if (character === "\\") {
        if (index + 1 >= segment.length) return null;
        index += 2;
      } else if ([DOUBLE_QUOTE, SINGLE_QUOTE, BACKTICK].includes(character)) {
        quote = character;
        index += 1;
      } else if (/\s/.test(character)) {
        break;
      } else {
        index += 1;
      }
    }
    if (quote !== null) return null;
    words.push({ raw: segment.slice(start, index), start, end: index });
  }
  return words;
}

const valueOptions = new Map([
  ["--assignee", "assignee"],
  ["--attach", "attach"],
  ["--base", "base"],
  ["--body", "body"],
  ["--body-file", "body-file"],
  ["--head", "head"],
  ["--label", "label"],
  ["--milestone", "milestone"],
  ["--project", "project"],
  ["--recover", "recover"],
  ["--repo", "repo"],
  ["--reviewer", "reviewer"],
  ["--template", "template"],
  ["--title", "title"],
  ["-R", "repo"],
  ["-a", "assignee"],
  ["-B", "base"],
  ["-b", "body"],
  ["-F", "body-file"],
  ["-H", "head"],
  ["-l", "label"],
  ["-m", "milestone"],
  ["-p", "project"],
  ["-r", "reviewer"],
  ["-t", "title"],
  ["-T", "template"],
]);

const flagOptions = new Map([
  ["--draft", "draft"],
  ["--dry-run", "dry-run"],
  ["--editor", "editor"],
  ["--fill", "fill"],
  ["--fill-first", "fill-first"],
  ["--fill-verbose", "fill-verbose"],
  ["--help", "help"],
  ["--no-maintainer-edit", "no-maintainer-edit"],
  ["--web", "web"],
  ["-d", "draft"],
  ["-e", "editor"],
  ["-f", "fill"],
  ["-h", "help"],
  ["-w", "web"],
]);

function getOptionDefinition(raw) {
  if (raw.startsWith("--")) {
    const equalsIndex = raw.indexOf("=");
    const spelling = (equalsIndex === -1 ? raw : raw.slice(0, equalsIndex))
      .toLowerCase();
    const key = valueOptions.get(spelling) ?? flagOptions.get(spelling);
    if (key === undefined) return null;
    return {
      key,
      spelling,
      takesValue: valueOptions.has(spelling),
      inline: equalsIndex !== -1,
      attached: false,
    };
  }
  if (!raw.startsWith("-") || raw.length < 2) return null;

  const spelling = raw.slice(0, 2);
  const key = valueOptions.get(spelling) ?? flagOptions.get(spelling);
  if (key === undefined) return null;
  const suffix = raw.slice(2);
  return {
    key,
    spelling,
    takesValue: valueOptions.has(spelling),
    inline: suffix.startsWith("="),
    attached: suffix !== "" && !suffix.startsWith("="),
  };
}

function extractOptionArgument(segment, optionIndex, flag, spelling = `--${flag}`) {
  let start = optionIndex + spelling.length;
  if (segment[start] === "=") {
    start += 1;
    if (/\s/.test(segment[start] || "")) return null;
  } else if (spelling.length === 2 && spelling[0] === "-"
    && !/\s/.test(segment[start] || "")) {
    // Short value options may attach their value directly to the option.
  } else {
    if (!/\s/.test(segment[start] || "")) return null;
    while (/\s/.test(segment[start] || "")) start += 1;
    if (segment[start] === "=") return null;
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
    if (next !== undefined && !/[\s;|&]/.test(next)) {
      return null;
    }
    return {
      value: segment.slice(start + 1, end).trim(),
      quote,
      sourceStart: start,
      sourceEnd: end + 1,
      raw: segment.slice(start, end + 1),
    };
  }

  let end = start;
  while (end < segment.length) {
    if (segment[end] === "\\" && end + 1 < segment.length) {
      end += 2;
    } else if (/[\s;|&]/.test(segment[end])) {
      break;
    } else {
      end += 1;
    }
  }
  return {
    value: segment.slice(start, end).trim(),
    quote: null,
    sourceStart: start,
    sourceEnd: end,
    raw: segment.slice(start, end),
  };
}

function parseDraftCreateOptions(segment) {
  const words = tokenizeShellWords(segment);
  if (!words || words.length < 3
    || words[0].raw.toLowerCase() !== "gh"
    || words[1].raw.toLowerCase() !== "pr"
    || words[2].raw.toLowerCase() !== "create") {
    return null;
  }

  const found = { repo: [], title: [], body: [], draft: [] };
  let index = 3;
  while (index < words.length) {
    const word = words[index];
    const option = getOptionDefinition(word.raw);
    if (!option) return null;

    if (!option.takesValue) {
      if (option.inline || option.attached) return null;
      if (option.key === "draft") found.draft.push(true);
      index += 1;
      continue;
    }

    let argument;
    if (option.inline || option.attached) {
      argument = extractOptionArgument(
        segment,
        word.start,
        option.key,
        option.spelling
      );
      index += 1;
    } else {
      const valueWord = words[index + 1];
      if (!valueWord || valueWord.raw === "--"
        || getOptionDefinition(valueWord.raw)
        || valueWord.raw.startsWith("-")) {
        return null;
      }
      argument = extractOptionArgument(
        segment,
        word.start,
        option.key,
        option.spelling
      );
      if (!argument || argument.sourceStart !== valueWord.start
        || argument.sourceEnd !== valueWord.end) {
        return null;
      }
      index += 2;
    }
    if (!argument || argument.value === "") return null;
    if (Object.hasOwn(found, option.key)) found[option.key].push(argument);
  }

  return found.repo.length === 1 && found.title.length === 1
      && found.body.length === 1 && found.draft.length === 1
    ? {
      repo: found.repo[0],
      title: found.title[0],
      body: found.body[0],
    }
    : null;
}

function isValidRepositoryTarget(value) {
  const target = value.trim();
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target)) {
    const [owner, repository] = target.split("/");
    return owner !== "." && owner !== ".."
      && repository !== "." && repository !== "..";
  }
  const hostTarget = /^([A-Za-z0-9.-]+)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(target);
  if (hostTarget) {
    const [, host, owner, repository] = hostTarget;
    return host !== "." && host !== ".."
      && owner !== "." && owner !== ".."
      && repository !== "." && repository !== "..";
  }
  const urlTarget = /^https:\/\/([A-Za-z0-9.-]+)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(target);
  if (urlTarget) {
    const [, host, owner, repository] = urlTarget;
    return host !== "." && host !== ".."
      && owner !== "." && owner !== ".."
      && repository !== "." && repository !== "..";
  }
  const originTarget = /^https:\/\/\$\(\s*git\s+remote\s+get-url\s+origin\s*\|\s*sed\s+-nE\s+'([^']+)'\s*\)$/.exec(target);
  if (!originTarget) return false;
  const delimiter = originTarget[1][1];
  const httpsPattern = String.raw`^(https?://|ssh://)([^/@]+@)?([A-Za-z0-9.-]+)/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$`;
  const scpPattern = String.raw`^([^/@:]+@)([A-Za-z0-9.-]+):([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$`;
  const expression = `s${delimiter}${httpsPattern}${delimiter}\\3/\\4${delimiter}p`
    + `;s${delimiter}${scpPattern}${delimiter}\\2/\\3${delimiter}p`;
  return ["#", "%"].includes(delimiter)
    && originTarget[1] === expression;
}

function isSafeLiteralArgument(argument) {
  if (argument.quote === BACKTICK) return false;
  return !containsShellExpansion(argument.raw);
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
    } else if (character === "{") {
      const end = text.indexOf("}", index + 1);
      if (end !== -1) {
        const expansion = text.slice(index + 1, end);
        if (expansion.includes(",") || expansion.includes("..")) return true;
      }
    } else if (character === "*" || character === "?" || character === "["
      || (character === "~" && index === 0)) {
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
  const commandText = normalized.trim();
  const { commands, hasShellOperator, hasTrailingEscape, hasUnclosedQuote } =
    splitShellCommands(commandText);
  if (hasUnclosedQuote || hasShellOperator || hasTrailingEscape
    || commands.length !== 1) {
    return false;
  }
  const segment = commands[0].trim();
  if (segment !== commandText
    || !/^gh\s+pr\s+create(?:\s|$)/i.test(segment)) return false;
  const conventionalTitle = /^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S/;
  const wipTitle = /^wip\b/i;
  const options = parseDraftCreateOptions(segment);
  if (!options) return false;
  const { repo, title, body } = options;
  const titleValue = title?.value;
  const bodyValue = body?.value;
  return repo !== null
    && isValidRepositoryTarget(repo.value)
    && repo.quote !== BACKTICK
    && (!repo.value.includes("$(") || repo.quote === DOUBLE_QUOTE)
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
