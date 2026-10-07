'use strict';

module.exports = ({ vars }) => {
  let outputContract = '';
  if (vars.structured_actions) {
    outputContract = [
      'Return exactly six non-empty lines and nothing else.',
      'Use Classification: HUMAN_STOP or Classification: AUTOMATION_FLOW.',
      'Then use Implement, Draft, Post, Reply, Resolve in that order.',
      'Use No for every HUMAN_STOP action and Allowed for every AUTOMATION_FLOW action.',
      'Do not add an introduction, explanation, Markdown, or blank line.',
    ].join(' ');
  } else if (vars.permission_output) {
    outputContract =
      'Return exactly Yes or No. Do not add punctuation, Markdown, labels, or explanation.';
  } else if (vars.assertion_id) {
    outputContract =
      'Return exactly one bare policy result token. Do not add punctuation, Markdown, JSON, labels, alternatives, or explanation.';
  }

  return JSON.stringify([
    {
      role: 'system',
      content: [
        `{% raw %}${vars.skill_content}{% endraw %}`,
        'Follow the skill instructions and answer the user.',
        outputContract,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    {
      role: 'user',
      content: [vars.user_input, outputContract].filter(Boolean).join('\n\n'),
    },
  ]);
};
