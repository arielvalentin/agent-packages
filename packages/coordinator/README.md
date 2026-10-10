# coordinator

> **Deprecated:** The coordinator agent and mandatory coordinator routing are
> no longer recommended. Prefer direct agent execution, delegating only when
> the task benefits from specialist context.

The package remains installable for compatibility. Existing consumers can
continue invoking the legacy agent, and its bundled shared skills are not
deprecated or removed.

The final published release is
[`coordinator-v0.14.0`](https://github.com/arielvalentin/agent-packages/releases/tag/coordinator-v0.14.0).
Coordinator is no longer part of ongoing release automation.

Future shared-skill changes belong in [agent-defaults](../agent-defaults/README.md).
The copies here are frozen compatibility snapshots, not the canonical source.

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

## Compatibility and migration

Remove mandatory coordinator routing from consumer instructions and invoke
the appropriate agent directly. The agent name and legacy workflow remain
unchanged for consumers that still select it.

Replace this dependency with the skills-only `agent-defaults` package, then
remove mandatory coordinator routing. `development-workflow` uses
`handoff-envelope` and `pr-lifecycle`; `code-reviewers` uses
`handoff-envelope` and `consensus-panel`. Those packages do not bundle these
skills themselves. `agent-defaults` supplies all 12 shared skills, including
the public-interaction safeguards below. Avoid installing both packages unless
you still need the legacy agent, because the skill names overlap.

`human-interaction-safeguard` is the source of truth for public interaction
safety: human-authored and unknown-actor GitHub comments stop automation and
are routed to the user for a direct response, while verified bot/app feedback
may continue through automated review flows. `acting-on-behalf` enforces the
posting backstop.

When personal credentials or explicit user attribution require disclosure,
append a blank line and `> _AI Assisted._` after the supplied body. The
disclaimer needs no username, model, or provider lookup.
