'use strict';

const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');
const {
  allowedPolicyConsumers,
} = require('./policy-assertion-consumers.cjs');

const FORMAT = 'policy-assertions';
const VERSION = 1;
const REQUIRED_FIELDS = [
  'id',
  'contract',
  'actor',
  'provenance',
  'interaction',
  'action',
  'conditions',
  'result',
  'allowed',
  'precedence',
];
const FIELD_SET = new Set(REQUIRED_FIELDS);
const REFERENCE_FIELDS = new Set(REQUIRED_FIELDS.filter((field) => field !== 'id'));

const ENUMS = {
  actor: new Set([
    'all-bot',
    'graphql-bot',
    'graphql-non-bot',
    'human-or-unknown',
    'mixed',
    'rest-bot',
    'rest-user',
    'system',
    'unknown',
  ]),
  provenance: new Set([
    'complete-chain',
    'graphql-author-type',
    'incomplete-chain',
    'classification-result',
    'policy-scope',
    'public-item',
    'rest-user-type',
    'review-handoff',
    'user-intent',
  ]),
  interaction: new Set([
    'existing-issue',
    'existing-pr',
    'policy-change',
    'public-github',
    'review-handoff',
    'security-review',
  ]),
  action: new Set([
    'classify',
    'dispatch',
    'draft',
    'fallback',
    'implement',
    'ownership',
    'post',
    'reply',
    'resolve',
    'route',
  ]),
  result: new Set([
    'ACTING_ONLY',
    'ADAPTIVE_RECOVERY',
    'AUTOMATION_FLOW',
    'CONTINUE',
    'DIRECT_HIGH_RISK_ADVERSARIAL',
    'HUMAN_INTERACTION_THEN_ACTING',
    'HUMAN_STOP',
    'PANEL_2',
    'PROHIBITED',
    'SECURITY_REVIEW_FIRST',
    'SINGLE_1',
    'STOP_INVALID_HANDOFF',
    'STOP_UNAVAILABLE',
    'USER_WRITES_REPLY_AND_RESOLVES',
  ]),
};

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const CONDITION_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const REFERENCE_PATTERN = /\{\{policy:([^}]+)\}\}/g;
const MUTUALLY_EXCLUSIVE_CONDITION_GROUPS = [
  new Set(['explicit-multi-review.true', 'explicit-multi-review.false']),
  new Set(['source.rest', 'source.graphql']),
  new Set(['scope.fast-path-eligible', 'scope.panel-required']),
  new Set([
    'capacity.initial-slots.two',
    'capacity.initial-slots.less-than-two',
  ]),
  new Set(['user.type.user', 'user.type.bot', 'user.type.missing-or-unknown']),
  new Set([
    'author.typename.bot',
    'author.typename.not-bot',
    'author.missing-or-unknown',
  ]),
  new Set(['chain.complete', 'chain.incomplete']),
  new Set(['chain.every-actor.bot', 'chain.any-actor.user']),
  new Set(['chain.every-actor.bot', 'chain.any-actor.unknown']),
  new Set(['item.new', 'item.existing']),
  new Set(['item.all-participants.bot', 'item.any-participant.user']),
  new Set(['item.all-participants.bot', 'item.any-participant.unknown']),
];
const MARKDOWN = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

class PolicyAssertionError extends Error {
  constructor(message, source = 'policy assertions') {
    super(`${source}: ${message}`);
    this.name = 'PolicyAssertionError';
  }
}

