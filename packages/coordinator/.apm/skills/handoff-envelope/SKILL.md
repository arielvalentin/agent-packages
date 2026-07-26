---
name: handoff-envelope
description: >
  Parse the handoff envelope from a coordinator prompt and write outputs —
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
  "flow": "feature|bugfix|refactor|research",
  "phase": "design|implement|review-correctness|review-security|review-perf|review-style|review-arch|docs",
  "task_id": "<coordinator-assigned>",
  "goal": "one-line objective",
  "inputs": {
    "from_agent": "<name>",
    "artifact_paths": ["..."],
    "summary": "<=200 chars"
  },
  "constraints": ["..."],
  "consensus_role": "primary|panel-member|single",
  "model_index": "1|2|3"
}
```

## Artifacts directory

`${ARTIFACTS_DIR:=$HOME/.copilot/session-state/${COPILOT_SESSION_ID:-$(date +%Y%m%d-%H%M%S)-$$}/artifacts}`

Naming: `NN-<phase>.<ext>` where NN is the phase order.
Examples: `01-design.md`, `02-security-review.json`, `03-impl-summary.md`,
`04-review-consensus.md`, `05-docs.md`.

## Read side

1. Parse `handoff_envelope` JSON from the prompt.
2. For each path in `inputs.artifact_paths`, read the file and treat its
   contents as authoritative context.
3. If any path is missing, stop and return an error naming the missing file.

## Write side

- Output ≤2KB and not referenced by later phases → return inline.
- Output >2KB OR referenced by later phases → write to `${ARTIFACTS_DIR}/NN-<phase>.<ext>`,
  return `{"path": "...", "summary": "<=200 chars", "verdict": "..."}`.
- Panel members (`consensus_role: panel-member`) always return the JSON
  consensus schema (see `consensus-panel` skill), never prose.

## Ambiguity

If the envelope is missing `goal`, `phase`, or acceptance criteria,
respond with 1–3 clarifying questions and stop. Never guess.
