---
name: review-fix-loop
description: >
  Reusable gate pattern: dispatch a reviewer, fix findings with an implementer,
  re-run the reviewer, and escalate after a retry limit. Use for every
  review-then-fix gate owned by the calling agent.
---

# Review-Fix Loop

A parameterized gate that eliminates repeated prose for adversarial, security,
code-review, and observability review gates.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `reviewer` | yes | — | Agent or skill to dispatch for review (e.g., `adversarial-review`, `security-review`, `code-review`, `custom-observability-reviewer`) |
| `fixer` | no | `implementer` | Agent dispatched to address findings |
| `scope` | yes | — | What to review: diff ref, artifact path, or description of review target |
| `context` | no | — | Additional context for the reviewer (intent summary, design doc, issue body) |
| `explicit_multi_review` | yes | — | Caller-owned JSON boolean, preserved unchanged across review and fix handoffs |
| `accepted_findings` | no | — | Caller-authorized findings using the consensus-panel finding schema; skips duplicate intake review and requires a post-fix review |
| `focus` | no | — | Specific review focus or criteria (e.g., "intent-coverage", "exploitable vulnerabilities only") |
| `max_retries` | no | 2 | Maximum fix-then-re-review cycles before escalation |
| `severity_threshold` | no | `blocker,major` | Comma-separated severities that trigger a fix cycle |
| `on_exhaust` | no | `escalate` | What to do when retries are exhausted: `escalate` (stop for a user decision) or `warn` (report below-threshold advisories only; never waive a required or threshold finding) |
| `skip_condition` | no | — | Condition under which this gate is skipped (e.g., "refactor flow unless touching auth/crypto") |

## Protocol

Before dispatch, validate `explicit_multi_review`: missing, null, string, or
other non-boolean values stop as `STOP_INVALID_HANDOFF`. When supplied,
`accepted_findings` must be an array of finding records. Each record must
include a recognized `severity` (`blocker`, `major`, `minor`, or `nit`) and
non-empty `location`, `issue`, and `fix` strings, matching the
`consensus-panel` finding schema. A malformed value stops as
`STOP_INVALID_HANDOFF`; do not treat it as an empty list or skip intake. The
calling agent owns this gate and user escalation; no coordinator agent is
required.

1. **Check skip condition** — if `skip_condition` is defined and matches the
   current context, skip the gate entirely. Record the skip reason.

2. **Review intake** — when `accepted_findings` is absent or empty, run the
   `reviewer` through `consensus-panel` unless that role is explicitly
   designated single-model and `explicit_multi_review` is `false`.
   `consensus-panel` classifies the scope first. A `true` value overrides any
   single-model designation and always selects the panel. Send `scope`,
   `context`, `explicit_multi_review`, and `focus` when provided.
   When `accepted_findings` is non-empty, do not repeat the intake review. The
   caller must have completed the applicable authorization and evidence gates
   and classified those findings as actionable. Treat every supplied finding
   as a required fix regardless of its severity and proceed directly to the
   fix cycle.

3. **Evaluate findings**:
   - For an intake review, no findings at or above `severity_threshold` →
     **gate passes**. Findings at or above threshold become required findings
     and proceed to the fix cycle.
   - A non-empty caller-supplied `accepted_findings` set always proceeds to the
     fix cycle, regardless of severity. Those findings have already passed the
     caller's evidence, actor, and authorization gates; do not filter them out
     or reinterpret their authorization.

4. **Fix cycle** (up to `max_retries` iterations):
   a. Dispatch `fixer` with the findings as required fixes.
   b. Re-run `reviewer` through the same panel policy against the updated
      `scope`, preserving `explicit_multi_review` unchanged in every handoff.
      This post-fix review is mandatory for caller-supplied `accepted_findings`
      too; do not skip it based on the source or severity of those findings.
      For each required finding — every caller-supplied finding and every
      intake finding at or above `severity_threshold` — require the post-fix
      reviewer to state `resolved`, `unresolved`, or `not applicable` in its
      report notes, with evidence for any resolved or not-applicable status.
      Missing status or missing evidence leaves that finding unresolved, even
      if the reviewer omits it from the new findings list or lowers its
      severity.
      Re-classify the scope at the start of every cycle, then determine review
      mode from the unchanged caller field: `explicit_multi_review: true`
      always selects the adaptive 2+1 panel, even when the scope is still
      non-code or tiny. Only when the value is `false` does scope classification
      select the single-reviewer fast path or the panel. Every panelled retry
      starts a **fresh initial wave of 2** reviewers, escalating to a tiebreaker
      only if that cycle's own responses fire an escalation trigger — a previous
      cycle's escalation does not carry over.
   c. An intake gate passes only when every original required finding is
      explicitly resolved or proven not applicable with evidence, and no new
      findings at or above threshold remain. For caller-supplied
      `accepted_findings`, every supplied finding must also be explicitly
      resolved or proven not applicable with evidence, regardless of severity.
      A below-threshold label or omission from the latest findings list does not
      resolve a required finding. Otherwise, keep the gate open and include all
      unresolved or unverified required findings in retry and exhaustion
      handling.
   d. If same finding is raised again after a fix attempt, increment a
      per-finding repeat counter.

