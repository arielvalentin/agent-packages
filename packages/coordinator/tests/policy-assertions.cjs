'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
  new Set(['author.typename.bot', 'author.typename.not-bot']),
  new Set(['chain.complete', 'chain.incomplete']),
  new Set(['chain.every-actor.bot', 'chain.any-actor.user']),
  new Set(['chain.every-actor.bot', 'chain.any-actor.unknown']),
  new Set(['item.new', 'item.existing']),
  new Set(['item.all-participants.bot', 'item.any-participant.user']),
  new Set(['item.all-participants.bot', 'item.any-participant.unknown']),
];

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
  validateStringArray(record.precedence, 'precedence', source);
  if (record.precedence.some((id) => !ID_PATTERN.test(id))) {
    throw new PolicyAssertionError('"precedence" must contain assertion IDs', source);
  }
}

function parsePolicyMarkdown(markdown, source = 'policy markdown') {
  const assertions = [];
  const references = [];
  const lines = markdown.split(/\r?\n/);
  let blockIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let referencedText = line;
    for (const match of line.matchAll(REFERENCE_PATTERN)) {
      referencedText = referencedText.replace(match[0], '');
      const trimmed = line.trim();
      const structuralLine =
        trimmed === '' ||
        /^(?:```|#{1,6}\s|[-*+]\s|\d+\.\s|>|[|])/.test(trimmed);
      let paragraphStart = index;
      let paragraphEnd = index;
      if (!structuralLine) {
        while (
          paragraphStart > 0 &&
          lines[paragraphStart - 1].trim() !== '' &&
          !/^(?:```|#{1,6}\s|[-*+]\s|\d+\.\s|>|[|])/.test(
            lines[paragraphStart - 1].trim(),
          )
        ) {
          paragraphStart -= 1;
        }
        while (
          paragraphEnd + 1 < lines.length &&
          lines[paragraphEnd + 1].trim() !== '' &&
          !/^(?:```|#{1,6}\s|[-*+]\s|\d+\.\s|>|[|])/.test(
            lines[paragraphEnd + 1].trim(),
          )
        ) {
          paragraphEnd += 1;
        }
      }
      const paragraph = lines.slice(paragraphStart, paragraphEnd + 1).join(' ');
      const markerIndex = paragraph.indexOf(match[0]);
      const beforeMarker = paragraph.slice(0, markerIndex);
      const afterMarker = paragraph.slice(markerIndex + match[0].length);
      const sentenceStart =
        Math.max(
          beforeMarker.lastIndexOf('.'),
          beforeMarker.lastIndexOf('!'),
          beforeMarker.lastIndexOf('?'),
        ) + 1;
      const sentenceEndOffsets = ['.', '!', '?']
        .map((terminator) => afterMarker.indexOf(terminator))
        .filter((offset) => offset >= 0);
      const sentenceEnd =
        sentenceEndOffsets.length === 0
          ? paragraph.length
          : markerIndex +
            match[0].length +
            Math.min(...sentenceEndOffsets) +
            1;
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
        text: paragraph.slice(sentenceStart, sentenceEnd),
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

    if (line.trim() !== '```policy-assertions') continue;

    blockIndex += 1;
    const blockSource = `${source}:policy-assertions#${blockIndex}`;
    const records = [];
    let closed = false;
    for (index += 1; index < lines.length; index += 1) {
      if (lines[index].trim() === '```') {
        closed = true;
        break;
      }
      if (lines[index].trim() === '') continue;
      records.push(
        parseJsonRecord(lines[index], `${blockSource}:line ${index + 1}`),
      );
    }
    if (!closed) {
      throw new PolicyAssertionError('unclosed policy-assertions fence', blockSource);
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

  return { assertions, references };
}

function detectLinkedContradiction(reference, assertion) {
  const remainder = reference.text.replace(reference.marker, '');
  if (reference.field === 'result') {
    const mentioned = [...ENUMS.result].filter((value) =>
      new RegExp(`\\b${value}\\b`).test(remainder),
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
    const match = remainder.match(
      /\ballowed\s*(?:=|:|\bis\b)\s*(true|false)\b/i,
    );
    if (match && (match[1].toLowerCase() === 'true') !== assertion.allowed) {
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
    return (
      assertion.conditions.length > predecessor.conditions.length &&
      predecessor.conditions.every((condition) => conditions.has(condition))
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
  assertionContractSignature,
  buildRegistry,
  compareRegistryIds,
  loadRegistry,
  parseJsonRecord,
  parsePolicyMarkdown,
};
