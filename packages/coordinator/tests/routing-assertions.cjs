'use strict';

const ROUTE = '(HUMAN_STOP|AUTOMATION_FLOW)';

function normalize(output) {
  return output.replace(/\*/g, '').split(String.fromCharCode(96)).join('');
}

function selectedRoutes(output) {
  const text = normalize(output);
  const selected = [];

  for (const line of text.split(/\r?\n/).map((value) => value.trim())) {
    const match = line.match(
      new RegExp(
        `^(?:(?:classification|response|required path|required token|decision-table token|thread classification token)\\s*(?:is|:|=|as)?\\s*)?${ROUTE}[.!]?$`,
        'i',
      ),
    );
    if (match) selected.push(match[1].toUpperCase());
  }

  const contextual = new RegExp(
    `\\b(?:classification|classified as|required path|selected path|required (?:decision-table |thread classification )?token)\\s*(?:is|:|=|as)?\\s*${ROUTE}\\b`,
    'gi',
  );
  for (const match of text.matchAll(contextual)) {
    selected.push(match[1].toUpperCase());
  }

  const disjunction = new RegExp(`\\b${ROUTE}\\b\\s*(?:\\||or)\\s*\\b${ROUTE}\\b`, 'gi');
  for (const match of text.matchAll(disjunction)) {
    selected.push(match[1].toUpperCase(), match[2].toUpperCase());
  }

  const hedged = new RegExp(
    `\\b${ROUTE}\\b\\s+(?:could|may|might)\\s+(?:also\\s+)?(?:apply|be selected|be used)\\b`,
    'gi',
  );
  for (const match of text.matchAll(hedged)) {
    selected.push(match[1].toUpperCase());
  }

  return selected;
}

function permitsAgentAction(output) {
  const text = normalize(output);
  const structured =
    /\b(?:implement|reply|resolve)\s*:\s*(?:yes|allowed|true|permitted)\b/i;
  const actorPermission =
    /\b(?:agent|assistant|i|we|you)\b[^.\n]{0,60}\b(?:may|can|could|will|should|am allowed to|is allowed to|are allowed to|am permitted to|is permitted to|are permitted to)\s+(?:still\s+)?(?:implement|draft|write|post|send|reply|resolve|act|continue|proceed)\b/i;
  const passivePermission =
    /\b(?:implementation|drafting|posting|replying|resolution)\b[^.\n]{0,40}\b(?:may|can|could|will|should)\s+(?:still\s+)?(?:proceed|continue|occur|start)\b/i;

  return structured.test(text) || actorPermission.test(text) || passivePermission.test(text);
}

function selectsOnly(output, expected) {
  const selected = selectedRoutes(output);
  return selected.length > 0 && selected.every((value) => value === expected);
}

function assertHumanStop(output) {
  return selectsOnly(output, 'HUMAN_STOP') && !permitsAgentAction(output);
}

function assertAutomationFlow(output) {
  const text = normalize(output);
  const userOnly =
    /\bUSER_WRITES_REPLY_AND_RESOLVES\b/i.test(text) ||
    /\b(?:the\s+)?user\b[^.\n]{0,50}\b(?:must|only)\b[^.\n]{0,30}\b(?:write|reply|resolve)\b/i.test(
      text,
    );
  return selectsOnly(output, 'AUTOMATION_FLOW') && !userOnly;
}

module.exports = {
  assertAutomationFlow,
  assertHumanStop,
  permitsAgentAction,
  selectedRoutes,
};
