---
name: consensus-panel
description: >
  Dispatch a review or research task to N models in parallel and synthesize
  a consensus verdict (simple/correct/pragmatic/beneficial). Use for every
  specialist review dispatch.
---

# Consensus Panel

## When to use

Use before any review or research dispatch. Skipping this is a bug —
callers must either follow the panel protocol or explicitly document why
a single-model call is acceptable.

## Panel selection (runtime, not hard-coded)

Select panelists from models available in the current runtime/session:

1. Determine the currently available models at dispatch time.
2. Prefer 3 high-capability models from distinct families when possible.
3. If 3 distinct families are not available, use the best 3 distinct models and
   note reduced diversity in the report.
4. If explicit model discovery is unavailable, dispatch without model
   overrides (runtime auto-selection) and record that fallback in the report.

## Dispatch

Fire N parallel `task` calls to the **same specialist agent**, each with a
different selected `model` override and `model_index` set in the handoff
envelope. Include the JSON verdict schema below in every panelist prompt so
the panelist can return structured output even if it doesn't load this skill.

## Verdict schema (every panelist returns this)

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

1. Merge `findings`; dedupe by `(location, issue)`.
2. Per verdict axis: majority wins; `mixed` when no majority.
3. Surface a disagreement matrix when the panel diverges.
4. Write the report to `${ARTIFACTS_DIR}/04-review-consensus.md`
   (see `handoff-envelope` skill for path resolution).

## Report contents

- Aggregate verdict block.
- Selected model IDs used for this panel.
- Disagreement matrix (which model returned what per axis).
- Consolidated findings, sorted by severity.
- Confidence line: majority confidence value.

## Failure modes

- Panelist returns prose instead of JSON → retry once with schema re-injected; if still prose, record verdict as `mixed` and note it.
- Fewer than 3 responses → surface which model(s) failed, proceed with what returned; flag as reduced-confidence.
