'use strict';

const path = require('node:path');
const {
  ENUMS,
  assertionBoundToSkillContent,
  loadRegistry,
} = require('./policy-assertions.cjs');

const policyRoot = path.resolve(__dirname, '../.apm');
let cachedRegistry;

function selectedResult(output) {
  const text = String(output);
  const results = [...text.matchAll(/\b[A-Z][A-Z_]+\b/g)]
    .map(([token]) => token)
    .filter((token) => ENUMS.result.has(token));
  const uniqueResults = [...new Set(results)];

  if (uniqueResults.length !== 1) {
    return null;
  }

  const result = uniqueResults[0];
  const escapedResult = result.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wrappedResult = `(?:[\`"']|\\*{1,2})?${escapedResult}(?:[\`"']|\\*{1,2})?`;
  const nonemptyLines = text.split(/\r?\n/).filter((line) => line.trim());
  const finalLine = nonemptyLines.at(-1) || '';

  if (new RegExp(`^\\s*${wrappedResult}[.!]?\\s*$`).test(finalLine)) {
    return result;
  }

  if (
    new RegExp(
      `\\brespond\\s+with\\s+(?:the\\s+)?(?:route\\s+)?token\\s+${wrappedResult}[.!]?\\s*$`,
      'i',
    ).test(text)
  ) {
    return result;
  }

  if (
    new RegExp(
      `\\b(?:classification|route\\s+token|result)\\s*[:=]\\s*${wrappedResult}[.!]?\\s*$`,
      'i',
    ).test(text)
  ) {
    return result;
  }

  return null;
}

module.exports = (output, context) => {
  const assertionId = context?.vars?.assertion_id;
  const expectedResult = context?.vars?.expected_result;
  const expectedAllowed = context?.vars?.expected_allowed;
  const skillContent = context?.vars?.skill_content;
  const consumerPath = context?.test?.vars?.skill_content;

  if (
    typeof assertionId !== 'string' ||
    !ENUMS.result.has(expectedResult) ||
    typeof expectedAllowed !== 'boolean' ||
    !assertionBoundToSkillContent(
      skillContent,
      assertionId,
      'result',
      consumerPath,
    )
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

  return selectedResult(output) === expectedResult;
};
