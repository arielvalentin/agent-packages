---
name: review-fix-loop
description: >
  Reusable gate pattern: dispatch a reviewer, fix findings with a fixer,
  re-run the reviewer, and escalate after a retry limit. Use only when a review
  gate is explicitly requested or justified by high-risk work.
---

# Review-Fix Loop

A parameterized gate that eliminates repeated prose for adversarial, security,
code-review, and observability review gates.

**Incomplete review evidence never passes a gate.** Zero valid reviewer
responses means `escalated`, not `passed`, even though there are no findings to
filter. Evaluate "no blocker/major findings" only after a complete, valid
review result exists.

**Explicit panel invariant:** if the user explicitly requested consensus, a
panel, or a multi-reviewer adversarial review, route every initial review and
every post-fix re-review as `PANEL_2`: two
`consensus_role: panel-member` initial envelopes. `SINGLE_1` is valid only for
an internally selected, fast-path-eligible review.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `reviewer` | yes | — | Agent or skill to dispatch for review (e.g., `adversarial-review`, `security-review`, `code-review`, `gho11y:telemetry-reviewer`) |
| `fixer` | no | `arielvalentin: implementer` | Agent dispatched to address findings when the companion development-workflow package is installed; otherwise the orchestration owner fixes directly |
| `scope` | yes | — | What to review: diff ref, artifact path, or description of review target |
| `context` | no | — | Additional context for the reviewer (intent summary, design doc, issue body) |
| `focus` | no | — | Specific review focus or criteria (e.g., "intent-coverage", "exploitable vulnerabilities only") |
| `mandatory` | no | `false` | When true, incomplete/unavailable review, unresolved threshold findings, warn, and waiver all fail closed |
| `max_retries` | no | 1 | Maximum fix-then-re-review cycles before escalation |
| `severity_threshold` | no | `blocker,major` | Comma-separated severities that trigger a fix cycle |
| `on_exhaust` | no | `escalate` | What to do when retries are exhausted: `escalate` (ask user) or `warn` (proceed with warning) |
| `skip_condition` | no | — | Condition under which this gate is skipped (e.g., "refactor flow unless touching auth/crypto") |

## Protocol

1. **Check skip condition** — if `skip_condition` is defined and matches the
   current context, skip the gate entirely. Record the skip reason. An explicit
   user-requested review or a mandatory review ignores `skip_condition`; the
   caller must decide applicability before invoking the mandatory gate.

2. **Dispatch reviewer** — use one reviewer by default. Route through
   `consensus-panel` only when the user explicitly requested consensus, the
   review is judgment-heavy and high-risk, or another loaded skill requires the
   panel. Preserve why consensus was selected. An explicit user request for
   consensus, a panel, or a multi-reviewer adversarial review always dispatches
   two `consensus_role: panel-member` initial envelopes with `model_index: 1`
   and `2`, even for tiny or non-code scope; it never sends a
   `consensus_role: single` envelope. Only system-selected consensus may let
   `consensus-panel` classify non-code or tiny scope into the single-reviewer
   fast path. Send `scope` and `context`; if `focus` is provided, include it as
   explicit instructions.

3. **Evaluate review completion, then findings** — first verify the reviewer
   or panel returned a complete, valid outcome. An incomplete, timed-out, or
   invalid review never passes merely because it returned no findings.
   Mandatory or explicitly requested gates stop/escalate on incomplete
   evidence; optional gates may warn only when the caller explicitly allows
   reduced assurance. Then filter findings by `severity_threshold`.
   - No findings at or above threshold → **gate passes**. Record result.
   - Findings at or above threshold → proceed to fix cycle.

4. **Fix cycle** (up to `max_retries` iterations):
   a. Dispatch `fixer` with the findings as required fixes.
   b. Choose the re-review route in this order:
      1. If the user explicitly requested consensus, a panel, or a
         multi-reviewer adversarial review, return `PANEL_2`. Start a **fresh
         initial wave of 2** with two `consensus_role: panel-member` envelopes.
         Do not re-classify this request into the fast path and do not send
         `consensus_role: single`.
      2. Otherwise, re-classify the updated `scope`: system-selected non-code
         or tiny scope stays on the single-reviewer fast path, while a
         panel-required scope starts a fresh initial wave of 2.
      Escalate only if that cycle's own responses fire a trigger. A previous
      cycle's escalation does not carry over.
   c. If no findings at or above threshold → **gate passes**. Record result.
   d. If same finding is raised again after a fix attempt, increment a
      per-finding repeat counter.

5. **Exhaustion** — if `max_retries` is reached with unresolved findings:
   - `on_exhaust: escalate` → stop and present unresolved findings to the
     user for a decision. Optional gates may offer fix manually, waive, or
     abort. Mandatory or explicitly requested gates may offer only fix/retry
     or abort.
   - `on_exhaust: warn` → proceed but record unresolved findings as warnings
     in the final message. Flag as reduced-assurance.
   - For any mandatory or explicitly requested gate, `on_exhaust: warn` and
     waiver are invalid. Stop/escalate with unresolved blocker/major findings.
     This includes mandatory adversarial and security reviews.

6. **Record outcome** — regardless of path, record:
   - Gate name (derived from `reviewer`)
   - Outcome: `passed`, `passed-after-fixes`, `skipped` (with reason),
     `escalated`, or `warned`
   - Number of fix cycles used
   - Review mode per cycle: `single-reviewer fast path` (with the exemption that
     applied) or `adaptive 2+1`
   - Whether any review wave escalated to a tiebreaker, and which trigger fired
   - Unresolved findings (if any)

For routine code changes, this gate is optional and must be the only review
gate. Make the first patch and run targeted validation before invoking it.
High-risk or explicitly requested review/fix loops may use a larger retry
budget, but every invocation must declare a finite limit and stop condition.

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
- mandatory or explicitly requested reviewer → stop and record the required
  reviewer as unavailable. Do not substitute another reviewer or report pass.
- optional `adversarial-review` → use `rubber-duck` through `consensus-panel`
- `security-review` → stop and record the mandatory reviewer as unavailable.
  Do not substitute a differently scoped reviewer or continue with a
  success-shaped security result.
- `gho11y:telemetry-reviewer` → fall back to manual 4-criteria checklist
  (metrics, logs, traces, alerting)
- `code-review` → use `rubber-duck` in diff-review mode

Record the fallback in the gate outcome.