function topLevelKeys(line, source) {
  const keys = [];
  let depth = 0;
  let index = 0;

  while (index < line.length) {
    const char = line[index];
    if (char === '{' || char === '[') {
      depth += 1;
      index += 1;
      continue;
    }
    if (char === '}' || char === ']') {
      depth -= 1;
      index += 1;
      continue;
    }
    if (char !== '"') {
      index += 1;
      continue;
    }

    const start = index;
    index += 1;
    let escaped = false;
    while (index < line.length) {
      const current = line[index];
      if (escaped) {
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === '"') {
        break;
      }
      index += 1;
    }
    if (index >= line.length) {
      throw new PolicyAssertionError('unterminated JSON string', source);
    }
    index += 1;

    if (depth === 1) {
      let value;
      try {
        value = JSON.parse(line.slice(start, index));
      } catch (error) {
        throw new PolicyAssertionError(
          `malformed JSON key: ${error.message}`,
          source,
        );
      }
      let lookahead = index;
      while (/\s/.test(line[lookahead] || '')) lookahead += 1;
      if (line[lookahead] === ':') keys.push(value);
    }
  }

  return keys;
}

function parseJsonRecord(line, source) {
  const keys = topLevelKeys(line, source);
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new PolicyAssertionError(`duplicate key "${key}"`, source);
    }
    seen.add(key);
  }

  let record;
  try {
    record = JSON.parse(line);
  } catch (error) {
    throw new PolicyAssertionError(`malformed JSON: ${error.message}`, source);
  }
  if (!record || Array.isArray(record) || typeof record !== 'object') {
    throw new PolicyAssertionError('each JSONL record must be an object', source);
  }
  return record;
}

function validateStringArray(value, field, source) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new PolicyAssertionError(`"${field}" must be an array of strings`, source);
  }
}

function validateAssertion(record, source) {
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(record, field)) {
      throw new PolicyAssertionError(`missing required field "${field}"`, source);
    }
  }
  for (const field of Object.keys(record)) {
    if (!FIELD_SET.has(field)) {
      throw new PolicyAssertionError(`unknown field "${field}"`, source);
    }
  }
  if (typeof record.id !== 'string' || !ID_PATTERN.test(record.id)) {
    throw new PolicyAssertionError(`invalid assertion id "${record.id}"`, source);
  }
  if (typeof record.contract !== 'string' || !ID_PATTERN.test(record.contract)) {
    throw new PolicyAssertionError(`invalid contract "${record.contract}"`, source);
  }
  for (const field of ['actor', 'provenance', 'interaction', 'action', 'result']) {
    if (!ENUMS[field].has(record[field])) {
      throw new PolicyAssertionError(`unknown ${field} enum "${record[field]}"`, source);
    }
  }
  if (typeof record.allowed !== 'boolean') {
    throw new PolicyAssertionError('"allowed" must be boolean', source);
  }
  validateStringArray(record.conditions, 'conditions', source);
  if (
    record.conditions.length === 0 ||
    record.conditions.some((condition) => !CONDITION_PATTERN.test(condition))
  ) {
    throw new PolicyAssertionError('"conditions" must contain stable condition IDs', source);
  }
  const conditionSet = new Set(record.conditions);
  if (conditionSet.size !== record.conditions.length) {
    throw new PolicyAssertionError('"conditions" must not contain duplicates', source);
  }
  for (const group of MUTUALLY_EXCLUSIVE_CONDITION_GROUPS) {
    const matches = record.conditions.filter((condition) => group.has(condition));
    if (matches.length > 1) {
      throw new PolicyAssertionError(
        `"conditions" contains mutually exclusive values: ${matches.join(', ')}`,
        source,
      );
    }
  }
  validateStringArray(record.precedence, 'precedence', source);
  if (record.precedence.some((id) => !ID_PATTERN.test(id))) {
    throw new PolicyAssertionError('"precedence" must contain assertion IDs', source);
  }
}

function stripBlockquotePrefixes(line) {
  let stripped = line;
  while (/^ {0,3}>\s?/.test(stripped)) {
    stripped = stripped.replace(/^ {0,3}>\s?/, '');
  }
  return stripped;
}

function semanticMarkdownLine(line) {
  let semantic = stripBlockquotePrefixes(line);
  while (/^\s*(?:[-*+]|\d+[.)])\s+/.test(semantic)) {
    semantic = semantic.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
  }
  return semantic;
}

