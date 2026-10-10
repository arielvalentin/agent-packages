# agent-defaults

Skills-only defaults for direct agent execution. This package installs no
coordinator agent and requires no mandatory coordinator routing.

## Includes

- `acting-on-behalf`
- `adversarial-review`
- `consensus-panel`
- `handoff-envelope`
- `human-interaction-safeguard`
- `pr-feedback-review`
- `pr-lifecycle`
- `pr-review-protocol`
- `resolve-github-user`
- `review-fix-loop`
- `stage-pr`
- `tech-research`

## Install and use

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/agent-defaults#agent-defaults-v0.1.0
```

Run `apm install`. Invoke the appropriate agent directly and load skills when
their triggers apply. Delegate only when specialist context helps the task.
The calling agent owns task scope, review handoffs, synthesis, and user gates.
For review dispatches, the caller records `explicit_multi_review` as a JSON
boolean in every handoff; missing or invalid values fail closed.

Install this package alongside `development-workflow` or `code-reviewers`,
which reference its handoff, lifecycle, and review skills. These agent packages
do not bundle shared skills themselves.

## Migration from coordinator

Replace the coordinator dependency with `agent-defaults` and remove mandatory
coordinator routing from consumer instructions. Preserve public-interaction
gates and caller-owned review handoff fields. The legacy coordinator package
retains frozen skill snapshots for compatibility; this package is the canonical
source for future shared-skill changes.

Do not install both packages unless you need the legacy agent: their skill
names overlap. Remove a separate `stage-pr` dependency if it duplicates the
skill supplied here, and use this package's version intentionally.

## Safeguards

`human-interaction-safeguard` owns actor and conversation-chain classification
for existing public GitHub interactions. `acting-on-behalf` is the posting and
attribution backstop. Human or unknown interactions stop automated replies and
resolution; verified bot/app chains may follow the normal feedback flow.

Review handoff validation does not replace public-interaction safeguards.
Research remains source-bounded fact finding, not duplicated consensus work.
