---
name: consensus-panel
description: >
  Dispatch a specialist review to two distinct suitable GPT model IDs in parallel,
  then add a distinct high-capability GPT model ID only as a conditional tiebreaker,
  and synthesize a consensus verdict (simple/correct/pragmatic/beneficial). Use for
  explicit multi-review requests and judgment-heavy high-risk reviews; never duplicate
  identical fact-finding research across models to manufacture consensus.
---

# Consensus Panel

**Single reviewer for internally selected trivial scopes, adaptive 2+1 for
substantive code or `EXPLICIT_MULTI_REVIEW`.** Non-code-only and genuinely tiny
changes get exactly one mid- or high-capability reviewer when the system
selected consensus internally. Substantive changes and explicit requests for
independent verdicts get two reviewers, plus a third only when it can change
the answer.

```policy-assertions
{"format":"policy-assertions","version":1}
{"id":"consensus.handoff.invalid","contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"route","conditions":["explicit-multi-review.missing-or-invalid"],"result":"STOP_INVALID_HANDOFF","allowed":false,"precedence":[]}
{"id":"consensus.automatic.unavailable","contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"fallback","conditions":["explicit-multi-review.false","automatic-capacity.unavailable"],"result":"ADAPTIVE_RECOVERY","allowed":true,"precedence":[]}
{"id":"consensus.automatic.initial-failure","contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"fallback","conditions":["explicit-multi-review.false","dispatch.initial-response.invalid-after-retry"],"result":"ADAPTIVE_RECOVERY","allowed":true,"precedence":[]}
{"id":"consensus.automatic.single","contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["explicit-multi-review.false","scope.fast-path-eligible"],"result":"SINGLE_1","allowed":true,"precedence":[]}
{"id":"consensus.automatic.panel-required","contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["capacity.initial-slots.two","explicit-multi-review.false","scope.panel-required"],"result":"PANEL_2","allowed":true,"precedence":[]}
{"id":"consensus.explicit.panel","contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["explicit-multi-review.true","capacity.initial-slots.two"],"result":"PANEL_2","allowed":true,"precedence":[]}
{"id":"consensus.explicit.under-capacity","contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["explicit-multi-review.true","capacity.initial-slots.less-than-two"],"result":"STOP_UNAVAILABLE","allowed":false,"precedence":[]}
{"id":"consensus.explicit.initial-failure","contract":"consensus.entry","actor":"system","provenance":"review-handoff","interaction":"review-handoff","action":"dispatch","conditions":["explicit-multi-review.true","dispatch.initial-response.invalid-after-retry"],"result":"STOP_UNAVAILABLE","allowed":false,"precedence":["consensus.explicit.panel"]}
```

Invalid handoffs return
{{policy:consensus.handoff.invalid.result}}. Explicit requests with capacity
dispatch {{policy:consensus.explicit.panel.result}}. Explicit requests with
insufficient capacity return
{{policy:consensus.explicit.under-capacity.result}}, and a failed initial
response after retry returns
{{policy:consensus.explicit.initial-failure.result}}. Non-explicit unavailable
capacity uses {{policy:consensus.automatic.unavailable.result}}. The automatic
initial-response failure uses
{{policy:consensus.automatic.initial-failure.result}}. The automatic tiny/non-code path uses
{{policy:consensus.automatic.single.result}}, while an automatic panel-required
scope with capacity dispatches
{{policy:consensus.automatic.panel-required.result}}.

## Entry decision table (apply first)

`AUTOMATIC_FALSE_FALLBACK = ADAPTIVE_RECOVERY`.
For `explicit_multi_review=false`, automatic capacity or initial-response
failure returns `ADAPTIVE_RECOVERY`; `STOP_UNAVAILABLE` is exclusive to the
equivalent `explicit_multi_review=true` failures.

| Input/state | Required result |
|-------------|-----------------|
| `explicit_multi_review` missing, null, string, or non-boolean | `STOP_INVALID_HANDOFF` ({{policy:consensus.handoff.invalid.result}}) |
| `explicit_multi_review=false` and scope is automatic fast-path eligible | `SINGLE_1` ({{policy:consensus.automatic.single.result}}) |
| `explicit_multi_review=false`, scope requires a panel, and 2 initial slots are available | `PANEL_2` ({{policy:consensus.automatic.panel-required.result}}) |
| `explicit_multi_review=false` and automatic discovery/capacity is unavailable | `ADAPTIVE_RECOVERY` ({{policy:consensus.automatic.unavailable.result}}) |
| `explicit_multi_review=false` and one initial response remains invalid after retry | `ADAPTIVE_RECOVERY` ({{policy:consensus.automatic.initial-failure.result}}) |
| `explicit_multi_review=true` and fewer than 2 distinct suitable initial slots | `STOP_UNAVAILABLE` ({{policy:consensus.explicit.under-capacity.result}}) |
| `explicit_multi_review=true` and either initial slot still fails after its one same-slot retry | `STOP_UNAVAILABLE` ({{policy:consensus.explicit.initial-failure.result}}) |

