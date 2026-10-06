'use strict';

const assert = require('node:assert/strict');
const {
  PolicyAssertionError,
  buildRegistry,
  compareRegistryIds,
  parsePolicyMarkdown,
} = require('./policy-assertions.cjs');
const assertPolicyDecision = require('./assert-policy-decision.cjs');

const assertion = (overrides = {}) => ({
  id: 'test.actor.user',
  contract: 'test.contract',
  actor: 'rest-user',
  provenance: 'rest-user-type',
  interaction: 'public-github',
  action: 'classify',
  conditions: ['user.type.user'],
  result: 'HUMAN_STOP',
  allowed: false,
  precedence: [],
  ...overrides,
});

const markdown = (records, prose = '') =>
  [
    '```policy-assertions',
    '{"format":"policy-assertions","version":1}',
    ...records.map((record) => JSON.stringify(record)),
    '```',
    prose,
  ].join('\n');

const valid = markdown(
  [assertion()],
  'Route with {{policy:test.actor.user.result}} and allowed={{policy:test.actor.user.allowed}}.',
);

assert.equal(parsePolicyMarkdown(valid, 'valid').assertions.length, 1);
assert.equal(
  buildRegistry([{ source: 'valid', markdown: valid }]).get('test.actor.user').result,
  'HUMAN_STOP',
);
assert.deepEqual(
  compareRegistryIds(
    buildRegistry([{ source: 'valid', markdown: valid }]),
    ['test.actor.user', 'test.actor.missing'],
  ),
  { missing: ['test.actor.missing'], unexpected: [] },
);

for (const prose of [
  'Short prose {{policy:test.actor.user.result}}.',
  'Long explanation with punctuation, examples, and caveats {{policy:test.actor.user.result}}.',
  'The wording can mention automation generically without changing {{policy:test.actor.user.result}}.',
  'You may not reply. {{policy:test.actor.user.result}}.',
  'Reply is forbidden. {{policy:test.actor.user.result}}.',
  'Reply can be posted by the assistant. {{policy:test.actor.user.result}}.',
  'Do not reject the selected route. {{policy:test.actor.user.result}}.',
  'Approval and authorization wording does not select the route. {{policy:test.actor.user.result}}.',
  'A human operator owns the response. {{policy:test.actor.user.result}}.',
]) {
  const registry = buildRegistry([
    { source: 'phrase-variant', markdown: markdown([assertion()], prose) },
  ]);
  assert.equal(registry.get('test.actor.user').result, 'HUMAN_STOP');
}

const failures = [
  ['missing field', assertion({ precedence: undefined })],
  ['unknown enum', assertion({ result: 'MAYBE' })],
  ['invalid allowed', assertion({ allowed: 'false' })],
  ['unknown precedence', assertion({ precedence: ['missing.assertion'] })],
];

for (const [name, record] of failures) {
  const clean = Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
  assert.throws(
    () =>
      buildRegistry([
        {
          source: name,
          markdown: markdown(
            [clean],
            'Reference {{policy:test.actor.user.result}}.',
          ),
        },
      ]),
    PolicyAssertionError,
  );
}

const duplicateKey = [
  '```policy-assertions',
  '{"format":"policy-assertions","version":1}',
  '{"id":"test.actor.user","id":"test.actor.bot","contract":"test.contract","actor":"rest-user","provenance":"rest-user-type","interaction":"public-github","action":"classify","conditions":["user.type.user"],"result":"HUMAN_STOP","allowed":false,"precedence":[]}',
  '```',
  'Reference {{policy:test.actor.user.result}}.',
].join('\n');
assert.throws(
  () => parsePolicyMarkdown(duplicateKey, 'duplicate-key'),
  PolicyAssertionError,
);

const duplicateId = buildRegistry.bind(null, [
  {
    source: 'first',
    markdown: markdown(
      [assertion()],
      'Reference {{policy:test.actor.user.result}}.',
    ),
  },
  {
    source: 'second',
    markdown: markdown(
      [assertion({ result: 'AUTOMATION_FLOW', allowed: true })],
      'Reference {{policy:test.actor.user.result}}.',
    ),
  },
]);
assert.throws(duplicateId, PolicyAssertionError);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'malformed',
        markdown: [
          '```policy-assertions',
          '{"format":"policy-assertions","version":1}',
          '{"id":',
          '```',
        ].join('\n'),
      },
    ]),
  PolicyAssertionError,
);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'malformed-reference',
        markdown: markdown(
          [assertion()],
          'Reference {{policy:test actor user.result}}.',
        ),
      },
    ]),
  PolicyAssertionError,
);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'unterminated-reference',
        markdown: markdown(
          [assertion()],
          'Reference {{policy:test.actor.user.result.',
        ),
      },
    ]),
  PolicyAssertionError,
);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'unknown-reference',
        markdown: markdown(
          [assertion()],
          'Reference {{policy:test.actor.missing.result}}.',
        ),
      },
    ]),
  PolicyAssertionError,
);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'unknown-reference-field',
        markdown: markdown(
          [assertion()],
          'Reference {{policy:test.actor.user.outcome}}.',
        ),
      },
    ]),
  PolicyAssertionError,
);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'contradiction',
        markdown: markdown(
          [assertion()],
          '{{policy:test.actor.user.result}} but AUTOMATION_FLOW.',
        ),
      },
    ]),
  PolicyAssertionError,
);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'missing-reference',
        markdown: markdown([assertion()]),
      },
    ]),
  PolicyAssertionError,
);

const decisionContext = {
  vars: { assertion_id: 'human-interaction.actor.rest-user' },
};
const decision =
  '{"assertion_id":"human-interaction.actor.rest-user","result":"HUMAN_STOP","allowed":false}';
assert.equal(assertPolicyDecision(decision, decisionContext), true);
assert.equal(
  assertPolicyDecision(`\`\`\`json\n${decision}\n\`\`\``, decisionContext),
  true,
);
assert.equal(
  assertPolicyDecision(`Canonical decision:\n${decision}`, decisionContext),
  true,
);
assert.equal(
  assertPolicyDecision(
    [
      'Canonical decision:',
      '* `assertion_id`: `human-interaction.actor.rest-user`',
      '* `result`: `HUMAN_STOP`',
      '* `allowed`: `false`',
    ].join('\n'),
    decisionContext,
  ),
  true,
);
assert.equal(
  assertPolicyDecision(`${decision}\n${decision}`, decisionContext),
  false,
);
assert.equal(
  assertPolicyDecision(
    `${decision}\n{"note":"second structured object"}`,
    decisionContext,
  ),
  false,
);
assert.equal(
  assertPolicyDecision(
    '{"assertion_id":"human-interaction.actor.rest-user","result":"HUMAN_STOP","allowed":false,"allowed":true}',
    decisionContext,
  ),
  false,
);

console.log('OK: policy assertion schema and failure cases pass.');
