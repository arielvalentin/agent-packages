'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const {
  assertionContractSignature,
  compareRegistryIds,
  loadRegistry,
  parsePolicyMarkdown,
} = require('./policy-assertions.cjs');
const {
  allowedPolicyConsumers,
} = require('./policy-assertion-consumers.cjs');

const repositoryRoot = path.resolve(__dirname, '../../..');
const policyRoot = path.join(repositoryRoot, 'packages/coordinator/.apm');
const promptfooConfig = path.join(
  repositoryRoot,
  'packages/coordinator/tests/promptfooconfig.yaml',
);

const expectedAssertions = new Map(
  Object.entries({
    'consensus.automatic.initial-failure': ['ADAPTIVE_RECOVERY', true],
    'consensus.automatic.panel-required': ['PANEL_2', true],
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
    'human-interaction.actor.graphql-unknown': ['HUMAN_STOP', false],
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
const expectedContracts = new Map(
  Object.entries({
    'consensus.automatic.initial-failure': '{"contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"fallback","conditions":["explicit-multi-review.false","dispatch.initial-response.invalid-after-retry"],"precedence":[]}',
    'consensus.automatic.panel-required': '{"contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["capacity.initial-slots.two","explicit-multi-review.false","scope.panel-required"],"precedence":[]}',
    'consensus.automatic.single': '{"contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["explicit-multi-review.false","scope.fast-path-eligible"],"precedence":[]}',
    'consensus.automatic.unavailable': '{"contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"fallback","conditions":["explicit-multi-review.false","automatic-capacity.unavailable"],"precedence":[]}',
    'consensus.explicit.initial-failure': '{"contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["capacity.initial-slots.two","explicit-multi-review.true","dispatch.initial-response.invalid-after-retry"],"precedence":["consensus.explicit.panel"]}',
    'consensus.explicit.panel': '{"contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["explicit-multi-review.true","capacity.initial-slots.two"],"precedence":[]}',
    'consensus.explicit.under-capacity': '{"contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["explicit-multi-review.true","capacity.initial-slots.less-than-two"],"precedence":[]}',
    'consensus.handoff.invalid': '{"contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"route","conditions":["explicit-multi-review.missing-or-invalid"],"precedence":[]}',
    'coordinator.policy.high-risk': '{"contract":"coordinator.review-routing","actor":"system","provenance":"policy-scope","interaction":"policy-change","action":"dispatch","conditions":["scope.behavior-defining-policy"],"precedence":[]}',
    'coordinator.public.existing-item': '{"contract":"coordinator.public-routing","actor":"system","provenance":"public-item","interaction":"public-github","action":"route","conditions":["item.existing","action.comment-review-reply-or-resolve"],"precedence":[]}',
    'coordinator.public.new-item': '{"contract":"coordinator.public-routing","actor":"system","provenance":"public-item","interaction":"public-github","action":"route","conditions":["item.new","action.create"],"precedence":[]}',
    'coordinator.security.explicit-vulnerability': '{"contract":"coordinator.review-routing","actor":"system","provenance":"user-intent","interaction":"security-review","action":"dispatch","conditions":["user.explicit-vulnerability-review"],"precedence":[]}',
    'human-interaction.action.human-stop.draft': '{"contract":"human-interaction.permissions","actor":"human-or-unknown","provenance":"classification-result","interaction":"public-github","action":"draft","conditions":["classification.human-stop"],"precedence":[]}',
    'human-interaction.action.human-stop.implement': '{"contract":"human-interaction.permissions","actor":"human-or-unknown","provenance":"classification-result","interaction":"public-github","action":"implement","conditions":["classification.human-stop","trigger.interaction"],"precedence":[]}',
    'human-interaction.action.human-stop.post': '{"contract":"human-interaction.permissions","actor":"human-or-unknown","provenance":"classification-result","interaction":"public-github","action":"post","conditions":["classification.human-stop"],"precedence":[]}',
    'human-interaction.action.human-stop.reply': '{"contract":"human-interaction.permissions","actor":"human-or-unknown","provenance":"classification-result","interaction":"public-github","action":"reply","conditions":["classification.human-stop"],"precedence":[]}',
    'human-interaction.action.human-stop.resolve': '{"contract":"human-interaction.permissions","actor":"human-or-unknown","provenance":"classification-result","interaction":"public-github","action":"resolve","conditions":["classification.human-stop"],"precedence":[]}',
    'human-interaction.actor.graphql-bot': '{"contract":"human-interaction.routing","actor":"graphql-bot","provenance":"graphql-author-type","interaction":"public-github","action":"classify","conditions":["author.typename.bot","source.graphql"],"precedence":[]}',
    'human-interaction.actor.graphql-non-bot': '{"contract":"human-interaction.routing","actor":"graphql-non-bot","provenance":"graphql-author-type","interaction":"public-github","action":"classify","conditions":["author.typename.not-bot","source.graphql"],"precedence":[]}',
    'human-interaction.actor.graphql-unknown': '{"contract":"human-interaction.routing","actor":"unknown","provenance":"graphql-author-type","interaction":"public-github","action":"classify","conditions":["author.missing-or-unknown","source.graphql"],"precedence":[]}',
    'human-interaction.actor.rest-bot': '{"contract":"human-interaction.routing","actor":"rest-bot","provenance":"rest-user-type","interaction":"public-github","action":"classify","conditions":["source.rest","user.type.bot"],"precedence":[]}',
    'human-interaction.actor.rest-unknown': '{"contract":"human-interaction.routing","actor":"unknown","provenance":"rest-user-type","interaction":"public-github","action":"classify","conditions":["source.rest","user.type.missing-or-unknown"],"precedence":[]}',
    'human-interaction.actor.rest-user': '{"contract":"human-interaction.routing","actor":"rest-user","provenance":"rest-user-type","interaction":"public-github","action":"classify","conditions":["source.rest","user.type.user"],"precedence":[]}',
    'human-interaction.chain.all-bot': '{"contract":"human-interaction.chain","actor":"all-bot","provenance":"complete-chain","interaction":"public-github","action":"classify","conditions":["chain.complete","chain.every-actor.bot"],"precedence":[]}',
    'human-interaction.chain.any-human': '{"contract":"human-interaction.chain","actor":"mixed","provenance":"complete-chain","interaction":"public-github","action":"classify","conditions":["chain.complete","chain.any-actor.user"],"precedence":["human-interaction.actor.rest-user"]}',
    'human-interaction.chain.any-unknown': '{"contract":"human-interaction.chain","actor":"unknown","provenance":"complete-chain","interaction":"public-github","action":"classify","conditions":["chain.complete","chain.any-actor.unknown"],"precedence":["human-interaction.actor.rest-unknown"]}',
    'human-interaction.chain.incomplete': '{"contract":"human-interaction.chain","actor":"unknown","provenance":"incomplete-chain","interaction":"public-github","action":"classify","conditions":["chain.incomplete"],"precedence":[]}',
    'human-interaction.existing-issue.all-bot': '{"contract":"human-interaction.existing-item","actor":"all-bot","provenance":"complete-chain","interaction":"existing-issue","action":"classify","conditions":["item.author.bot","item.all-participants.bot","retrieval.complete"],"precedence":["human-interaction.chain.all-bot"]}',
    'human-interaction.existing-issue.any-human': '{"contract":"human-interaction.existing-item","actor":"mixed","provenance":"complete-chain","interaction":"existing-issue","action":"classify","conditions":["item.any-participant.user","retrieval.complete"],"precedence":["human-interaction.chain.any-human"]}',
    'human-interaction.existing-issue.any-unknown': '{"contract":"human-interaction.existing-item","actor":"unknown","provenance":"complete-chain","interaction":"existing-issue","action":"classify","conditions":["item.any-participant.unknown","retrieval.complete"],"precedence":["human-interaction.chain.any-unknown"]}',
    'human-interaction.existing-item.all-bot': '{"contract":"human-interaction.existing-item","actor":"all-bot","provenance":"complete-chain","interaction":"existing-pr","action":"classify","conditions":["item.author.bot","item.all-participants.bot","retrieval.complete"],"precedence":["human-interaction.chain.all-bot"]}',
    'human-interaction.existing-item.any-human': '{"contract":"human-interaction.existing-item","actor":"mixed","provenance":"complete-chain","interaction":"existing-pr","action":"classify","conditions":["item.any-participant.user","retrieval.complete"],"precedence":["human-interaction.chain.any-human"]}',
    'human-interaction.existing-item.any-unknown': '{"contract":"human-interaction.existing-item","actor":"unknown","provenance":"complete-chain","interaction":"existing-pr","action":"classify","conditions":["item.any-participant.unknown","retrieval.complete"],"precedence":["human-interaction.chain.any-unknown"]}',
    'human-interaction.ownership.human-stop': '{"contract":"human-interaction.permissions","actor":"human-or-unknown","provenance":"classification-result","interaction":"public-github","action":"ownership","conditions":["classification.human-stop"],"precedence":["human-interaction.action.human-stop.reply","human-interaction.action.human-stop.resolve"]}',
    'human-interaction.provenance.user-with-app': '{"contract":"human-interaction.routing","actor":"rest-user","provenance":"rest-user-type","interaction":"public-github","action":"classify","conditions":["app.association.present","source.rest","user.type.user"],"precedence":["human-interaction.actor.rest-user"]}',
  }),
);
const requiredIds = [...expectedAssertions.keys()];

const requiredPromptfooIds = requiredIds;

function parsePromptfooPolicyTests(source) {
  const document = YAML.parseDocument(source, {
    merge: false,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(`Promptfoo YAML is invalid: ${document.errors[0].message}`);
  }
  const testsNode = document.get('tests', true);
  if (testsNode === undefined) return [];
  if (!YAML.isSeq(testsNode)) {
    throw new Error('Promptfoo "tests" must be an array');
  }

  return testsNode.items.map((testNode, index) => {
    if (!YAML.isMap(testNode)) {
      throw new Error(
        `Promptfoo test ${index + 1} must be a direct mapping, not an alias`,
      );
    }
    if (testNode.has('<<')) {
      throw new Error(
        `Promptfoo test ${index + 1} must not inherit fields with YAML merge keys`,
      );
    }
    const varsNode = testNode.get('vars', true);
    if (YAML.isAlias(varsNode)) {
      throw new Error(
        `Promptfoo test ${index + 1} "vars" must be a direct mapping`,
      );
    }
    if (varsNode !== undefined && !YAML.isMap(varsNode)) {
      throw new Error(`Promptfoo test ${index + 1} "vars" must be an object`);
    }
    if (varsNode?.has('<<')) {
      throw new Error(
        `Promptfoo test ${index + 1} "vars" must not use YAML merge keys`,
      );
    }
    const vars = varsNode ? varsNode.toJSON() : {};
    for (const field of [
      'skill_content',
      'assertion_id',
      'expected_result',
      'expected_allowed',
      'permission_output',
    ]) {
      if (YAML.isAlias(varsNode?.get(field, true))) {
        throw new Error(
          `Promptfoo test ${index + 1} "${field}" must be a direct value`,
        );
      }
    }

    const assertionNode = testNode.get('assert', true);
    if (YAML.isAlias(assertionNode)) {
      throw new Error(
        `Promptfoo test ${index + 1} "assert" must be a direct array`,
      );
    }
    if (assertionNode !== undefined && !YAML.isSeq(assertionNode)) {
      throw new Error(`Promptfoo test ${index + 1} "assert" must be an array`);
    }
    const assertions = new Set();
    for (const assertionNodeItem of assertionNode?.items || []) {
      const resolvedAssertion = YAML.isAlias(assertionNodeItem)
        ? assertionNodeItem.resolve(document)
        : assertionNodeItem;
      const assertion = resolvedAssertion?.toJSON();
      if (!assertion || Array.isArray(assertion) || typeof assertion !== 'object') {
        continue;
      }
      if (
        assertion.type === 'javascript' &&
        assertion.value === 'file://assert-policy-route.cjs'
      ) {
        assertions.add('policy_route');
      }
      if (
        assertion.type === 'javascript' &&
        assertion.value === 'file://assert-policy-permission.cjs'
      ) {
        assertions.add('policy_permission');
      }
    }
    return {
      description: testNode.get('description') || '',
      vars,
      assertions,
    };
  });
}

const parserFixture = parsePromptfooPolicyTests([
  'tests:',
  '  - vars:',
  '      skill_content: file://../.apm/skills/consensus-panel/SKILL.md',
  '      assertion_id: consensus.automatic.single',
  '      expected_result: SINGLE_1',
  '      expected_allowed: true',
  "    description: 'alternate formatting'",
  '    assert:',
  '      - type: javascript',
  '        value: file://assert-policy-route.cjs',
  '  -',
  "    description: 'bare list item'",
  '    vars:',
  '      skill_content: file://../.apm/skills/consensus-panel/SKILL.md',
  '      assertion_id: consensus.automatic.single',
  '      expected_result: SINGLE_1',
  '      expected_allowed: true',
  '    assert:',
  '      - type: javascript',
  '        value: file://assert-policy-route.cjs',
].join('\n'));
if (
  parserFixture.length !== 2 ||
  parserFixture[0].description !== 'alternate formatting' ||
  parserFixture[0].vars.assertion_id !== 'consensus.automatic.single' ||
  !parserFixture[0].assertions.has('policy_route') ||
  parserFixture[1].description !== 'bare list item' ||
  !parserFixture[1].assertions.has('policy_route')
) {
  console.error('Promptfoo policy test parser is formatting-sensitive');
  process.exit(1);
}

const blockScalarDecoy = parsePromptfooPolicyTests([
  'tests:',
  '  - description: block scalar decoy',
  '    vars:',
  '      user_input: |',
  '        skill_content: file://../.apm/skills/consensus-panel/SKILL.md',
  '        assertion_id: consensus.automatic.single',
  '        expected_result: SINGLE_1',
  '        expected_allowed: true',
  '        - *policy_route',
].join('\n'));
if (
  blockScalarDecoy.length !== 1 ||
  Object.hasOwn(blockScalarDecoy[0].vars, 'assertion_id') ||
  blockScalarDecoy[0].assertions.size !== 0
) {
  console.error('Promptfoo policy test parser accepts block-scalar decoys');
  process.exit(1);
}

const nestedMappingDecoy = parsePromptfooPolicyTests([
  'tests:',
  '  - description: nested mapping decoy',
  '    metadata:',
  '      vars:',
  '        skill_content: file://../.apm/skills/consensus-panel/SKILL.md',
  '        assertion_id: consensus.automatic.single',
  '        expected_result: SINGLE_1',
  '        expected_allowed: true',
  '      assert:',
  '        - type: javascript',
  '          value: file://assert-policy-route.cjs',
].join('\n'));
if (
  nestedMappingDecoy.length !== 1 ||
  Object.keys(nestedMappingDecoy[0].vars).length !== 0 ||
  nestedMappingDecoy[0].assertions.size !== 0
) {
  console.error('Promptfoo policy test parser accepts nested mapping decoys');
  process.exit(1);
}

for (const inheritedPolicyCase of [
  [
    'covered: &covered',
    '  description: merged test',
    '  vars:',
    '    skill_content: file://../.apm/skills/consensus-panel/SKILL.md',
    '    assertion_id: consensus.automatic.single',
    '    expected_result: SINGLE_1',
    '    expected_allowed: true',
    '  assert:',
    '    - type: javascript',
    '      value: file://assert-policy-route.cjs',
    'tests:',
    '  - <<: *covered',
  ].join('\n'),
  [
    'covered: &covered',
    '  description: aliased test',
    '  vars:',
    '    skill_content: file://../.apm/skills/consensus-panel/SKILL.md',
    '    assertion_id: consensus.automatic.single',
    '    expected_result: SINGLE_1',
    '    expected_allowed: true',
    '  assert:',
    '    - type: javascript',
    '      value: file://assert-policy-route.cjs',
    'tests:',
    '  - *covered',
  ].join('\n'),
  [
    'covered_vars: &covered_vars',
    '  skill_content: file://../.apm/skills/consensus-panel/SKILL.md',
    '  assertion_id: consensus.automatic.single',
    '  expected_result: SINGLE_1',
    '  expected_allowed: true',
    'tests:',
    '  - description: aliased vars',
    '    vars: *covered_vars',
    '    assert:',
    '      - type: javascript',
    '        value: file://assert-policy-route.cjs',
  ].join('\n'),
]) {
  let rejected = false;
  try {
    parsePromptfooPolicyTests(inheritedPolicyCase);
  } catch {
    rejected = true;
  }
  if (!rejected) {
    console.error('Promptfoo policy parser accepts inherited policy bindings');
    process.exit(1);
  }
}

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

function collectMarkdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ['.git', 'node_modules'].includes(entry.name)) {
      return [];
    }
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectMarkdownFiles(file);
    return entry.isFile() && entry.name.endsWith('.md') ? [file] : [];
  });
}