This table overrides the fast-path, escalation, synthesis, and generic failure
rules below. Explicit under-capacity never becomes a single-reviewer path.
For a missing field, the only valid answer is `STOP_INVALID_HANDOFF`. For an
optional automatic panel with `explicit_multi_review=false` and one invalid
initial response, the immediate routing answer is `ADAPTIVE_RECOVERY`, not
`STOP_UNAVAILABLE`; a later incomplete outcome remains non-passing.
When model discovery or automatic capacity is unavailable and
`explicit_multi_review=false`, the immediate routing answer is likewise
`ADAPTIVE_RECOVERY`, never `STOP_UNAVAILABLE`.

Apply this mechanical false-control before reading the generic failure modes:

```text
if explicit_multi_review == false
and (automatic capacity is unavailable
     or an initial response remains invalid after retry):
  route = ADAPTIVE_RECOVERY
  continue into the bounded automatic recovery rules
```

`STOP_UNAVAILABLE` in this skill's entry contract applies to those capacity or
initial-response failures only when `explicit_multi_review=true`.
`ADAPTIVE_RECOVERY` is an intermediate route, not a successful terminal
verdict: dispatch without model overrides when discovery is unavailable,
escalate an invalid initial response under the automatic failure rules, and
still require the resulting review gate to complete before declaring success.

## Persisted explicit multi-review input

Consume `explicit_multi_review` from the always-available coordinator
bootstrap and expose it as `EXPLICIT_MULTI_REVIEW`. The caller derives and
persists that boolean before attempting to load this skill.

The field is required and must be a JSON boolean. Missing, null, string, or
otherwise invalid values return `STOP_INVALID_HANDOFF`; this skill never infers
false from absence. Boolean `false` is valid and must not be treated as
missing, empty, or invalid. The persisted boolean is authoritative; do not
re-derive it from quoted user wording downstream.

Routing invariant:

- `EXPLICIT_MULTI_REVIEW=true` routes to `PANEL_2`: two
  `consensus_role: panel-member` initial envelopes, even for tiny or non-code
  scope.
- The single-reviewer path is available only when
  `EXPLICIT_MULTI_REVIEW=false`.

Every reviewer-selection, re-review, retry, and downstream panel-required
decision uses the persisted value. This skill never re-derives or resets it.

## When to use

Use when the caller has already determined that consensus is warranted:

- `EXPLICIT_MULTI_REVIEW` is true.
- A judgment-heavy, high-risk review needs independent verdicts to resolve
  uncertainty.
- Another loaded skill explicitly requires this panel.

Do not insert a consensus panel into routine code changes or simple lookups.
Those use direct work and, when needed, at most one review gate. After the
caller selects consensus, classify the scope below before choosing models.

`EXPLICIT_MULTI_REVIEW` always uses at least the two-reviewer initial wave. The
single-reviewer exemption below applies only when the system selected consensus
internally.

Do not use this skill for research fact-finding. Research uses one agent per
source; identical queries must never be duplicated across models to manufacture
consensus.

## Step 1 — Classify the scope (always first)

Classify the review scope **before** selecting any model. Re-classify at the
start of every review cycle; a fix that grows the scope also changes its class.

A scope is **fast-path eligible** when either of these holds:

1. **Non-code change** — every changed file is a text artifact with no
   executable effect: documentation, prose, markdown, comments, changelog,
   license, or similar. No source, config, schema, script, or workflow file is
   changed. Agent prompts, skills, instructions, governance rules, and other
   behavior-defining policy are executable configuration, not non-code
   documentation.
2. **Tiny change** — at most **10 changed lines** (added + removed, ignoring
   pure-whitespace lines) across at most **2 files**, including one-line
   changes, with no new or materially altered control flow, no new dependency,
   and no change to a public API contract.

Operational definitions, so two agents classify the same diff identically:

- **Pure-whitespace line** — a changed line whose before and after differ only
  in whitespace. It does not count toward the 10-line budget.
