'use strict';

const OWNERS = {
  consensus: 'file://../.apm/skills/consensus-panel/SKILL.md',
  coordinator: 'file://../.apm/agents/coordinator.agent.md',
  'human-interaction':
    'file://../.apm/skills/human-interaction-safeguard/SKILL.md',
};

const EXTRA_CONSUMERS = {
  'consensus.explicit.panel': [
    'file://../.apm/agents/coordinator.agent.md',
  ],
  'consensus.handoff.invalid': [
    'file://../.apm/agents/coordinator.agent.md',
    'file://../.apm/skills/review-fix-loop/SKILL.md',
    'file://../.apm/skills/adversarial-review/SKILL.md',
    'file://../.apm/skills/acting-on-behalf/SKILL.md',
    'file://../.apm/skills/pr-review-protocol/SKILL.md',
  ],
  'human-interaction.chain.any-human': [
    'file://../.apm/skills/pr-lifecycle/SKILL.md',
  ],
  'human-interaction.chain.any-unknown': [
    'file://../.apm/skills/pr-lifecycle/SKILL.md',
  ],
  'human-interaction.chain.incomplete': [
    'file://../.apm/skills/pr-lifecycle/SKILL.md',
  ],
};

function allowedPolicyConsumers(assertionId) {
  const namespace = assertionId.split('.')[0];
  const owner = OWNERS[namespace];
  if (!owner) return new Set();
  return new Set([owner, ...(EXTRA_CONSUMERS[assertionId] || [])]);
}

module.exports = { allowedPolicyConsumers };
