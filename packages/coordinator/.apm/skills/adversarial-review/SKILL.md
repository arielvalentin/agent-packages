---
name: adversarial-review
description: >
  Multi-model hostile critique of a plan, diff, design, or decision.
  Runs parallel reviews through the canonical consensus-panel selection
  policy so feedback is independent without conflicting model rules.
---

# Adversarial Review

A hostile, thorough review designed to find what other reviews miss.
Uses independently dispatched reviewers for separate perspectives.

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

### 1. Delegate model selection

Delegate standalone model selection to `consensus-panel`; do not maintain a
separate selection algorithm here. Its canonical GPT-first policy takes
precedence and must not be overridden by cross-family or lineage-diversity
preferences. User-requested GPT-first consistency and determinism intentionally
override prior cross-family diversity. That tradeoff may produce reduced
model-family diversity, which the final report must state explicitly.

Use the distinct model IDs selected by `consensus-panel`. Wave 1 uses eligible
mid-tier or fast-capable GPT IDs first, excludes fast/light models, and uses an
unreserved high-capability GPT only after the preferred GPT class is exhausted.
A non-GPT fills a slot only when the canonical policy determines that eligible
GPT IDs are insufficient. Apply that GPT-first precedence before catalog order:
an earlier non-GPT must not displace a later eligible GPT when two eligible GPT
IDs remain after the Wave 2 reservation.

Standalone use follows the same adaptive 2+1 policy: classify the scope first
and take the single-reviewer fast path when it qualifies, then dispatch the two
initial models, and dispatch **exactly one** high-capability tiebreaker only
when one of `consensus-panel`'s five escalation triggers fires. That skill owns
the triggers and the synthesis rules; do not restate or invent them here.

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

Merge results from every reviewer that returned — the single reviewer on the
fast path, the two initial models, or all three once a tiebreaker was
dispatched:

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
