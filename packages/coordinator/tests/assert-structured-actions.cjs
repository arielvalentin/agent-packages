'use strict';

const LABELS = [
  'Classification',
  'Implement',
  'Draft',
  'Post',
  'Reply',
  'Resolve',
];

module.exports = (output, context = {}) => {
  const expectedClassification =
    context.vars?.expected_classification || 'HUMAN_STOP';
  const expectedAction = context.vars?.expected_action || 'No';
  const expected = [
    `Classification: ${expectedClassification}`,
    ...LABELS.slice(1).map((label) => `${label}: ${expectedAction}`),
  ];
  return String(output).replace(/\r\n/g, '\n') === expected.join('\n');
};
