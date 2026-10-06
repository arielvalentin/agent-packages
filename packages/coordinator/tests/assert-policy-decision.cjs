'use strict';

const path = require('node:path');
const {
  PolicyAssertionError,
  loadRegistry,
  parseJsonRecord,
} = require('./policy-assertions.cjs');

function extractJsonObjects(output) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth < 0) return [];
      if (depth === 0 && start >= 0) {
        objects.push(output.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return depth === 0 && !inString ? objects : [];
}

function extractLabeledDecision(output) {
  const values = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:[-*]\s*)?(?:`|["'])?(assertion_id|result|allowed)(?:`|["'])?\s*:\s*(?:`|["'])?([^`"']+?)(?:`|["'])?\s*[,.]?\s*$/i,
    );
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (values.has(key)) return null;
    values.set(key, match[2].trim());
  }
  if (values.size !== 3) return null;
  const allowed = values.get('allowed').toLowerCase();
  if (allowed !== 'true' && allowed !== 'false') return null;
  return {
    assertion_id: values.get('assertion_id'),
    result: values.get('result'),
    allowed: allowed === 'true',
  };
}

module.exports = (output, context) => {
  const assertionId = context?.vars?.assertion_id;
  if (typeof assertionId !== 'string') return false;

  const policyRoot = path.resolve(__dirname, '../.apm');
  const assertion = loadRegistry(policyRoot).get(assertionId);
  if (!assertion) return false;

  const objects = extractJsonObjects(output);
  if (objects.length > 1) return false;

  const candidates = [];
  for (const object of objects) {
    try {
      const parsed = parseJsonRecord(object, 'Promptfoo policy decision');
      if (
        Object.keys(parsed).sort().join(',') ===
        'allowed,assertion_id,result'
      ) {
        candidates.push(parsed);
      }
    } catch (error) {
      if (error instanceof PolicyAssertionError) return false;
      throw error;
    }
  }
  if (objects.length === 1 && candidates.length !== 1) return false;
  const decision =
    candidates.length === 1 ? candidates[0] : extractLabeledDecision(output);

  if (
    !decision ||
    Array.isArray(decision) ||
    typeof decision !== 'object'
  ) {
    return false;
  }

  return (
    decision.assertion_id === assertion.id &&
    decision.result === assertion.result &&
    decision.allowed === assertion.allowed
  );
};