- **New or materially altered control flow** — adding or removing a branch,
  loop, guard, early return, or exception path, **or** changing the condition
  of an existing one. Rewording a comment above a branch is not.
- **Public API contract** — any signature, route, event payload, schema,
  environment variable, CLI flag, or exported symbol that something outside the
  changed files can depend on.
- **New dependency** — referencing a package that is not already declared in a
  dependency manifest (`package.json`, `go.mod`, `Gemfile`, `requirements.txt`,
  and the like). Importing another symbol from a package the repository already
  declares is not a new dependency; adding the manifest entry is.

A fast-path-eligible scope is **disqualified** — and takes the full panel — when it
touches any of the following, however small the diff:

1. Authentication, authorization, or access control.
2. Cryptography or secrets.
3. Input validation or untrusted-input parsing.
4. A public API contract.
5. Concurrency, locking, or shared mutable state.
6. Data migration, deletion, or any other irreversible data operation.
7. Agent, skill, instruction, orchestration, governance, or safeguard policy.
8. Human-interaction, attribution, public-posting, permission, approval, or
   destructive-action controls.
9. Review requirements or the tests/scripts that enforce these controls.
10. CI, deployment, runtime, or permission-affecting executable configuration,
    workflows, and scripts.
11. Privacy, personal data, sensitive-data exposure, or data-redaction controls.
12. Unsafe code execution, command execution, shell execution, or executable
    content handling.
13. Trust-boundary changes, including network access, filesystem access, or
    crossing from untrusted to trusted execution.

This list is closed: a scope that touches none of these and meets the size
threshold is fast-path eligible.

A scope is **panel-required** when it is not fast-path eligible, is disqualified
above, or `EXPLICIT_MULTI_REVIEW` is true. Only an internally selected,
fast-path-eligible scope uses the single-reviewer path. Every panel-required
scope takes the adaptive 2+1 panel.

## Step 2a — Single-reviewer fast path (internally selected scopes only)

Use this path only when the scope is fast-path eligible and
`EXPLICIT_MULTI_REVIEW` is false. Dispatch **exactly one** reviewer. Do not run
a panel, do not select a second model, and do not synthesize across models.

- **Model tier** — a mid-tier model by default (documentation, prose, and
  mechanical tiny edits); a high-capability model when the tiny change is
  semantically subtle — a boundary or off-by-one condition, a regex, a format
  string, or an arithmetic/units change. Never a fast/light model.
- **Envelope** — set `explicit_multi_review: false` and
  `consensus_role: single`. Omit `model_index` and `panel_wave`. Like
  `panel-member`, this value tells a panel-aware specialist it is already
  dispatched, so it reviews directly instead of selecting or dispatching
  reviewers of its own.
- **Output** — the reviewer returns the same JSON verdict schema below, so
  downstream gates are unchanged.
- **Report** — still write the report artifact, recording
  `panel: single-reviewer fast path` and which exemption applied.

This exemption **takes precedence** over internally selected consensus
workflows in the coordinator or `review-fix-loop`; it never overrides
`EXPLICIT_MULTI_REVIEW`. A single `blocker`/`major` finding does not promote a
fast-path scope to a panel; only re-classification under Step 1 does. The safety
argument is the size and disqualifier bounds, not the finding: a scope this
small that touches none of the disqualified categories has a blast radius one
reviewer can hold.

## Step 2b — Panel selection for panel-required scopes

Select panelists from models available in the current runtime/session:

1. Determine the currently available models at dispatch time.
2. **Initial wave** — prefer exactly 2 distinct suitable GPT model IDs, using
   mid-tier or fast-capable models appropriate for review latency. Do not spend
   a high-capability model here. "Fast-capable" means a capable model tuned
   for latency, never a fast/light model — the same floor as the fast path.
3. **Tiebreaker** — prefer a distinct high-capability GPT model ID independent
   of the initial wave. Dispatch it only when an escalation trigger fires.
4. Use suitable non-GPT models only to fill slots when the available suitable
   GPT choices cannot fill them. GPT-first intentionally overrides cross-family
   diversity: when enough suitable GPT choices exist, all three model slots are
   GPT. Do not introduce a non-GPT model for diversity. Note any non-GPT
   fallback in the report.
5. If `EXPLICIT_MULTI_REVIEW=true`, select two distinct suitable initial model
   slots before dispatch. If discovery is unavailable or two distinct suitable
   slots cannot be proven, return `STOP_UNAVAILABLE`; runtime auto-selection
   and replacement reviewers do not satisfy explicit capacity.
