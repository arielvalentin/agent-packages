'use strict';

const path = require('node:path');
const { ENUMS, loadRegistry } = require('./policy-assertions.cjs');

const policyRoot = path.resolve(__dirname, '../.apm');
let cachedRegistry;

function selectedResults(output) {
  const values = [...ENUMS.result].sort((left, right) => right.length - left.length);
  const alternatives = values.join('|');
  const selected = [];
  const unfencedOutput = String(output).replace(/```[\s\S]*?```/g, '');

  for (const line of unfencedOutput.split(/\r?\n/)) {
    const normalized = line
      .trim()
      .replace(/^[-*]\s+/, '')
      .replace(/^`+|`+$/g, '')
      .replace(/[.!]$/, '');
    if (ENUMS.result.has(normalized)) selected.push(normalized);
  }

  const labeledPatterns = [
    new RegExp(
      `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:classification|result|route token|entry result|permission result token)\\s*:\\s*\`?(${alternatives})\`?`,
      'gi',
    ),
    new RegExp(
      `\\b(?:route|result|permission result) token(?:\\s+for[^:\\n]+)?\\s+is\\s*:?\\s*\`?(${alternatives})\`?`,
      'gi',
    ),
  ];
  for (const pattern of labeledPatterns) {
    for (const match of unfencedOutput.matchAll(pattern)) {
      selected.push(match[1].toUpperCase());
    }
  }

  return selected;
}

module.exports = (output, context) => {
  const assertionId = context?.vars?.assertion_id;
  const expectedResult = context?.vars?.expected_result;
  const expectedAllowed = context?.vars?.expected_allowed;

  if (
    typeof assertionId !== 'string' ||
    !ENUMS.result.has(expectedResult) ||
    typeof expectedAllowed !== 'boolean'
  ) {
    return false;
  }

  cachedRegistry ||= loadRegistry(policyRoot);
  const assertion = cachedRegistry.get(assertionId);
  if (
    !assertion ||
    assertion.result !== expectedResult ||
    assertion.allowed !== expectedAllowed
  ) {
    return false;
  }

  const selected = selectedResults(output);
  return (
    selected.length > 0 &&
    selected.every((result) => result === expectedResult)
  );
};
