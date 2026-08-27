---
name: review-fix-loop
description: >
  Reusable gate pattern: dispatch a reviewer, fix findings with an implementer,
  re-run the reviewer, and escalate after a retry limit. Use for every
  review-then-fix gate in the coordinator workflow.
---

# Review-Fix Loop

A parameterized gate that eliminates repeated prose for adversarial, security,
code-review, and observability review gates.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `reviewer` | yes | — | Agent or skill to dispatch for review (e.g., `adversarial-review`, `security-review`, `code-review`, `gho11y:telemetry-reviewer`) |
| `fixer` | no | `implementer` | Agent dispatched to address findings |
| `scope` | yes | — | What to review: diff ref, artifact path, or description of review target |
| `context` | no | — | Additional context for the reviewer (intent summary, design doc, issue body) |
| `focus` | no | — | Specific review focus or criteria (e.g., "intent-coverage", "exploitable vulnerabilities only") |
| `max_retries` | no | 2 | Maximum fix-then-re-review cycles before escalation |
| `severity_threshold` | no | `blocker,major` | Comma-separated severities that trigger a fix cycle |
| `on_exhaust` | no | `escalate` | What to do when retries are exhausted: `escalate` (ask user) or `warn` (proceed with warning) |
| `skip_condition` | no | — | Condition under which this gate is skipped (e.g., "refactor flow unless touching auth/crypto") |

## Protocol

1. **Check skip condition** — if `skip_condition` is defined and matches the
   current context, skip the gate entirely. Record the skip reason.

2. **Dispatch reviewer** — run the `reviewer` through `consensus-panel` unless
   that role is explicitly designated single-model. `consensus-panel` classifies
   the scope first: non-code and tiny scopes take the single-reviewer fast path
   (exactly one mid- or high-capability reviewer, no panel), and substantive
   code changes take the adaptive 2+1 panel — two reviewers in parallel with a
   third added only when an escalation trigger fires. Send `scope` and
   `context`; if `focus` is provided, include it as explicit review
   instructions.

3. **Evaluate findings** — filter findings by `severity_threshold`.
   - No findings at or above threshold → **gate passes**. Record result.
   - Findings at or above threshold → proceed to fix cycle.

4. **Fix cycle** (up to `max_retries` iterations):
   a. Dispatch `fixer` with the findings as required fixes.
   b. Re-run `reviewer` through the same panel policy against the updated
      `scope`. Re-classify the scope each cycle: a scope that is still non-code
      or tiny stays on the single-reviewer fast path, and a panelled scope
      starts a **fresh initial wave of 2** reviewers, escalating to a tiebreaker
      only if that cycle's own responses fire an escalation trigger — a previous
      cycle's escalation does not carry over.
   c. If no findings at or above threshold → **gate passes**. Record result.
   d. If same finding is raised again after a fix attempt, increment a
      per-finding repeat counter.

5. **Exhaustion** — if `max_retries` is reached with unresolved findings:
   - `on_exhaust: escalate` → stop and present unresolved findings to the
     user for a decision (fix manually, waive, or abort).
   - `on_exhaust: warn` → proceed but record unresolved findings as warnings
     in the final message. Flag as reduced-assurance.

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
`(category, description)` — the coordinator must not loop indefinitely on
a finding the fixer cannot resolve.

## Usage examples

### Adversarial review gate
```
reviewer: adversarial-review
scope: full context (design doc + all diffs + stage review findings)
context: design doc, implementation summary, rubber-duck findings
max_retries: 2
severity_threshold: blocker,major
on_exhaust: escalate
```

### Security review gate
```
reviewer: security-review
scope: cumulative diff (branch vs base)
focus: exploitable vulnerabilities only, with severity and confidence
max_retries: 2
severity_threshold: blocker,major
on_exhaust: escalate
skip_condition: refactor flow unless touching auth, crypto, input validation, or access control
```

### Documentation-only review (single-reviewer fast path)
```
reviewer: code-review
scope: docs-only diff (branch vs base)
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
max_retries: 1
severity_threshold: blocker
on_exhaust: warn
```

### Observability validation
```
reviewer: gho11y:telemetry-reviewer
scope: cumulative diff (branch vs base)
focus: metrics, logs, traces, alerting/SLO coverage
max_retries: 2
severity_threshold: blocker,major
on_exhaust: escalate
skip_condition: documentation-only, dependency bumps, or user-marked observability-exempt
```

## Fallback behavior

If the specified `reviewer` is unavailable:
- `adversarial-review` → use `rubber-duck` through `consensus-panel`
- `security-review` → use `se-security-reviewer` + `sast-sca-security-analyzer`
- `gho11y:telemetry-reviewer` → fall back to manual 4-criteria checklist
  (metrics, logs, traces, alerting)
- `code-review` → use `rubber-duck` in diff-review mode

Record the fallback in the gate outcome.