6. If `EXPLICIT_MULTI_REVIEW=false` and explicit discovery is unavailable,
   dispatch without model overrides (runtime auto-selection) and record that
   bounded automatic fallback in the report.

## Dispatch (panel-required scopes only)

### Wave 1 — always exactly 2, in parallel

Fire exactly 2 parallel `task` calls to the **same specialist agent**. When
model discovery succeeded, give them different selected `model` overrides.
When discovery is unavailable and `EXPLICIT_MULTI_REVIEW=false`, issue both
calls without model overrides and record reduced model-distinctness assurance;
this automatic fallback is prohibited when `EXPLICIT_MULTI_REVIEW=true`.
Never dispatch a third reviewer in this wave.

Set `explicit_multi_review: EXPLICIT_MULTI_REVIEW`,
`consensus_role: panel-member`, `model_index: 1` and `2`, and
`panel_wave: initial` in every handoff envelope. Retry envelopes preserve all
four fields unchanged, including the originally assigned model when one was
selected. These values tell panel-aware specialists they are already
dispatched, so they review directly instead of selecting or dispatching their
own reviewers. Include the JSON verdict schema below in every panelist prompt
so the panelist can return structured output even if it doesn't load this
skill.

For `EXPLICIT_MULTI_REVIEW=true`, both assigned initial slots must dispatch and
return valid responses. Retry a failed/invalid initial slot once with the same
assigned model and envelope. If either slot still fails, return
`STOP_UNAVAILABLE`; do not replace it, dispatch the tiebreaker, or synthesize
success from one initial reviewer plus another wave.

### Wave 2 — exactly 1, only on escalation

Evaluate the escalation triggers below against the wave-1 responses.

- **No trigger fires** → synthesize immediately from the two agreeing
  responses. Do not dispatch a third reviewer.
- **Any trigger fires** → fire exactly **one** additional `task` call to the
  same specialist with the reserved high-capability model and a handoff that
  sets `explicit_multi_review: EXPLICIT_MULTI_REVIEW`,
  `consensus_role: panel-member`, `model_index: 3`, and
  `panel_wave: tiebreak`.

The tiebreaker receives the same scope and context as wave 1 and must **not**
receive the wave-1 verdicts or findings — its value depends on reviewing
independently. Never dispatch a fourth reviewer for a single panel.

## Escalation triggers

Escalation triggers apply only after the required initial wave is complete.
For `EXPLICIT_MULTI_REVIEW`, that means two valid initial responses. An
internally selected single-reviewer scope never escalates to a panel; it is
complete after its single reviewer.

Dispatch the tiebreaker when **any** of these hold:

1. **Verdict disagreement** — the two responses differ on any verdict axis
   (`simple`, `correct`, `pragmatic`, `beneficial`), including `mixed` against
   `yes` or `no`.
2. **Material finding conflict** — the responses contradict each other about the
   same `location`: opposing fixes, or one asserting broken where the other
   asserts correct.
3. **High-risk finding** — either response reports a finding with severity
   `blocker` or `major`.
4. **Insufficient responses** — for `EXPLICIT_MULTI_REVIEW=false`, fewer than
   2 valid responses remain after the retry policy in § Failure modes.
5. **Low confidence** — the synthesized confidence is `low`. Confidence merges
   deterministically as the **lower** of the two reported values, ordered
   `high` > `medium` > `low`, so a `high`+`medium` pair synthesizes to `medium`
   and does not escalate, while any `low` escalates.

**Trigger precedence:** contradictory findings about the same location require
the tiebreaker even when every verdict axis agrees.

| Initial responses | Tiebreaker? |
|-------------------|-------------|
| Verdict axes agree, findings do not conflict, no blocker/major, confidence medium/high | No |
| Verdict axes agree, but findings contradict at the same location | Yes |
| Any verdict axis disagrees, blocker/major appears, a response is missing/invalid, or confidence is low | Yes |

If none of these hold, the two responses agree and carry no high-risk finding.
Synthesize immediately; a third reviewer cannot change the outcome.

## Verdict schema (every reviewer returns this)

```json
{
  "verdict": {
    "simple":     "yes|no|mixed",
    "correct":    "yes|no|mixed",
    "pragmatic":  "yes|no|mixed",
    "beneficial": "yes|no|mixed"
  },
  "confidence": "high|medium|low",
  "findings": [
    {"severity": "...", "location": "...", "issue": "...", "fix": "..."}
  ],
  "notes": "..."
}
```

