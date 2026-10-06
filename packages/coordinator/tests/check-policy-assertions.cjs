'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  compareRegistryIds,
  loadRegistry,
} = require('./policy-assertions.cjs');

const repositoryRoot = path.resolve(__dirname, '../../..');
const policyRoot = path.join(repositoryRoot, 'packages/coordinator/.apm');
const promptfooConfig = path.join(
  repositoryRoot,
  'packages/coordinator/tests/promptfooconfig.yaml',
);

const expectedAssertions = new Map(
  Object.entries({
    'consensus.automatic.initial-failure': ['ADAPTIVE_RECOVERY', true],
    'consensus.automatic.single': ['SINGLE_1', true],
    'consensus.automatic.unavailable': ['ADAPTIVE_RECOVERY', true],
    'consensus.explicit.initial-failure': ['STOP_UNAVAILABLE', false],
    'consensus.explicit.panel': ['PANEL_2', true],
    'consensus.explicit.under-capacity': ['STOP_UNAVAILABLE', false],
    'consensus.handoff.invalid': ['STOP_INVALID_HANDOFF', false],
    'coordinator.policy.high-risk': ['DIRECT_HIGH_RISK_ADVERSARIAL', true],
    'coordinator.public.existing-item': [
      'HUMAN_INTERACTION_THEN_ACTING',
      true,
    ],
    'coordinator.public.new-item': ['ACTING_ONLY', true],
    'coordinator.security.explicit-vulnerability': [
      'SECURITY_REVIEW_FIRST',
      true,
    ],
    'human-interaction.action.human-stop.draft': ['PROHIBITED', false],
    'human-interaction.action.human-stop.implement': ['PROHIBITED', false],
    'human-interaction.action.human-stop.post': ['PROHIBITED', false],
    'human-interaction.action.human-stop.reply': ['PROHIBITED', false],
    'human-interaction.action.human-stop.resolve': ['PROHIBITED', false],
    'human-interaction.actor.graphql-bot': ['AUTOMATION_FLOW', true],
    'human-interaction.actor.graphql-non-bot': ['HUMAN_STOP', false],
    'human-interaction.actor.rest-bot': ['AUTOMATION_FLOW', true],
    'human-interaction.actor.rest-unknown': ['HUMAN_STOP', false],
    'human-interaction.actor.rest-user': ['HUMAN_STOP', false],
    'human-interaction.chain.all-bot': ['AUTOMATION_FLOW', true],
    'human-interaction.chain.any-human': ['HUMAN_STOP', false],
    'human-interaction.chain.any-unknown': ['HUMAN_STOP', false],
    'human-interaction.chain.incomplete': ['HUMAN_STOP', false],
    'human-interaction.existing-issue.all-bot': ['AUTOMATION_FLOW', true],
    'human-interaction.existing-issue.any-human': ['HUMAN_STOP', false],
    'human-interaction.existing-issue.any-unknown': ['HUMAN_STOP', false],
    'human-interaction.existing-item.all-bot': ['AUTOMATION_FLOW', true],
    'human-interaction.existing-item.any-human': ['HUMAN_STOP', false],
    'human-interaction.existing-item.any-unknown': ['HUMAN_STOP', false],
    'human-interaction.ownership.human-stop': [
      'USER_WRITES_REPLY_AND_RESOLVES',
      true,
    ],
    'human-interaction.provenance.user-with-app': ['HUMAN_STOP', false],
  }),
);
const requiredIds = [...expectedAssertions.keys()];

const requiredPromptfooIds = requiredIds;

const registry = loadRegistry(policyRoot);
const { missing, unexpected } = compareRegistryIds(registry, requiredIds);

if (missing.length > 0 || unexpected.length > 0) {
  if (missing.length > 0) {
    console.error(`Missing required policy assertions: ${missing.join(', ')}`);
  }
  if (unexpected.length > 0) {
    console.error(
      `Unregistered policy assertions require manifest review: ${unexpected.join(', ')}`,
    );
  }
  process.exit(1);
}

for (const [id, [expectedResult, expectedAllowed]] of expectedAssertions) {
  const assertion = registry.get(id);
  if (
    assertion.result !== expectedResult ||
    assertion.allowed !== expectedAllowed
  ) {
    console.error(
      `${id} expected result=${expectedResult}, allowed=${expectedAllowed}; ` +
        `received result=${assertion.result}, allowed=${assertion.allowed}`,
    );
    process.exit(1);
  }
}

const promptfoo = fs.readFileSync(promptfooConfig, 'utf8');
const promptfooTests = promptfoo.split(/\n(?=  - description: ")/);
for (const id of requiredPromptfooIds) {
  const [expectedResult, expectedAllowed] = expectedAssertions.get(id);
  const markers = [
    `assertion_id: "${id}"`,
    `expected_result: "${expectedResult}"`,
    `expected_allowed: ${expectedAllowed}`,
  ];
  const coverage = promptfooTests.find(
    (test) =>
      markers.every((marker) => test.includes(marker)) &&
      /[&*]policy_(?:route|permission)/.test(test),
  );
  if (!coverage) {
    console.error(`Promptfoo is missing complete scenario coverage for ${id}`);
    process.exit(1);
  }
}
if (!promptfoo.includes('file://assert-policy-route.cjs')) {
  console.error('Promptfoo is missing the bounded policy route helper');
  process.exit(1);
}
if (!promptfoo.includes('file://assert-policy-permission.cjs')) {
  console.error('Promptfoo is missing the bounded policy permission helper');
  process.exit(1);
}
if (
  /assert-human-stop\.cjs|assert-automation-flow\.cjs|human_stop_exclusive|automation_flow_exclusive/.test(
    promptfoo,
  )
) {
  console.error('Promptfoo still references natural-language routing inference');
  process.exit(1);
}

console.log(
  `OK: ${registry.size} structured policy assertions are valid, complete, and referenced.`,
);
