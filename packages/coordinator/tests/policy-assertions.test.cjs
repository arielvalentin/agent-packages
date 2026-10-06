'use strict';

const assert = require('node:assert/strict');
const {
  PolicyAssertionError,
  buildRegistry,
  compareRegistryIds,
  parsePolicyMarkdown,
} = require('./policy-assertions.cjs');
const assertHumanStopActions = require('./assert-human-stop-actions.cjs');
const assertPolicyPermission = require('./assert-policy-permission.cjs');
const assertPolicyRoute = require('./assert-policy-route.cjs');

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

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'non-subset-semantic-conflict',
        markdown: markdown(
          [
            assertion({
              id: 'test.actor.first',
              conditions: ['user.type.user', 'request.one'],
            }),
            assertion({
              id: 'test.actor.second',
              conditions: ['user.type.user', 'request.two'],
              result: 'AUTOMATION_FLOW',
              allowed: true,
            }),
          ],
          [
            '{{policy:test.actor.first.result}}',
            '{{policy:test.actor.second.result}}',
          ].join('\n'),
        ),
      },
    ]),
  PolicyAssertionError,
);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'descriptive-label-conflict',
        markdown: markdown(
          [
            assertion({ id: 'test.actor.first' }),
            assertion({
              id: 'test.actor.second',
              actor: 'rest-bot',
              provenance: 'graphql-author-type',
              result: 'AUTOMATION_FLOW',
              allowed: true,
            }),
          ],
          [
            '{{policy:test.actor.first.result}}',
            '{{policy:test.actor.second.result}}',
          ].join('\n'),
        ),
      },
    ]),
  PolicyAssertionError,
);

const mutuallyExclusiveRegistry = buildRegistry([
  {
    source: 'mutually-exclusive-decisions',
    markdown: markdown(
      [
        assertion({
          id: 'test.actor.user',
          conditions: ['explicit-multi-review.true'],
        }),
        assertion({
          id: 'test.actor.automatic',
          conditions: ['explicit-multi-review.false'],
          result: 'AUTOMATION_FLOW',
          allowed: true,
        }),
      ],
      [
        '{{policy:test.actor.user.result}}',
        '{{policy:test.actor.automatic.result}}',
      ].join('\n'),
    ),
  },
]);
assert.equal(mutuallyExclusiveRegistry.size, 2);

const escapedDuplicateKey = [
  '```policy-assertions',
  '{"format":"policy-assertions","version":1}',
  '{"id":"test.actor.user","\\u0069d":"test.actor.bot","contract":"test.contract","actor":"rest-user","provenance":"rest-user-type","interaction":"public-github","action":"classify","conditions":["user.type.user"],"result":"HUMAN_STOP","allowed":false,"precedence":[]}',
  '```',
  'Reference {{policy:test.actor.user.result}}.',
].join('\n');
assert.throws(
  () => parsePolicyMarkdown(escapedDuplicateKey, 'escaped-duplicate-key'),
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
  () => {
    const first = assertion({
      id: 'test.actor.first',
      precedence: ['test.actor.second'],
    });
    const second = assertion({
      id: 'test.actor.second',
      precedence: ['test.actor.first'],
    });
    buildRegistry([
      {
        source: 'precedence-cycle',
        markdown: markdown(
          [first, second],
          [
            '{{policy:test.actor.first.result}}',
            '{{policy:test.actor.second.result}}',
          ].join('\n'),
        ),
      },
    ]);
  },
  PolicyAssertionError,
);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'duplicate-semantic-assertion',
        markdown: markdown(
          [
            assertion({ id: 'test.actor.first' }),
            assertion({ id: 'test.actor.second' }),
          ],
          [
            '{{policy:test.actor.first.result}}',
            '{{policy:test.actor.second.result}}',
          ].join('\n'),
        ),
      },
    ]),
  PolicyAssertionError,
);

assert.throws(
  () =>
    buildRegistry([
      {
        source: 'semantic-conflict',
        markdown: markdown(
          [
            assertion({ id: 'test.actor.broad' }),
            assertion({
              id: 'test.actor.specific',
              conditions: ['user.type.user', 'app.association.present'],
              result: 'AUTOMATION_FLOW',
              allowed: true,
            }),
          ],
          [
            '{{policy:test.actor.broad.result}}',
            '{{policy:test.actor.specific.result}}',
          ].join('\n'),
        ),
      },
    ]),
  PolicyAssertionError,
);

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

const routeContext = {
  vars: {
    assertion_id: 'human-interaction.actor.rest-user',
    expected_result: 'HUMAN_STOP',
    expected_allowed: false,
  },
};
assert.equal(assertPolicyRoute('HUMAN_STOP', routeContext), true);
assert.equal(assertPolicyRoute('`HUMAN_STOP`', routeContext), false);
assert.equal(assertPolicyRoute('HUMAN_STOP.', routeContext), false);
assert.equal(
  assertPolicyRoute('Classification: HUMAN_STOP', routeContext),
  false,
);
assert.equal(assertPolicyRoute('Route token: HUMAN_STOP', routeContext), false);
assert.equal(
  assertPolicyRoute('The prose mentions HUMAN_STOP without selecting it.', routeContext),
  false,
);
assert.equal(
  assertPolicyRoute('```text\nHUMAN_STOP\n```', routeContext),
  false,
);
assert.equal(
  assertPolicyRoute('HUMAN_STOP\nAUTOMATION_FLOW', routeContext),
  false,
);
assert.equal(
  assertPolicyRoute('result: HUMAN_STOP or AUTOMATION_FLOW', routeContext),
  false,
);
assert.equal(
  assertPolicyRoute('route token is HUMAN_STOP or AUTOMATION_FLOW', routeContext),
  false,
);
assert.equal(
  assertPolicyRoute('HUMAN_STOP\nallowed=true', routeContext),
  false,
);
assert.equal(
  assertPolicyRoute('AUTOMATION_FLOW', routeContext),
  false,
);
assert.equal(
  assertPolicyRoute('HUMAN_STOP', {
    vars: {
      assertion_id: 'human-interaction.actor.rest-user',
      expected_result: 'AUTOMATION_FLOW',
      expected_allowed: false,
    },
  }),
  false,
);
assert.equal(
  assertPolicyRoute('HUMAN_STOP', {
    vars: {
      assertion_id: 'human-interaction.actor.rest-user',
      expected_result: 'HUMAN_STOP',
      expected_allowed: true,
    },
  }),
  false,
);

assert.equal(assertPolicyPermission('No', routeContext), true);
assert.equal(assertPolicyPermission('Yes', routeContext), false);
assert.equal(assertPolicyPermission('No, the agent may not act.', routeContext), false);

assert.equal(
  assertHumanStopActions(
    [
      'Classification: HUMAN_STOP',
      'Implement: No',
      'Reply: No',
      'Resolve: No',
    ].join('\n'),
  ),
  true,
);
assert.equal(
  assertHumanStopActions(
    [
      'Classification: HUMAN_STOP',
      'Implement: Yes',
      'Reply: Yes',
      'Resolve: Yes',
    ].join('\n'),
  ),
  false,
);
assert.equal(
  assertHumanStopActions(
    [
      'Classification: HUMAN_STOP',
      'Classification: AUTOMATION_FLOW',
      'Implement: No',
      'Reply: No',
      'Resolve: No',
    ].join('\n'),
  ),
  false,
);

console.log('OK: policy assertion schema and failure cases pass.');
