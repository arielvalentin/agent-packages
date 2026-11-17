# Package catalog

This document is the authoritative inventory of installable packages in this repository.

## Package compatibility

The package manifests do not declare companion-package relationships. Add each
required package to the consuming repository's APM dependency list. Use an
`agent-defaults` release that contains the shared skills required by its
companions; `agent-defaults-v0.1.0` does not include `writing-voice`.

| Package | Companion | Requirement and behavior |
| --- | --- | --- |
| `development-workflow` | `agent-defaults` | Required for the shared handoff, lifecycle, writing, and safety/review skills used by its agents. |
| `code-reviewers` | `agent-defaults` | Required for the shared handoff, `consensus-panel`, writing, and safety/review skills used by its agents. |
| `agent-defaults` | `code-reviewers` | Optional. `code-reviewers` supplies `datadog-url-router`; without it, the Datadog gate stops access and reports that the skill is unavailable. |

## personal-agents

- Path: `packages/personal-agents`
- Manifest: `packages/personal-agents/apm.yml`
- Purpose: personal Awesome Copilot source variants without model presets
- Primitives: [three agents](../packages/personal-agents/README.md#includes);
  names, tools and bodies preserved
- License: upstream MIT, with pinned source and SHA-256 provenance
- Consumers: replace the matching three supplier dependencies, not same-name
  shadowing; see [installation](../packages/personal-agents/README.md#install)

## agent-defaults

- Path: `packages/agent-defaults`
- Manifest: `packages/agent-defaults/apm.yml`
- Purpose: repository-first defaults and shared skills for direct execution, safe public
  interactions, research, and reviews
- Primitives: [Repository instructions and shared skills](../packages/agent-defaults/README.md#includes), no agents
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
- Purpose: optional architecture advice and implementation for code/config/script changes
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
