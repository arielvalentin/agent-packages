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
  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.length === expected.length &&
    expected.every((line, index) => lines[index] === line)
  );
};
