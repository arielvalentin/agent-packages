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

const requiredIds = [
  'consensus.automatic.single',
  'consensus.automatic.unavailable',
  'consensus.explicit.initial-failure',
  'consensus.explicit.panel',
  'consensus.explicit.under-capacity',
  'consensus.handoff.invalid',
  'coordinator.policy.high-risk',
  'coordinator.public.existing-item',
  'coordinator.public.new-item',
  'coordinator.security.explicit-vulnerability',
  'human-interaction.action.human-stop.draft',
  'human-interaction.action.human-stop.implement',
  'human-interaction.action.human-stop.post',
  'human-interaction.action.human-stop.reply',
  'human-interaction.action.human-stop.resolve',
  'human-interaction.actor.graphql-bot',
  'human-interaction.actor.graphql-non-bot',
  'human-interaction.actor.rest-bot',
  'human-interaction.actor.rest-unknown',
  'human-interaction.actor.rest-user',
  'human-interaction.chain.all-bot',
  'human-interaction.chain.any-human',
  'human-interaction.chain.any-unknown',
  'human-interaction.chain.incomplete',
  'human-interaction.existing-item.all-bot',
  'human-interaction.existing-item.any-human',
  'human-interaction.ownership.human-stop',
  'human-interaction.provenance.user-with-app',
];

const requiredPromptfooIds = [
  'consensus.explicit.initial-failure',
  'consensus.explicit.panel',
  'consensus.explicit.under-capacity',
  'consensus.handoff.invalid',
  'coordinator.policy.high-risk',
  'coordinator.public.existing-item',
  'coordinator.public.new-item',
  'coordinator.security.explicit-vulnerability',
  'human-interaction.actor.graphql-bot',
  'human-interaction.actor.rest-bot',
  'human-interaction.actor.rest-unknown',
  'human-interaction.actor.rest-user',
  'human-interaction.action.human-stop.draft',
  'human-interaction.chain.any-human',
  'human-interaction.chain.any-unknown',
  'human-interaction.chain.incomplete',
  'human-interaction.existing-item.any-human',
  'human-interaction.provenance.user-with-app',
];

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

const promptfoo = fs.readFileSync(promptfooConfig, 'utf8');
for (const id of requiredPromptfooIds) {
  if (!promptfoo.includes(`assertion_id: "${id}"`)) {
    console.error(`Promptfoo is missing structured policy coverage for ${id}`);
    process.exit(1);
  }
}
if (!promptfoo.includes('file://assert-policy-decision.cjs')) {
  console.error('Promptfoo is missing the structured policy assertion helper');
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