for (const file of collectMarkdownFiles(repositoryRoot)) {
  const consumer = `file://${path
    .relative(__dirname, file)
    .split(path.sep)
    .join('/')}`;
  const { references } = parsePolicyMarkdown(
    fs.readFileSync(file, 'utf8'),
    file,
  );
  for (const reference of references) {
    if (!allowedPolicyConsumers(reference.id).has(consumer)) {
      console.error(
        `Unregistered policy consumer: ${reference.id} -> ${consumer}`,
      );
      process.exit(1);
    }
  }
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
  const actualContract = assertionContractSignature(assertion);
  const expectedContract = expectedContracts.get(id);
  if (actualContract !== expectedContract) {
    console.error(
      `${id} contract changed:\nexpected ${expectedContract}\nreceived ${actualContract}`,
    );
    process.exit(1);
  }
}

const promptfoo = fs.readFileSync(promptfooConfig, 'utf8');
const promptfooTests = parsePromptfooPolicyTests(promptfoo);
for (const id of requiredPromptfooIds) {
  const [expectedResult, expectedAllowed] = expectedAssertions.get(id);
  const coverage = promptfooTests.find(
    (test) =>
      test.vars.assertion_id === id &&
      test.vars.expected_result === expectedResult &&
      test.vars.expected_allowed === expectedAllowed &&
      test.assertions.has('policy_route') &&
      allowedPolicyConsumers(id).has(test.vars.skill_content),
  );
  if (!coverage) {
    console.error(`Promptfoo is missing complete scenario coverage for ${id}`);
    process.exit(1);
  }
}
for (const test of promptfooTests) {
  const hasPolicyVars = Object.hasOwn(test.vars, 'assertion_id');
  if (!hasPolicyVars && test.assertions.size === 0) continue;
  const assertionId = test.vars.assertion_id;
  const consumer = test.vars.skill_content;
  const expectedHelper =
    test.vars.permission_output === true
      ? 'policy_permission'
      : 'policy_route';
  if (
    !assertionId ||
    !consumer ||
    !allowedPolicyConsumers(assertionId).has(consumer) ||
    !test.assertions.has(expectedHelper)
  ) {
    console.error(
      `Promptfoo policy scenario has an unapproved consumer binding: ` +
        `${assertionId || '<missing assertion>'} -> ${consumer || '<missing consumer>'}`,
    );
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
