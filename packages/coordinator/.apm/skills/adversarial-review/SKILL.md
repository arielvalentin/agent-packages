---
name: adversarial-review
description: >
  Adaptive one-to-three-reviewer hostile critique of a plan, diff,
  design, or decision.
  In standalone mode, defer dispatch, schema, synthesis, reporting, and
  failure handling to `consensus-panel` so adversarial review follows the
  canonical GPT-first review contract instead of maintaining a local copy.
---

# Adversarial Review

A hostile, thorough review designed to find what other reviews miss.
Standalone use defers to `consensus-panel` for the canonical review
contract: scope classification, dispatch, JSON verdict schema, synthesis,
reporting, and failure handling.

## When to use

Trigger phrases: "give this an adversarial review", "rubber-duck this with
teeth", "what could go wrong here", "find the regression", "argue against
this plan", "second opinion on this diff", "stress-test this design",
"is there a simpler approach I'm missing".

## Protocol

### Dispatched mode

If the handoff envelope sets `consensus_role` to `panel-member` **or**
`single`, perform one hostile review directly and return the requested
structured verdict. Do not select models, dispatch subagents, or synthesize
other reviewers; the caller's `consensus-panel` owns those responsibilities.
`single` is the fast path for non-code and tiny changes — fanning out to a
second model there would defeat the exemption.

The remaining protocol is for standalone use only.

### 1. Bootstrap explicit multi-review intent before panel loading

Consume a persisted `explicit_multi_review` handoff value when present. For a
direct standalone invocation without that field, derive it before attempting
to load `consensus-panel` using the coordinator's canonical four intents:
consensus, a panel review, multiple independent verdicts, or a multi-reviewer
adversarial review. Persist the result as `EXPLICIT_MULTI_REVIEW` for the whole
review attempt.

Standalone derivation table:

| User intent | `EXPLICIT_MULTI_REVIEW` |
|-------------|-------------------------|
| consensus | `true` |
| panel review | `true` |
| multiple independent verdicts | `true` |
| multi-reviewer adversarial review | `true` |
| none of the above | `false` |

The phrase "direct standalone invocation" does not change the value.
Never set the value to false when the request text contains any listed intent.
Standalone is an execution mode, not a reason to discard explicit intent.

`EXPLICIT_MULTI_REVIEW=true` means `PANEL_2`: two
`consensus_role: panel-member` initial envelopes. It never permits
`SINGLE_1`.

### 2. Delegate standalone orchestration to `consensus-panel`

For standalone use, invoke `consensus-panel` first. It is the single source of
truth for scope classification, GPT-first reviewer selection, dispatch count,
the canonical JSON verdict schema, synthesis, the
`${ARTIFACTS_DIR}/04-review-consensus.md` report, and failure handling.

Do not restate or invent those rules here. In particular, do not replace them
with a local Markdown verdict, a local severity list, or an
adversarial-review-specific fallback.

### 3. Review content for each dispatched reviewer

Every reviewer dispatched through `consensus-panel` uses the same adversarial
stance:

```
You are an adversarial reviewer. Your job is to find problems, not
to be encouraging. Assume the author is wrong until proven otherwise.

Review the following for:
1. Bugs, logic errors, and edge cases the author likely missed
2. Security vulnerabilities (injection, auth bypass, data exposure)
3. Performance risks at scale (N+1, hot paths, memory pressure)
4. Design flaws and unnecessary complexity
5. Regressions — what existing behavior could this break?
6. Missing error handling and failure modes
7. Whether the change actually solves the stated problem

Return only the exact JSON verdict schema required by `consensus-panel`.
Populate that schema from the review above. Do not emit prose, Markdown
headings, a local summary report, or `informational` findings. Put caveats in
the schema fields that `consensus-panel` defines.

<context>
{provide: intent summary, design doc, diffs, issue body as applicable}
</context>
```

## Integration with review-fix-loop

When used as the `reviewer` in a `review-fix-loop`, the loop dispatches
`arielvalentin: implementer` when the companion development-workflow package
is installed, or keeps the fix with the current orchestration owner otherwise,
then re-runs this skill on the updated result.

## Fallback

If `consensus-panel` is unavailable, fails to load, fails dispatch, or cannot
produce the two requested initial reviewers:

- `EXPLICIT_MULTI_REVIEW=true` → return `STOP_UNAVAILABLE` immediately. Never
  retry through the missing panel, degrade to `SINGLE_1`, or report pass.
- A mandatory high-risk review → stop unavailable.
- Otherwise, for a non-explicit routine review, perform exactly one bounded
  direct adversarial review as `SINGLE_1`.

After successful panel loading, model-discovery or reviewer-output failures use
the panel's bounded retry/failure rules. If those rules still cannot satisfy an
explicit requested reviewer count, return `STOP_UNAVAILABLE` rather than
looping back into panel loading.
