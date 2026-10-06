'use strict';

const ROUTE = '(HUMAN_STOP|AUTOMATION_FLOW)';
const ACTION =
  '(?:implement(?:ation|ing)?|draft(?:ing)?|writ(?:e|ing)|post(?:ing)?|send(?:ing)?|reply(?:ing)?|resolv(?:e|ing)|resolution|act(?:ing)?|continue|proceed)';

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

function hasUnnegatedRoute(output, route) {
  const text = normalize(output);
  const matches = text.matchAll(new RegExp(`\\b${route}\\b`, 'gi'));

  for (const match of matches) {
    const start = match.index;
    const end = start + match[0].length;
    const before = text.slice(Math.max(0, start - 50), start);
    const after = text.slice(end, end + 50);
    const negatedBefore =
      /\b(?:not|never|no|avoid|reject|exclude)\s*$/i.test(before) ||
      /\bnot\s+(?:use|select|choose|return|apply)\s*$/i.test(before);
    const negatedAfter =
      /^\s*(?:(?:is|was|would|should|does|do|can|could|may|might|must|will)\s+not|isn['’]t|wasn['’]t|doesn['’]t|don['’]t|cannot|can['’]t|won['’]t)\b/i.test(
        after,
      );
    if (!negatedBefore && !negatedAfter) return true;
  }

  return false;
}

function permitsAgentAction(output) {
  const text = normalize(output);
  const structured = new RegExp(
    `\\b${ACTION}\\s*:\\s*(?:yes|allowed|true|permitted|authorized)\\b`,
    'i',
  );
  const actorPermission = new RegExp(
    `\\b(?:agent|assistant|i|we|you)\\b[^.\\n]{0,60}\\b(?:may|can|could|will|should|am allowed to|is allowed to|are allowed to|am permitted to|is permitted to|are permitted to)\\s+(?:still\\s+)?${ACTION}\\b`,
    'i',
  );
  const passivePermission = new RegExp(
    `\\b(?:the\\s+)?${ACTION}\\b[^.\\n]{0,30}\\b(?:is|are|may be|can be|could be|will be|should be)\\s+(?:allowed|permitted|authorized)\\b|\\b${ACTION}\\b[^.\\n]{0,30}\\b(?:may|can|could|will|should)\\s+(?:still\\s+)?(?:proceed|continue|occur|start)\\b`,
    'i',
  );

  return (
    structured.test(text) || actorPermission.test(text) || passivePermission.test(text)
  );
}

function deniesAutomationAction(output) {
  const text = normalize(output);
  const structured = new RegExp(
    `\\b${ACTION}\\s*:\\s*(?:no|false|prohibited|disallowed|denied)\\b`,
    'i',
  );
  const actorDenial = new RegExp(
    `\\b(?:agent|assistant|i|we)\\b[^.\\n]{0,50}\\b(?:may not|cannot|can['’]t|must not|should not|will not|won['’]t|is not allowed to|is prohibited from)\\s+${ACTION}\\b`,
    'i',
  );
  const passiveDenial = new RegExp(
    `\\b(?:the\\s+)?${ACTION}\\b[^.\\n]{0,30}\\b(?:is|are)\\s+(?:not allowed|prohibited|disallowed|denied)\\b`,
    'i',
  );

  return structured.test(text) || actorDenial.test(text) || passiveDenial.test(text);
}

function selectsOnly(output, expected) {
  const selected = selectedRoutes(output);
  return selected.length > 0 && selected.every((value) => value === expected);
}

function assertHumanStop(output) {
  return (
    selectsOnly(output, 'HUMAN_STOP') &&
    !hasUnnegatedRoute(output, 'AUTOMATION_FLOW') &&
    !permitsAgentAction(output)
  );
}

function assertAutomationFlow(output) {
  const text = normalize(output);
  const userOnly =
    /\bUSER_WRITES_REPLY_AND_RESOLVES\b/i.test(text) ||
    /\bonly\s+(?:the\s+)?user\b[^.\n]{0,50}\b(?:write|post|reply|resolve)\b/i.test(
      text,
    ) ||
    /\b(?:the\s+)?user\b[^.\n]{0,50}\b(?:must|should|has to|is required to)\b[^.\n]{0,30}\b(?:write|post|reply|resolve)\b/i.test(
      text,
    ) ||
    /\b(?:reply|review|comment|resolution)\b[^.\n]{0,50}\b(?:must|should|has to|is required to)\s+be\s+(?:written|posted|resolved)\s+by\s+(?:the\s+)?user\b/i.test(
      text,
    );
  return (
    selectsOnly(output, 'AUTOMATION_FLOW') &&
    !hasUnnegatedRoute(output, 'HUMAN_STOP') &&
    !userOnly &&
    !deniesAutomationAction(output)
  );
}

module.exports = {
  assertAutomationFlow,
  assertHumanStop,
  deniesAutomationAction,
  hasUnnegatedRoute,
  permitsAgentAction,
  selectedRoutes,
};