## Synthesis rules

A response is **valid** when it parses as JSON and every required field is
present with a value from its enum. Anything else — prose, malformed JSON, a
missing or out-of-enum `confidence` or verdict axis — is invalid after the one
retry in § Failure modes, and does not count toward trigger 4.

Findings are covered by that rule: every entry in `findings` must carry
`severity`, `location`, `issue` and `fix`, and `severity` must be one of
`blocker`, `major`, `minor`, `nit`. A response with any malformed finding entry
is invalid, so it neither counts toward trigger 4 nor suppresses trigger 3 —
escalation never depends on a severity the panelist failed to state.

1. Merge `findings`; dedupe by `(location, issue)`. A finding reported by more
   than one panelist is corroborated and keeps the highest severity reported.
2. Per verdict axis:
   - **Fast path (1 response)** — the single reviewer's value is the verdict.
     There is nothing to merge or vote on.
   - **Not escalated (2 responses)** — both responses agree on every axis by
     definition of trigger 1, so the agreed value is the consensus value.
   - **Escalated (3 responses)** — majority wins; `mixed` when no majority.
   - **Escalated with only 2 valid responses** — when the two agree on an axis
     that value stands; when they differ (including the trigger-1 disagreement
     that caused the escalation) the axis is `mixed`. Flag reduced confidence.
   - **Escalated with fewer than 2 valid responses** — mark the panel
     `incomplete`; do not produce a passing review outcome from partial or
     missing evidence. Any available verdict is advisory only.
3. Confidence, in every case: the majority value when one exists, otherwise the
   **lowest** value among the valid responses (`high` > `medium` > `low`). This
   is total — it covers the fast path's single value, the non-escalated pair
   (trigger 5), a three-way `high`/`medium`/`low` split, and any partial set
   after failures.
4. Surface a disagreement matrix whenever the panel diverges.
5. Write the report to `${ARTIFACTS_DIR}/04-review-consensus.md`
   (see `handoff-envelope` skill for path resolution).

## Report contents

- Aggregate verdict block.
- Review mode line: `panel: single-reviewer fast path` (with the exemption that
  applied) or `panel: adaptive 2+1`.
- Selected model IDs used, labelled by wave (`initial` / `tiebreak`), or the
  single reviewer's model and chosen tier on the fast path.
- Escalation line: `escalated: yes|no`, and when yes, which trigger(s) fired.
  Always `no` on the fast path.
- Disagreement matrix (which model returned what per axis). Omitted on the fast
  path.
- Consolidated findings, sorted by severity, with corroboration noted.
- Confidence line: the synthesized confidence per synthesis rule 3 (majority,
  otherwise the lowest valid value).
- Completion line: `complete` only when the required response count is met;
  otherwise `incomplete`. A substantive panel requires at least 2 valid
  responses. Callers must not interpret `incomplete` as a passed review.

## Failure modes

- Reviewer returns prose instead of JSON → retry once with the schema
  re-injected. If it is still prose, record that verdict as `mixed`, count the
  response as invalid for trigger 4, and note it.
- Fast-path reviewer fails to return after the retry → dispatch one replacement
  reviewer at the same or higher tier. Do not silently open a panel.
- `EXPLICIT_MULTI_REVIEW=true` with fewer than 2 valid initial responses after
  the one same-slot retry → return `STOP_UNAVAILABLE`. Do not use a replacement
  model, tiebreaker, or automatic selection to satisfy the requested count.
- `EXPLICIT_MULTI_REVIEW=false` with fewer than 2 valid initial responses →
  use bounded `ADAPTIVE_RECOVERY`: escalate under trigger 4, surface which
  model(s) failed, and flag the result as reduced-confidence.
- Fewer than 2 valid responses in total after escalation → mark the panel
  `incomplete`, surface any advisory result, and stop mandatory or explicitly
  requested review gates. Never convert absent findings into a pass.
- Tiebreaker fails to return → proceed with the 2 initial responses under the
  "escalated with only 2 valid responses" rule above, and flag as
  reduced-confidence.

## Backward compatibility

`model_index` keeps its `1|2|3` values: `1` and `2` are the initial wave, `3` is
the conditional tiebreaker. `panel_wave` is additive — an envelope that omits it
is read as `initial` for `model_index` 1–2 and `tiebreak` for 3. The
single-reviewer fast path reuses the existing `consensus_role: single` value and
adds no new envelope field.
