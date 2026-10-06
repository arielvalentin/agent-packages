'use strict';

const path = require('node:path');
const {
  ENUMS,
  assertionBoundToSkillContent,
  loadRegistry,
} = require('./policy-assertions.cjs');

const policyRoot = path.resolve(__dirname, '../.apm');
let cachedRegistry;

module.exports = (output, context) => {
  const assertionId = context?.vars?.assertion_id;
  const expectedResult = context?.vars?.expected_result;
  const expectedAllowed = context?.vars?.expected_allowed;
  const skillContent = context?.vars?.skill_content;

  if (
    typeof assertionId !== 'string' ||
    !ENUMS.result.has(expectedResult) ||
    typeof expectedAllowed !== 'boolean' ||
    !assertionBoundToSkillContent(skillContent, assertionId, 'allowed')
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

  return String(output) === (expectedAllowed ? 'Yes' : 'No');
};
