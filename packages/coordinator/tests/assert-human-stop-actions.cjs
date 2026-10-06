'use strict';

const EXPECTED = new Map([
  ['classification', 'human_stop'],
  ['implement', 'no'],
  ['reply', 'no'],
  ['resolve', 'no'],
]);

module.exports = (output) => {
  const decisions = new Map();
  for (const line of String(output).split(/\r?\n/)) {
    const match = line
      .trim()
      .replace(/^[-*]\s*/, '')
      .match(/^(classification|implement|reply|resolve)\s*:\s*([a-z_]+)[.!]?$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (decisions.has(key)) return false;
    decisions.set(key, match[2].toLowerCase());
  }

  return (
    decisions.size === EXPECTED.size &&
    [...EXPECTED].every(([key, value]) => decisions.get(key) === value)
  );
};
