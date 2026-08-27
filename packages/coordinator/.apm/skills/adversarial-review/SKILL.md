---
name: adversarial-review
description: >
  Multi-model hostile critique of a plan, diff, design, or decision.
  Runs parallel reviews on two independent model lineages so feedback
  is genuinely independent rather than a same-lineage rubber-stamp.
---

# Adversarial Review

A hostile, thorough review designed to find what other reviews miss.
Uses two independent model lineages for genuinely diverse perspectives.

## When to use

Trigger phrases: "give this an adversarial review", "rubber-duck this with
teeth", "what could go wrong here", "find the regression", "argue against
this plan", "second opinion on this diff", "stress-test this design",
"is there a simpler approach I'm missing".

## Protocol

### Panel-member mode

If the handoff envelope sets `consensus_role: panel-member`, perform one hostile
review directly and return the requested structured verdict. Do not select
models, dispatch subagents, or synthesize other reviewers; the caller's
`consensus-panel` owns those responsibilities.

The remaining protocol is for standalone use only.

### 1. Select two independent models

Choose 2 models from **different lineages** to ensure independent analysis:

| Lineage | Example models |
|---------|---------------|
| Anthropic | Claude Opus, Claude Sonnet |
| OpenAI | GPT-5.5, GPT-5.4 |
| Google | Gemini Pro, Gemini Flash |

Select the two highest-capability models from different families. If only
one family is available, use two distinct models from it and note reduced
independence.

### 2. Dispatch parallel reviews

Fire 2 parallel `task` calls, each with a different model override. Both
receive the same prompt:

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

For each finding, provide:
- Severity: blocker | major | minor | informational
- Confidence: high | medium | low
- Location: file:line or section reference
- Issue: what's wrong
- Fix: concrete suggestion

Only report findings you have medium or high confidence in.
Do not comment on style, formatting, or naming unless it causes a bug.

<context>
{provide: intent summary, design doc, diffs, issue body as applicable}
</context>
```

### 3. Synthesize findings

Merge results from both models:

1. **Deduplicate** by `(location, issue)` — same finding from both models
   increases confidence.
2. **Corroborate** — findings flagged by both models independently are
   promoted to high confidence.
3. **Divergence** — findings from only one model keep their original
   confidence level.
4. **Severity** — take the higher severity when models disagree.

### 4. Report

Structure the output:

```markdown
## Adversarial Review Summary

**Models used**: <model-1>, <model-2>
**Scope**: <what was reviewed>

### Blocker findings
<findings sorted by confidence>

### Major findings
<findings sorted by confidence>

### Minor / informational
<findings sorted by confidence>

### Corroboration matrix
| Finding | Model 1 | Model 2 | Final severity | Final confidence |
|---------|---------|---------|----------------|-----------------|

### Verdict
<pass | pass-with-concerns | fail>
```

## Integration with review-fix-loop

When used as the `reviewer` in a `review-fix-loop`, the loop dispatches
`implementer` to fix blocker/major findings and re-runs this skill on
the updated result.

## Fallback

If multi-model dispatch is unavailable (only one model accessible):

1. Run a single hostile `rubber-duck` review with the same adversarial prompt.
2. Mark the output as **reduced-assurance** (single-model, no corroboration).
3. If `consensus-panel` is available, use it to run the adaptive 2+1 panel on
   the same specialist instead (2 reviewers, plus a tiebreaker only when an
   escalation trigger fires).
