# PR monitoring

Load for CI monitoring or expected Copilot review, not title/body-only work.
Repository rules and all independent safety/permission gates still apply.

## One owner, available capabilities

Record the repository, PR number, and pushed head SHA. Read live PR state and
check status for that exact head before choosing a monitor.

- Prefer already-available app status and completion notifications when they
  identify this PR/head. Use actual exposed capabilities and live status, not
  an assumed desktop version or a tool name from another client.
- If the user already delegated this PR to an active Agent merge or other
  native controller, reuse that owner and inspect its status. Do not start a
  second fix/review loop, shell watcher, or automation for the same work.
- Availability is not permission. Do not enable or change Agent merge, schedule
  automation, or turn on merging merely because this skill is loaded. Changes
  need scoped user delegation and applicable tool approval. Merging additionally
  needs an explicit merge request and any required confirmation; CI success or
  permission to fix checks is not merge permission.
- Native mechanics do not replace repository checks, mandatory reviews,
  `human-interaction-safeguard`, or independent posting/merge permissions.
  Do not delegate actions that cannot preserve those boundaries.

## Portable fallback

CLI and cloud clients need no desktop tools. Use the portable fallback when
native monitoring is absent; the same permissions and final checks apply.
When no usable native monitor or existing controller owns this work, use one
bounded CLI wait:

```bash
gh pr checks <number> --repo <owner/repo> --watch --fail-fast
```

If `--watch` is unavailable, use
`gh run watch <run-id> --repo <owner/repo> --exit-status` only
after verifying that run belongs to the recorded head. Bound either wait by
the client's execution deadline; stop the local watcher at that deadline,
not the GitHub workflow. If a bounded wait is unavailable, read status once
and report pending. Do not spend repeated model turns or sleep loops polling.
Yield to completion notifications when available.

On failure, inspect the failing run and categorize test, lint, build, timeout,
or infrastructure failure:

```bash
gh run view <run-id> --repo <owner/repo> --log-failed
```

The existing owner handles authorized fixes directly or delegates useful
specialist work. Re-run affected gates after a fix and track the new pushed
head. Do not blindly retry failing workflows or weaken assertions to get green.

Before claiming CI passed, re-read live PR state, head SHA, and the complete
applicable check set. Require terminal successful conclusions for the recorded
head, using repository rules for allowed skipped/neutral checks. Missing,
queued, cancelled, inaccessible, timed-out, or stale-head results are not
success. If the head changed, invalidate the old result and track the new head.
Report exact pending/failed checks and their URLs; no checks is not proof of
success. Native notifications are wakeups, not final verification.

## Expected Copilot review

Establish whether review is expected from an explicit user request, accessible
repository review configuration/rules, or an authoritative pending review
request for this PR. No reviews yet is not evidence that automatic review is
disabled. If configuration is inaccessible or expectation cannot be verified,
report it as unknown rather than inventing a rule or declaring review complete.

- If evidence establishes no review is expected, skip waiting and state why.
- If expectation is unknown, do not impose a speculative ten-minute wait;
  report the gap. Never declare a required review gate satisfied.
- If review is expected, reuse the existing controller or one completion
  notification. Without those capabilities, use one bounded wait under the
  client's deadline, not repeated model turns to poll. If no bounded review
  waiter exists, read once and hand off pending review with its PR URL.
- On timeout or missing expected review, report pending, not passed. A required
  review still blocks readiness. A review of an earlier head is not evidence
  that the current head was reviewed; apply the repository's dismissal and
  re-review rules.

On arrival or the final status read, retrieve reviews and the complete relevant
chains through `human-interaction-safeguard` before acting. A review listing
alone is not complete thread/chain retrieval. Phase 6 remains mandatory before
processing feedback. Skipping an unconfigured wait never skips mandatory
adversarial, security, or repository-required review gates.
