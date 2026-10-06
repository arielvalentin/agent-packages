# coordinator

Coordinator workflow package with a direct-work fast path and conditional
delegation/review policies.

## Includes

- Agent:
  - `coordinator`
- Skills:
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

## Intent

Use this package when you want a policy-driven coordinator that handles bounded
work directly, delegates only when separate context helps, and reserves
consensus or adversarial review for explicit or high-risk work.

Routine code work follows `inspect -> edit -> targeted validation -> final
response`, normally with no review gate and never more than one optional review
gate. One objective has one orchestration owner: either a delegated coordinator
or a parent managing narrow workers, never both.

`human-interaction-safeguard` is the source of truth for public interaction
safety: human-authored and unknown-actor GitHub comments stop automation and
are routed to the user for a direct response, while verified bot/app feedback
may continue through automated review flows. `acting-on-behalf` enforces the
posting backstop.

When personal credentials or explicit user attribution require disclosure,
append a blank line and `> _AI Assisted._` after the supplied body. The
disclaimer needs no username, model, or provider lookup.