function nthIndexOf(text, needle, occurrence) {
  let index = -1;
  let from = 0;
  for (let count = 0; count <= occurrence; count += 1) {
    index = text.indexOf(needle, from);
    if (index < 0) return -1;
    from = index + needle.length;
  }
  return index;
}

function rangeContains(range, line) {
  return range && range[0] <= line && line < range[1];
}

function normalizedFenceLine(line) {
  return stripBlockquotePrefixes(line).trim();
}

function fenceIsClosed(token, lines) {
  if (token.map[1] - token.map[0] < 2) return false;
  const closing = normalizedFenceLine(lines[token.map[1] - 1] || '');
  const escaped = token.markup[0] === '`' ? '`' : '~';
  return new RegExp(`^${escaped}{${token.markup.length},}\\s*$`).test(
    closing,
  );
}

function uniqueTextRanges(tokens) {
  const seen = new Set();
  return tokens
    .filter(
      (token) =>
        token.map &&
        !['fence', 'code_block'].includes(token.type) &&
        !token.type.endsWith('_close'),
    )
    .map((token) => ({
      start: token.map[0],
      end: token.map[1],
      inline: token.type === 'inline',
    }))
    .sort(
      (left, right) =>
        left.end - left.start - (right.end - right.start) ||
        Number(right.inline) - Number(left.inline) ||
        left.start - right.start,
    )
    .filter((range) => {
      const key = `${range.start}:${range.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function linkedTextRange(tokens, textRanges, lines, line) {
  const base =
    textRanges.find((range) => rangeContains([range.start, range.end], line)) ||
    { start: line, end: line + 1 };
  const container = tokens
    .filter(
      (token) =>
        token.map &&
        ['list_item_open', 'blockquote_open'].includes(token.type) &&
        rangeContains(token.map, line),
    )
    .sort(
      (left, right) =>
        left.map[1] - left.map[0] - (right.map[1] - right.map[0]),
    )[0];
  if (!container) return base;

  let linkedStart = base.start;
  const previous = textRanges
    .filter(
      (range) =>
        range.end <= base.start &&
        range.start >= container.map[0] &&
        range.end <= container.map[1],
    )
    .sort((left, right) => right.end - left.end)[0];
  if (
    previous &&
    lines
      .slice(previous.end, base.start)
      .every((candidate) => semanticMarkdownLine(candidate).trim() === '')
  ) {
    linkedStart = previous.start;
  }

  const next = textRanges
    .filter(
      (range) =>
        range.start >= base.end &&
        range.start < container.map[1] &&
        range.end <= container.map[1],
    )
    .sort((left, right) => left.start - right.start)[0];
  if (!next) return { start: linkedStart, end: base.end };
  const betweenIsEmpty = lines
    .slice(base.end, next.start)
    .every((candidate) => semanticMarkdownLine(candidate).trim() === '');
  const nextText = lines
    .slice(next.start, next.end)
    .map(semanticMarkdownLine)
    .join(' ')
    .trim();
  if (
    !betweenIsEmpty ||
    !/^(?:But|However|Instead|Yet)\b/i.test(nextText)
  ) {
    return { start: linkedStart, end: base.end };
  }
  return { start: linkedStart, end: next.end };
}

function parsePolicyMarkdown(markdown, source = 'policy markdown') {
  const assertions = [];
  const references = [];
  const lines = markdown.split(/\r?\n/);
  const tokens = MARKDOWN.parse(markdown, {});
  const textRanges = uniqueTextRanges(tokens);
  const codeRanges = tokens
    .filter((token) => token.map && ['fence', 'code_block'].includes(token.type))
    .map((token) => token.map);
  let blockIndex = 0;

  for (const token of tokens.filter((candidate) => candidate.type === 'fence')) {
    if (!fenceIsClosed(token, lines)) {
      throw new PolicyAssertionError(
        'unclosed non-policy fence',
        `${source}:line ${token.map[0] + 1}`,
      );
    }
    if (lines[token.map[0]] !== '```policy-assertions') continue;

    blockIndex += 1;
    const blockSource = `${source}:policy-assertions#${blockIndex}`;
    const records = [];
    for (
      let recordIndex = token.map[0] + 1;
      recordIndex < token.map[1] - 1;
      recordIndex += 1
    ) {
      if (lines[recordIndex].trim() === '') continue;
      records.push(
        parseJsonRecord(
          lines[recordIndex],
          `${blockSource}:line ${recordIndex + 1}`,
        ),
      );
    }
    if (records.length < 2) {
      throw new PolicyAssertionError(
        'block requires one header and at least one assertion',
        blockSource,
      );
    }

    const [header, ...blockAssertions] = records;
    const headerKeys = Object.keys(header).sort().join(',');
    if (
      headerKeys !== 'format,version' ||
      header.format !== FORMAT ||
      header.version !== VERSION
    ) {
      throw new PolicyAssertionError(
        `header must be {"format":"${FORMAT}","version":${VERSION}}`,
        blockSource,
      );
    }
    for (const assertion of blockAssertions) {
      validateAssertion(assertion, blockSource);
      assertions.push({ ...assertion, source });
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (codeRanges.some((range) => rangeContains(range, index))) continue;
    const line = lines[index];
    let referencedText = line;
    for (const match of line.matchAll(REFERENCE_PATTERN)) {
      referencedText = referencedText.replace(match[0], '');
      const linkedRange = linkedTextRange(tokens, textRanges, lines, index);
      const paragraphStart = linkedRange.start;
      const paragraphEnd = linkedRange.end - 1;
      const paragraph = lines
        .slice(paragraphStart, paragraphEnd + 1)
        .map(semanticMarkdownLine)
        .join(' ');
      const markerOccurrence =
        line.slice(0, match.index).split(match[0]).length - 1;
      const markerIndex =
        lines
          .slice(paragraphStart, index)
          .map(semanticMarkdownLine)
          .reduce((offset, paragraphLine) => offset + paragraphLine.length + 1, 0) +
        nthIndexOf(
          semanticMarkdownLine(line),
          match[0],
          markerOccurrence,
        );
      const beforeMarker = paragraph.slice(0, markerIndex);
      const afterMarker = paragraph.slice(markerIndex + match[0].length);
      let sentenceStart = 0;
      for (const terminator of beforeMarker.matchAll(/[.!?](?=\s|$)/g)) {
        sentenceStart = terminator.index + 1;
      }
      const sentenceEndMatch = afterMarker.match(/[.!?](?=\s|$)/);
      const sentenceEnd =
        sentenceEndMatch === null
          ? paragraph.length
          : markerIndex +
            match[0].length +
            sentenceEndMatch.index +
            sentenceEndMatch[0].length;
      let linkedEnd = sentenceEnd;
      const contrast = paragraph
        .slice(sentenceEnd)
        .match(/^\s*(?:But|However|Instead|Yet)\b/i);
      if (contrast) {
        const contrastedText = paragraph.slice(sentenceEnd + contrast[0].length);
        const contrastedEnd = contrastedText.match(/[.!?](?=\s|$)/);
        linkedEnd =
          contrastedEnd === null
            ? paragraph.length
            : sentenceEnd +
              contrast[0].length +
              contrastedEnd.index +
              contrastedEnd[0].length;
      }
      const parsedReference = match[1].match(
        /^([a-z][a-z0-9]*(?:[.-][a-z0-9]+)+)\.([a-z_]+)$/,
      );
      if (!parsedReference) {
        throw new PolicyAssertionError(
          `malformed policy reference "${match[0]}"`,
          `${source}:line ${index + 1}`,
        );
      }
      references.push({
        id: parsedReference[1],
        field: parsedReference[2],
        line: index + 1,
        text: paragraph.slice(sentenceStart, linkedEnd),
        marker: match[0],
        source,
      });
    }
    if (referencedText.includes('{{policy:')) {
      throw new PolicyAssertionError(
        'unterminated policy reference',
        `${source}:line ${index + 1}`,
      );
    }
  }

  return { assertions, references };
}

function detectLinkedContradiction(reference, assertion) {
  const remainder = reference.text.replace(reference.marker, '');
  if (reference.field === 'result') {
    const mentioned = [...ENUMS.result].filter((value) =>
      new RegExp(`\\b${value}\\b`, 'i').test(remainder),
    );
    const conflicts = mentioned.filter((value) => value !== assertion.result);
    if (conflicts.length > 0) {
      throw new PolicyAssertionError(
        `linked result contradicts "${reference.id}": ${conflicts.join(', ')}`,
        `${reference.source}:line ${reference.line}`,
      );
    }
  }
  if (reference.field === 'allowed') {
    const matches = [
      ...remainder.matchAll(
        /\ballowed\s*(?:=|:|\bis\b)\s*(true|false)\b/gi,
      ),
    ];
    if (
      matches.some(
        (match) => (match[1].toLowerCase() === 'true') !== assertion.allowed,
      )
    ) {
      throw new PolicyAssertionError(
        `linked allowed value contradicts "${reference.id}"`,
        `${reference.source}:line ${reference.line}`,
      );
    }
  }
}

function buildRegistry(documents) {
  const registry = new Map();
  const references = [];

  for (const document of documents) {
    const parsed = parsePolicyMarkdown(document.markdown, document.source);
    for (const assertion of parsed.assertions) {
      if (registry.has(assertion.id)) {
        throw new PolicyAssertionError(
          `duplicate assertion id "${assertion.id}"`,
          assertion.source,
        );
      }
      registry.set(assertion.id, assertion);
    }
    references.push(...parsed.references);
  }

  for (const assertion of registry.values()) {
    for (const predecessor of assertion.precedence) {
      if (!registry.has(predecessor)) {
        throw new PolicyAssertionError(
          `unknown precedence assertion "${predecessor}"`,
          assertion.source,
        );
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visitPrecedence(id) {
    if (visiting.has(id)) {
      throw new PolicyAssertionError(
        `precedence cycle includes "${id}"`,
        registry.get(id).source,
      );
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const predecessor of registry.get(id).precedence) {
      visitPrecedence(predecessor);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of registry.keys()) visitPrecedence(id);

  function precedes(assertion, predecessorId, seen = new Set()) {
    if (assertion.precedence.includes(predecessorId)) return true;
    if (seen.has(assertion.id)) return false;
    seen.add(assertion.id);
    return assertion.precedence.some((id) =>
      precedes(registry.get(id), predecessorId, seen),
    );
  }

  function isStrictConditionSuperset(assertion, predecessor) {
    const conditions = new Set(assertion.conditions);
    const predecessorConditions = new Set(predecessor.conditions);
    return (
      conditions.size > predecessorConditions.size &&
      [...predecessorConditions].every((condition) => conditions.has(condition))
    );
  }

  const assertions = [...registry.values()];
  for (let leftIndex = 0; leftIndex < assertions.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < assertions.length;
      rightIndex += 1
    ) {
      const left = assertions[leftIndex];
      const right = assertions[rightIndex];
      const sameSurface = ['contract', 'interaction', 'action']
        .every((field) => left[field] === right[field]);
      if (!sameSurface) continue;

      const rightConditions = new Set(right.conditions);
      const sameConditions =
        left.conditions.length === right.conditions.length &&
        left.conditions.every((condition) => rightConditions.has(condition));
      const sameDecision =
        left.result === right.result && left.allowed === right.allowed;
      if (sameConditions && sameDecision) {
        throw new PolicyAssertionError(
          `duplicate semantic assertions "${left.id}" and "${right.id}"`,
          right.source,
        );
      }

      const mutuallyExclusive = MUTUALLY_EXCLUSIVE_CONDITION_GROUPS.some(
        (group) =>
          left.conditions.some((condition) => group.has(condition)) &&
          right.conditions.some((condition) => group.has(condition)) &&
          !left.conditions.some(
            (condition) =>
              group.has(condition) && rightConditions.has(condition),
          ),
      );
      if (
        !sameDecision &&
        !mutuallyExclusive &&
        !(
          precedes(left, right.id) &&
          isStrictConditionSuperset(left, right)
        ) &&
        !(
          precedes(right, left.id) &&
          isStrictConditionSuperset(right, left)
        )
      ) {
        throw new PolicyAssertionError(
          `conflicting assertions "${left.id}" and "${right.id}" lack valid specific-over-broad precedence`,
          right.source,
        );
      }
    }
  }

  const referencedIds = new Set();
  for (const reference of references) {
    const assertion = registry.get(reference.id);
    if (!assertion) {
      throw new PolicyAssertionError(
        `unknown policy reference "${reference.id}"`,
        `${reference.source}:line ${reference.line}`,
      );
    }
    if (!REFERENCE_FIELDS.has(reference.field)) {
      throw new PolicyAssertionError(
        `unknown policy reference field "${reference.field}"`,
        `${reference.source}:line ${reference.line}`,
      );
    }
    referencedIds.add(reference.id);
    detectLinkedContradiction(reference, assertion);
  }

  for (const assertion of registry.values()) {
    if (!referencedIds.has(assertion.id)) {
      throw new PolicyAssertionError(
        `assertion "${assertion.id}" has no prose or test reference`,
        assertion.source,
      );
    }
  }

  return registry;
}

function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function loadRegistry(directory) {
  const documents = collectMarkdownFiles(directory).map((file) => ({
    source: file,
    markdown: fs.readFileSync(file, 'utf8'),
  }));
  return buildRegistry(documents);
}

function assertionBoundToSkillContent(
  skillContent,
  assertionId,
  field,
  consumerPath,
) {
  if (
    typeof skillContent !== 'string' ||
    typeof assertionId !== 'string' ||
    !REFERENCE_FIELDS.has(field) ||
    typeof consumerPath !== 'string'
  ) {
    return false;
  }
  const allowedConsumers = allowedPolicyConsumers(assertionId);
  if (!allowedConsumers.has(consumerPath)) return false;
  let content = skillContent;
  const file = path.resolve(
    __dirname,
    consumerPath.slice('file://'.length),
  );
  const policyRoot = path.resolve(__dirname, '../.apm');
  if (
    !file.startsWith(`${policyRoot}${path.sep}`) ||
    !fs.existsSync(file)
  ) {
    return false;
  }
  const fileContent = fs.readFileSync(file, 'utf8');
  if (content.startsWith('file://')) {
    if (content !== consumerPath) return false;
    content = fileContent;
  } else if (fileContent.trimEnd() !== content.trimEnd()) {
    return false;
  }
  try {
    const parsed = parsePolicyMarkdown(content, 'assertion-bound skill content');
    return (
      parsed.assertions.some((assertion) => assertion.id === assertionId) ||
      parsed.references.some(
        (reference) =>
          reference.id === assertionId && reference.field === field,
      )
    );
  } catch (error) {
    if (error instanceof PolicyAssertionError) return false;
    throw error;
  }
}

function compareRegistryIds(registry, requiredIds) {
  const actualIds = [...registry.keys()].sort();
  return {
    missing: requiredIds.filter((id) => !registry.has(id)),
    unexpected: actualIds.filter((id) => !requiredIds.includes(id)),
  };
}

function assertionContractSignature(assertion) {
  return JSON.stringify({
    contract: assertion.contract,
    actor: assertion.actor,
    provenance: assertion.provenance,
    interaction: assertion.interaction,
    action: assertion.action,
    conditions: assertion.conditions,
    precedence: assertion.precedence,
  });
}

module.exports = {
  ENUMS,
  PolicyAssertionError,
  assertionBoundToSkillContent,
  assertionContractSignature,
  buildRegistry,
  compareRegistryIds,
  loadRegistry,
  parseJsonRecord,
  parsePolicyMarkdown,
};
