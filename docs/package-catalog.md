# Package catalog

This document is the authoritative inventory of installable packages in this repository.

## agent-defaults

- Path: `packages/agent-defaults`
- Manifest: `packages/agent-defaults/apm.yml`
- Purpose: canonical shared skills for direct agent execution, safe public
  interactions, research, and reviews
- Primitives: [12 skills](../packages/agent-defaults/README.md#includes), no agents
- Consumers: install alongside development and review agents that reference
  its skills; no mandatory coordinator routing

## coordinator

- Path: `packages/coordinator`
- Manifest: `packages/coordinator/apm.yml`
- Status: the coordinator agent is deprecated; the package remains installable
  for compatibility, and its shared skills are not deprecated
- Purpose: legacy orchestration and governance flow, with frozen shared-skill
  compatibility snapshots; new skill changes belong in `agent-defaults`
- Primitives:
  - Agent: `coordinator`
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

Prefer direct agent execution instead of mandatory coordinator routing.
Replace this dependency with `agent-defaults`; see
[compatibility and migration](../packages/coordinator/README.md#compatibility-and-migration).

## development-workflow

- Path: `packages/development-workflow`
- Manifest: `packages/development-workflow/apm.yml`
- Purpose: design-to-implementation workflow for code/config/script changes
- Companion: `agent-defaults` supplies required handoff and lifecycle skills
- Primitives:
  - Agents:
    - `system-architect`
    - `implementer`

## code-reviewers

- Path: `packages/code-reviewers`
- Manifest: `packages/code-reviewers/apm.yml`
- Purpose: combined performance and style code-review workflow
- Companion: `agent-defaults` supplies required handoff and JSON verdict skills
- Primitives:
  - Agents:
    - `perf-reviewer`
    - `style-reviewer`
  - Skill:
    - `datadog-url-router`