5. **Exhaustion** — if `max_retries` is reached with unresolved findings:
   - `on_exhaust: escalate` → stop and present unresolved findings to the
     user for a decision (fix manually, waive, or abort).
   - `on_exhaust: warn` → report below-threshold advisories as warnings and
     flag reduced assurance. It never allows the gate to pass with an
     unresolved finding at or above `severity_threshold`.

   If any intake finding at or above `severity_threshold` remains unresolved,
   stop and escalate regardless of `on_exhaust`; a warning cannot downgrade a
   finding that blocks the gate. If caller-supplied `accepted_findings` include
   any unresolved or unverified required finding, stop and escalate as well,
   even when that finding is below the threshold.

   Use `writing-voice` for escalations, warnings, and outcome summaries.
   Preserve the required gate evidence and unresolved findings.

6. **Record outcome** — regardless of path, record:
   - Gate name (derived from `reviewer`)
   - Outcome: `passed`, `passed-after-fixes`, `skipped` (with reason),
     `escalated`, or `warned`
   - Number of fix cycles used
   - Review mode per cycle: `single-reviewer fast path` (with the exemption that
     applied) or `adaptive 2+1`
   - Whether any review wave escalated to a tiebreaker, and which trigger fired
   - Unresolved findings (if any)

## Same-finding detection

A finding is "the same" if it matches on `(location, issue)` or
`(category, description)` — the calling agent must not loop indefinitely on
a finding the fixer cannot resolve.

## Usage examples

Example values are illustrative; every handoff must preserve the caller's
original `explicit_multi_review` value unchanged.

### Adversarial review gate
```
reviewer: adversarial-review
scope: full context (design doc + all diffs + stage review findings)
context: design doc, implementation summary, rubber-duck findings
explicit_multi_review: false
max_retries: 2
severity_threshold: blocker,major
on_exhaust: escalate
```

### Security review gate
```
reviewer: security-review
scope: cumulative diff (branch vs base)
focus: exploitable vulnerabilities only, with severity and confidence
explicit_multi_review: false
max_retries: 2
severity_threshold: blocker,major
on_exhaust: escalate
skip_condition: refactor flow unless touching auth, crypto, input validation, or access control
```

### Documentation-only review (single-reviewer fast path)
```
reviewer: code-review
scope: docs-only diff (branch vs base)
explicit_multi_review: false
max_retries: 1
severity_threshold: blocker,major
on_exhaust: warn
```
`consensus-panel` classifies this scope as non-code and dispatches exactly one
mid-tier reviewer — no panel.

### Per-step code review
```
reviewer: code-review
scope: step diff
explicit_multi_review: false
max_retries: 1
severity_threshold: blocker
on_exhaust: warn
```

### Authorized PR feedback fix
```
reviewer: adversarial-review
scope: exact current PR diff and accepted feedback findings
context: task intent, complete classified feedback, and verified acceptance criteria
explicit_multi_review: <caller-derived JSON boolean>
accepted_findings: <actionable findings accepted by pr-lifecycle>
```
The lifecycle caller completes actor classification and authorization first.
The loop fixes only the supplied findings, then runs the required post-fix
review under the same `explicit_multi_review` value. It does not repeat the
feedback intake review.

### Observability validation
```
reviewer: custom-observability-reviewer
scope: cumulative diff (branch vs base)
focus: metrics, logs, traces, alerting/SLO coverage
explicit_multi_review: false
max_retries: 2
severity_threshold: blocker,major
on_exhaust: escalate
skip_condition: documentation-only, dependency bumps, or user-marked observability-exempt
```

## Fallback behavior

If the specified `reviewer` is unavailable:
- `adversarial-review` → use `rubber-duck` through `consensus-panel`
- `security-review` → use `se-security-reviewer` + `sast-sca-security-analyzer`
- `custom-observability-reviewer` → fall back to manual 4-criteria checklist
  (metrics, logs, traces, alerting)
- `code-review` → use `rubber-duck` in diff-review mode

Record the fallback in the gate outcome.
