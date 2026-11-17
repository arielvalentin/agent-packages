---
name: handoff-envelope
description: >
  Parse the handoff envelope from the calling agent and write outputs —
  small results inline, large artifacts to the session directory. Use for
  every structured agent-to-agent handoff.
---

# Handoff Envelope

## When to use

Load at the start of any subagent turn where the prompt begins with a
`handoff_envelope` JSON block, and at the end when writing results.

## Envelope schema

```json
{
  "flow": "feature|bugfix|refactor|research|pr-review",
  "phase": "design|implement|research|research-synthesis|review-context|review-correctness|review-security|review-perf|review-style|review-arch|review-impact|review-consensus|review-post|docs",
  "task_id": "<caller-assigned>",
  "goal": "one-line objective",
  "inputs": {
    "from_agent": "<name>",
    "artifact_paths": ["..."],
    "summary": "<=200 chars"
  },
  "constraints": ["..."],
  "explicit_multi_review": false,
  "consensus_role": "primary|panel-member|single",
  "model_index": "1|2|3",
  "panel_wave": "initial|tiebreak"
}
```

For flows other than `pr-review`, include a top-level
`"acceptance_criteria": ["<concrete, verifiable outcome>"]` field. It is
required and must be a non-empty array. A `pr-review` handoff omits this field;
the PR body and linked issues provide the acceptance criteria.
`inputs.artifact_paths` is optional and may be omitted or empty when there are
no upstream artifacts.

For review phases, `explicit_multi_review` is a required JSON boolean (`true`
or `false`). The calling agent derives it from the user's request before
loading review skills and persists it unchanged in initial, retry, and
post-fix handoffs. Missing, null, string, or other invalid values stop as
`STOP_INVALID_HANDOFF`. No coordinator agent is required.

`model_index` `1` and `2` are the initial panel wave; `3` is the conditional
tiebreaker (see `consensus-panel` skill). `panel_wave` is optional and additive
— an envelope that omits it is read as `initial` for `model_index` 1–2 and
`tiebreak` for 3. A single-reviewer fast-path dispatch uses
`consensus_role: single` and omits both `model_index` and `panel_wave`.

## Artifacts directory

`${ARTIFACTS_DIR:=$HOME/.copilot/session-state/${COPILOT_SESSION_ID:-$(date +%Y%m%d-%H%M%S)-$$}/artifacts}`

Naming: `NN-<phase>.<ext>` where NN is the phase order.
Change-flow examples: `01-design.md`, `02-review-security.json`,
`03-implement.md`, `04-review-consensus.md`, `05-docs.md`.
Research-flow examples: `01-research.md`, `02-research-synthesis.md`.

## Read side

1. Parse `handoff_envelope` JSON from the prompt.
2. For every path supplied in `inputs.artifact_paths`, read the file before
   starting work and treat its contents as authoritative context.
3. If any supplied path is missing, stop and return an error naming the file.

## Write side

Use `writing-voice` for prose in summaries and artifacts. Preserve the required
schemas, output limits, and internal evidence; do not add prose outside JSON.

- Output ≤2KB and not referenced by later phases → return inline.
- Output >2KB OR referenced by later phases → write to `${ARTIFACTS_DIR}/NN-<phase>.<ext>`,
  return `{"path": "...", "summary": "<=200 chars", "verdict": "..."}`.
- Panel members (`consensus_role: panel-member`) and fast-path single reviewers
  (`consensus_role: single`) always return the JSON consensus schema (see
  `consensus-panel` skill), never prose. Both values also mean the reviewer is
  already dispatched: it reviews directly and must not select models or
  dispatch reviewers of its own. Only `primary` may fan out.

## Ambiguity

If the envelope is missing `goal`, `phase`, or (outside `pr-review`) a
non-empty `acceptance_criteria` array, respond with 1–3 clarifying questions
and stop. For `flow: pr-review`, use the PR body and linked issues as the
acceptance-criteria source; unclear intent is review feedback to return to the
calling agent, not a reason for a panel member to halt.
