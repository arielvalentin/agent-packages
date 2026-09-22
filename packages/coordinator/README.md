# coordinator

Coordinator workflow package for delegated agent orchestration and gated reviews.

## Includes

- Agent:
  - `coordinator`
- Skills:
  - `acting-on-behalf`
  - `adversarial-review`
  - `consensus-panel`
  - `handoff-envelope`
  - `pr-feedback-review`
  - `pr-lifecycle`
  - `pr-review-protocol`
  - `resolve-github-user`
  - `review-fix-loop`
  - `stage-pr`
  - `tech-research`

## Intent

Use this package when you want a policy-driven coordinator that dispatches specialist agents, runs consensus review panels, and enforces review gates.

`acting-on-behalf` is the source of truth for public human-interaction safety:
human-authored and unknown-actor GitHub comments stop automation and are routed
to the user for a direct response, while verified bot/app feedback may continue
through automated review flows.
