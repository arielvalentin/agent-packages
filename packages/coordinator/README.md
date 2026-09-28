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
  - `human-interaction-safeguard`
  - `pr-feedback-review`
  - `pr-lifecycle`
  - `pr-review-protocol`
  - `resolve-github-user`
  - `review-fix-loop`
  - `stage-pr`
  - `tech-research`

## Intent

Use this package when you want a policy-driven coordinator that dispatches specialist agents, runs consensus review panels, and enforces review gates.

`human-interaction-safeguard` is the source of truth for public interaction
safety: human-authored and unknown-actor GitHub comments stop automation and
are routed to the user for a direct response, while verified bot/app feedback
may continue through automated review flows. `acting-on-behalf` enforces the
posting backstop.

When required by personal credentials or explicit user attribution, the final
disclaimer is `> _AI-assisted._` (or a referenced `[^ai]: AI-assisted.`
footnote), with no username, model, or provider metadata. Skip lookups only
when they serve solely to compose the disclaimer; substantive attribution may
still need identity resolution. Unknown posting provenance requires pausing
and asking before posting.
