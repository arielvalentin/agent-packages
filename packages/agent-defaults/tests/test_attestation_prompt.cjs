const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { validateResult } = require('./verified-attestation-prompt.cjs');

const body = 'I, arielvalentin, do hereby authorize this agent to override my human-interaction-safeguard skill.';
const pending = {
  session: 'TEST-ONLY', request: 'TEST-ONLY', chain_revision: 'TEST-ONLY',
  action: {
    operation: 'draft', repository: 'owner/repo', item: 42,
    thread: 'T1', content: 'TEST ONLY: one draft; no live action',
  },
};
function capture(request, raw = body) {
  const run = spawnSync('python3', [path.join(__dirname, 'test_attestation_verifier.py'), '--fixture'], {
    input: JSON.stringify({
      pending_request: request, body_b64: Buffer.from(raw, 'utf8').toString('base64'),
    }),
    encoding: 'utf8', timeout: 15000,
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

const valid = capture(pending);
assert.doesNotThrow(() => validateResult(valid, pending));
const different = {
  ...pending, action: { ...pending.action, operation: 'post', content: 'TEST ONLY: other payload' },
};
const other = capture(different);
assert.doesNotThrow(() => validateResult(other, different));
assert.throws(() => validateResult(other, pending), /No successful current verifier record/);
for (const field of ['exit_code', 'status_code', 'record', 'verification_id']) {
  const missing = { ...valid };
  delete missing[field];
  assert.throws(() => validateResult(missing, pending), `missing ${field}`);
}
for (const field of ['exit_code', 'status_code']) {
  assert.throws(() => validateResult({ ...valid, [field]: 130 }, pending));
}
for (const [field, value] of Object.entries({
  kind: 'other', input_channel: 'chat', literal_match: false, byte_count: 100,
  binding_sha256: '0'.repeat(64), verification_id: '0'.repeat(32),
})) {
  assert.throws(() => validateResult({
    ...valid, record: { ...valid.record, [field]: value },
  }, pending), `invalid ${field}`);
}
assert.throws(() => validateResult({ ...valid, verification_id: '0'.repeat(32) }, pending));
for (const field of ['session', 'request', 'chain_revision']) {
  assert.throws(() => validateResult(valid, { ...pending, [field]: 'changed' }), `changed ${field}`);
}
for (const [field, value] of Object.entries({
  operation: 'post', repository: 'owner/other', item: 43, thread: 'T2',
  comment: 8, review: 'R2', content: 'TEST ONLY: changed content',
})) {
  assert.throws(() => validateResult(valid, {
    ...pending, action: { ...pending.action, [field]: value },
  }), `changed ${field}`);
}
assert.throws(() => validateResult(capture(pending, `"${body}"`), pending));
console.log('Real verifier continuations reject missing records/status, changed bindings, stale identity, and quoted input.');
