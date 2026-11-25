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

An explicitly designated single-model role with `explicit_multi_review: false`
may bypass `consensus-panel`, even if that skill is unavailable. Otherwise,
before every review dispatch, load `consensus-panel` for classification,
review-mode selection, dispatch, JSON verdict schema, parsing, synthesis, and
failure handling; if unavailable, stop the gate. This exemption does not waive
any other safety gate or change scope disqualifiers.

1. **Check skip condition** — if `skip_condition` is defined and matches the
   current context, skip the gate entirely. Record the skip reason.

2. **Review intake** — when `accepted_findings` is absent or empty, run the
   `reviewer` under the dispatch policy above. Send `scope`,
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
   b. Re-run `reviewer` through the same dispatch policy against the updated
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
      On non-exempt paths, re-classify the scope at the start of every cycle
      under `consensus-panel`; preserve the caller's review intent and use that
      cycle's responses, not a previous cycle's escalation.
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

## Usage example

Example values are illustrative; every handoff must preserve the caller's
original `explicit_multi_review` value unchanged.

```
reviewer: adversarial-review
scope: full context (design doc + all diffs + stage review findings)
context: design doc, implementation summary, rubber-duck findings
explicit_multi_review: false
max_retries: 2
severity_threshold: blocker,major
on_exhaust: escalate
```

## Fallback behavior

If the specified `reviewer` is unavailable:
- `adversarial-review` → use `rubber-duck` through `consensus-panel`
- `security-review` → use `se-security-reviewer` + `sast-sca-security-analyzer`
- `custom-observability-reviewer` → fall back to manual 4-criteria checklist
  (metrics, logs, traces, alerting)
- `code-review` → use `rubber-duck` in diff-review mode

Record the fallback in the gate outcome.
