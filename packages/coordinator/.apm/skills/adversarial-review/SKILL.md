---
name: adversarial-review
description: >
  Multi-model hostile critique of a plan, diff, design, or decision.
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

### 1. Delegate standalone orchestration to `consensus-panel`

For standalone use, invoke `consensus-panel` first. It is the single source of
truth for scope classification, GPT-first reviewer selection, dispatch count,
the canonical JSON verdict schema, synthesis, the
`${ARTIFACTS_DIR}/04-review-consensus.md` report, and failure handling.

Do not restate or invent those rules here. In particular, do not replace them
with a local Markdown verdict, a local severity list, or an
adversarial-review-specific fallback.

### 2. Review content for each dispatched reviewer

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
`implementer` to fix blocker/major findings and re-runs this skill on
the updated result.

## Fallback

If model discovery, dispatch, or reviewer output fails in standalone use, keep
routing through `consensus-panel` and apply its fallback and failure rules
instead of inventing a local adversarial-review path.
