'use strict';

const path = require('node:path');
const { ENUMS, loadRegistry } = require('./policy-assertions.cjs');

const policyRoot = path.resolve(__dirname, '../.apm');
let cachedRegistry;

function exactResult(output) {
  const text = String(output);
  return ENUMS.result.has(text) ? text : null;
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

  return exactResult(output) === expectedResult;
};
